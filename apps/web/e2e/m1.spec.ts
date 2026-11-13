import { expect, test } from "@playwright/test";
import {
  centre,
  dragBetween,
  dragPart,
  gapToWall,
  partRect,
  selectedRect,
  selectPart,
  waitForSave,
  watchForErrors,
} from "./helpers";

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = watchForErrors(page);
  await page.goto("/");
  await expect(page.getByTestId("plan")).toBeVisible();
});

test.afterEach(() => {
  expect(errors, "page errors").toEqual([]);
});

test.describe("saved on this device", () => {
  test("a layout is still there after a reload", async ({ page }) => {
    const gap = await gapToWall(page, "fridge", "passenger");
    await dragPart(page, "fridge", "passenger", gap - 5);
    // On phones the parts tray comes back once nothing is selected.
    await page.keyboard.press("Escape");
    await page.getByTestId("add-bench-seat").click();
    await expect(page.locator("[data-part-name]")).toHaveCount(6);
    await waitForSave(page);

    await page.reload();
    await expect(page.locator("[data-part-name]")).toHaveCount(6);
    await selectPart(page, "fridge");
    await expect(page.getByTestId("field-driver")).toHaveValue("1278 mm");
    // History is per session: a fresh page has nothing to undo.
    await expect(page.getByTestId("undo")).toBeDisabled();
  });

  test("the design can be renamed, and the name is kept", async ({ page }) => {
    await page.getByTestId("design-name").click();
    const input = page.getByTestId("design-name-input");
    await input.fill("Weekender");
    await input.press("Enter");
    await expect(page.getByTestId("design-name")).toHaveText("Weekender");

    await page.getByTestId("design-name").click();
    await page.getByTestId("design-name-input").fill("Thrown away");
    await page.getByTestId("design-name-input").press("Escape");
    await expect(page.getByTestId("design-name")).toHaveText("Weekender");

    await waitForSave(page);
    await page.reload();
    await expect(page.getByTestId("design-name")).toHaveText("Weekender");
  });

  test("a saved design that cannot be read is set aside, not silently dropped", async ({
    page,
  }) => {
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("vanbuild", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const transaction = request.result.transaction("designs", "readwrite");
            transaction
              .objectStore("designs")
              .put({ schemaVersion: 1, parts: "broken" }, "current");
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
          };
        }),
    );
    await page.reload();
    await expect(page.getByTestId("notice")).toContainText("kept as a backup");
    await expect(page.locator("[data-part-name]")).toHaveCount(5);

    const keys = await page.evaluate(
      () =>
        new Promise<string[]>((resolve, reject) => {
          const request = indexedDB.open("vanbuild", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const all = request.result
              .transaction("designs", "readonly")
              .objectStore("designs")
              .getAllKeys();
            all.onsuccess = () => resolve(all.result.map(String));
          };
        }),
    );
    expect(keys.some((key) => key.startsWith("backup:"))).toBe(true);

    await page.getByTestId("notice").getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByTestId("notice")).toHaveCount(0);
  });
});

test.describe("stacking", () => {
  test("a crate dragged over a cabinet lands on top of it", async ({ page }) => {
    await page.getByTestId("add-storage-crate").click();
    await expect(page.getByTestId("field-elevation")).toHaveValue("0 mm");

    const crate = centre(await selectedRect(page));
    const galley = centre(await partRect(page, "galley"));
    await dragBetween(page, crate, galley);
    // The galley cabinet is 900 mm tall.
    await expect(page.getByTestId("field-elevation")).toHaveValue("900 mm");
    await expect(page.locator('[data-flagged="true"]')).toHaveCount(0);

    // Dragged back off, it returns to the floor.
    const fridge = await partRect(page, "fridge");
    const onTop = centre(await selectedRect(page));
    const orientation = await page.getByTestId("plan").getAttribute("data-orientation");
    const aisle =
      orientation === "portrait"
        ? { x: fridge.x + fridge.width * 3, y: onTop.y }
        : { x: onTop.x, y: fridge.y - fridge.height * 2 };
    await dragBetween(page, onTop, aisle);
    await expect(page.getByTestId("field-elevation")).toHaveValue("0 mm");
  });

  test("what rests on a part moves with it, and drops when it is deleted", async ({ page }) => {
    // Bed platform and mattress share a footprint; click a corner clear of the water tank.
    const bed = await partRect(page, "bed");
    const corner = { x: bed.x + bed.width * 0.15, y: bed.y + bed.height * 0.15 };
    await page.mouse.click(corner.x, corner.y);
    await expect(page.getByTestId("inspector-name")).toHaveText("Mattress");
    await expect(page.getByTestId("field-elevation")).toHaveValue("760 mm");
    await page.mouse.click(corner.x, corner.y);
    await expect(page.getByTestId("inspector-name")).toHaveText("Bed platform");

    const front = page.getByTestId("field-front");
    await front.fill("-200");
    await front.press("Enter");
    const movedBed = await partRect(page, "bed");
    const movedMattress = await partRect(page, "mattress");
    // Forward is left on wide screens and up on phones.
    expect(Math.hypot(movedBed.x - bed.x, movedBed.y - bed.y)).toBeGreaterThan(5);
    expect(movedMattress.x).toBeCloseTo(movedBed.x, 1);
    expect(movedMattress.y).toBeCloseTo(movedBed.y, 1);

    // One undo step puts both back.
    await page.getByTestId("undo").click();
    expect(await partRect(page, "mattress")).toEqual(bed);
    expect(await partRect(page, "bed")).toEqual(bed);

    await page.getByTestId("delete").click();
    await expect(page.getByTestId("part-mattress")).toHaveAttribute("data-elevation", "0");
  });
});

test.describe("locking", () => {
  test("a locked part cannot be dragged, edited or deleted", async ({ page }) => {
    await selectPart(page, "fridge");
    await page.getByTestId("lock").click();
    await expect(page.getByTestId("part-fridge")).toHaveAttribute("data-locked", "true");
    await expect(page.getByTestId("lock")).toHaveAttribute("aria-pressed", "true");
    for (const field of ["field-width", "field-front", "field-elevation"]) {
      await expect(page.getByTestId(field)).toBeDisabled();
    }
    await expect(page.getByTestId("rotate")).toBeDisabled();
    await expect(page.getByTestId("delete")).toBeDisabled();

    const before = await partRect(page, "fridge");
    await dragPart(page, "fridge", "passenger", 60);
    await page.keyboard.press("Delete");
    await page.keyboard.press("ArrowUp");
    const after = await partRect(page, "fridge");
    expect(after).toEqual(before);
    await expect(page.locator("[data-part-name]")).toHaveCount(5);

    await page.getByTestId("lock").click();
    await expect(page.getByTestId("field-width")).toBeEnabled();
    await expect(page.getByTestId("part-fridge")).toHaveAttribute("data-locked", "false");
  });

  test("duplicating puts an unlocked copy next to the original", async ({ page }) => {
    await selectPart(page, "fridge");
    await page.getByTestId("lock").click();
    await page.getByTestId("duplicate").click();
    await expect(page.locator("[data-part-name]")).toHaveCount(6);
    await expect(page.locator('[data-part-name="Fridge 85 L"]')).toHaveCount(2);
    await expect(page.getByTestId("inspector-name")).toHaveText("Fridge 85 L");
    await expect(page.getByTestId("field-width")).toBeEnabled();
    await expect(page.locator('[data-flagged="true"]')).toHaveCount(0);
    await expect(page.getByTestId("part-fridge")).toHaveAttribute("data-selected", "false");
  });
});

test.describe("typed gaps", () => {
  test("pressing a gap label lets you type the gap", async ({ page }) => {
    await selectPart(page, "fridge");
    // 1778 mm floor width minus the 500 mm fridge against the driver side.
    const label = page.locator('[data-gap="passenger"]');
    await expect(label.locator("text")).toHaveText("1278 mm");
    await label.click();
    const input = page.getByTestId("gap-input");
    await expect(input).toBeFocused();
    await input.fill("1000");
    await input.press("Enter");
    await expect(input).toHaveCount(0);
    await expect(page.getByTestId("field-driver")).toHaveValue("278 mm");
    await expect(page.locator('[data-gap="passenger"] text')).toHaveText("1000 mm");

    // Escape leaves the gap as it was.
    await page.locator('[data-gap="passenger"]').click();
    await page.getByTestId("gap-input").fill("5");
    await page.getByTestId("gap-input").press("Escape");
    await expect(page.getByTestId("field-driver")).toHaveValue("278 mm");
  });
});

test.describe("zoom", () => {
  test("the buttons zoom in and fit", async ({ page }) => {
    const plan = page.getByTestId("plan");
    await expect(plan).toHaveAttribute("data-zoom", "1.00");
    await expect(page.getByTestId("zoom-fit")).toBeDisabled();
    const before = await partRect(page, "galley");

    await page.getByTestId("zoom-in").click();
    await expect(plan).toHaveAttribute("data-zoom", "1.50");
    const zoomed = await partRect(page, "galley");
    expect(zoomed.width).toBeCloseTo(before.width * 1.5, 0);

    await page.getByTestId("zoom-fit").click();
    await expect(plan).toHaveAttribute("data-zoom", "1.00");
    expect((await partRect(page, "galley")).width).toBeCloseTo(before.width, 0);
  });

  test("the mouse wheel zooms around the cursor, and snapping still lands flush", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "phone", "Phones pinch instead");
    const fridge = await partRect(page, "fridge");
    const at = centre(fridge);
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -200);
    await expect(page.getByTestId("plan")).not.toHaveAttribute("data-zoom", "1.00");
    const zoomed = await partRect(page, "fridge");
    expect(zoomed.width).toBeGreaterThan(fridge.width * 1.5);
    // The point under the cursor stays under the cursor (to within pointer rounding).
    expect(Math.abs(centre(zoomed).x - at.x)).toBeLessThan(2);
    expect(Math.abs(centre(zoomed).y - at.y)).toBeLessThan(2);

    const gap = await gapToWall(page, "fridge", "passenger");
    await dragPart(page, "fridge", "passenger", gap - 5);
    await expect(page.getByTestId("field-driver")).toHaveValue("1278 mm");
  });

  test("two fingers pinch to zoom", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "Touch input is exercised on the phone project");
    const plan = await page.getByTestId("plan").boundingBox();
    if (!plan) throw new Error("plan is not on screen");
    const cx = plan.x + plan.width / 2;
    const cy = plan.y + plan.height / 2;
    const client = await page.context().newCDPSession(page);
    const touch = (type: string, spread: number | null) =>
      client.send("Input.dispatchTouchEvent", {
        type: type as "touchStart",
        touchPoints:
          spread === null
            ? []
            : [
                { x: cx - spread, y: cy, id: 0 },
                { x: cx + spread, y: cy, id: 1 },
              ],
      });
    await touch("touchStart", 30);
    for (const spread of [40, 55, 70, 90]) await touch("touchMove", spread);
    await touch("touchEnd", null);

    const zoom = Number(await page.getByTestId("plan").getAttribute("data-zoom"));
    expect(zoom).toBeGreaterThan(2);
    // Nothing was selected or moved by the pinch.
    await expect(page.locator('[data-selected="true"]')).toHaveCount(0);
    await expect(page.getByTestId("undo")).toBeDisabled();
  });
});

test.describe("issues", () => {
  test("problems are listed in the summary and lead to the part", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "phone",
      "The summary is replaced by the parts tray on phones",
    );
    await selectPart(page, "galley");
    await page.getByTestId("field-front").fill("500");
    await page.getByTestId("field-front").press("Enter");
    await page.keyboard.press("Escape");

    const list = page.getByTestId("issue-list");
    await expect(list.getByRole("button")).toHaveCount(2);
    await list
      .getByRole("button", { name: /Galley cabinet/ })
      .first()
      .click();
    await expect(page.getByTestId("inspector-name")).toHaveText(/Galley cabinet|Fridge 85 L/);

    await page.getByTestId("undo").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("issue-list")).toHaveCount(0);
  });

  test("remove all parts can be undone", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "phone",
      "The summary is replaced by the parts tray on phones",
    );
    await page.getByTestId("clear-all").click();
    await expect(page.locator("[data-part-name]")).toHaveCount(0);
    await page.getByTestId("undo").click();
    await expect(page.locator("[data-part-name]")).toHaveCount(5);
  });
});
