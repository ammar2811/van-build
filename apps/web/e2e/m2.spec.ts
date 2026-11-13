import { expect, type Page, test } from "@playwright/test";
import {
  centre,
  dragBetween,
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

/** A whole number shown with thousands separators, as a number. */
async function shown(page: Page, testId: string): Promise<number> {
  const text = (await page.getByTestId(testId).textContent()) ?? "";
  return Number(text.replace(/[^0-9.-]/g, ""));
}

test.describe("weight panel", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name === "phone", "Phones use the weight strip and sheet");
  });

  test("shows axle loads, total and payload for the starter layout", async ({ page }) => {
    // Empty van 918.5 + 1321.8 kg, build 210 kg, two people 160 kg.
    await expect(page.getByTestId("weight-gross-load")).toHaveText("2,610");
    // GVWR 4105 kg.
    await expect(page.getByTestId("weight-payload")).toHaveText("1,495 kg");
    await expect(page.getByTestId("weight-status")).toHaveText("Within limits");
    const front = await shown(page, "weight-front-load");
    const rear = await shown(page, "weight-rear-load");
    expect(Math.abs(front + rear - 2610)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("cg-marker")).toBeVisible();
  });

  test("axle loads follow a part while it is being dragged", async ({ page }) => {
    const rearBefore = await shown(page, "weight-rear-load");
    const frontBefore = await shown(page, "weight-front-load");
    // The fridge sits near the front; drag it to the rear end of the aisle and hold it there.
    const fridge = centre(await partRect(page, "fridge"));
    const bed = await partRect(page, "bed");
    const galley = await partRect(page, "galley");
    const target = { x: bed.x - 30, y: galley.y - 60 };
    await page.mouse.move(fridge.x, fridge.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 10 });

    // Still holding the mouse button: the panel already shows the new balance.
    await expect.poll(() => shown(page, "weight-rear-load")).toBeGreaterThan(rearBefore);
    expect(await shown(page, "weight-front-load")).toBeLessThan(frontBefore);
    await expect(page.getByTestId("weight-gross-load")).toHaveText("2,610");
    await page.mouse.up();
    expect(await shown(page, "weight-rear-load")).toBeGreaterThan(rearBefore);
  });

  test("people and water change the totals", async ({ page }) => {
    await expect(page.getByTestId("occupants")).toHaveText("2");
    await page.getByTestId("occupants-less").click();
    await expect(page.getByTestId("weight-gross-load")).toHaveText("2,530");
    await page.getByTestId("occupants-more").click();
    await expect(page.getByTestId("occupants-more")).toBeDisabled();

    await page.getByTestId("occupant-mass").fill("100");
    await page.getByTestId("occupant-mass").press("Enter");
    await expect(page.getByTestId("weight-gross-load")).toHaveText("2,650");

    // Drain the 100 L water tank.
    await page.getByTestId("fill-water").fill("0");
    await expect(page.getByTestId("weight-gross-load")).toHaveText("2,550");
    await page.getByTestId("undo").click();
    await expect(page.getByTestId("weight-gross-load")).toHaveText("2,650");
  });

  test("your own vehicle numbers replace the catalog's, and can be reset", async ({ page }) => {
    await page.getByTestId("weight-vehicle").locator("summary").click();
    const gvwr = page.getByTestId("vehicle-gvwr");
    await expect(gvwr).toHaveValue("4105 kg");

    await gvwr.fill("2500");
    await gvwr.press("Enter");
    await expect(page.getByTestId("weight-status")).toHaveText("Over a limit");
    await expect(page.getByTestId("weight-payload")).toHaveText("110 kg");
    await expect(page.getByTestId("weight-gross")).toHaveAttribute("data-status", "over");

    await page.getByTestId("vehicle-gvwr-reset").click();
    await expect(gvwr).toHaveValue("4105 kg");
    await expect(page.getByTestId("weight-status")).toHaveText("Within limits");

    // A scale ticket: a heavier empty rear axle.
    await page.getByTestId("vehicle-curbRear").fill("3300 lb");
    await page.getByTestId("vehicle-curbRear").press("Enter");
    await expect(page.getByTestId("vehicle-curbRear")).toHaveValue("1496.9 kg");
    await waitForSave(page);
    await page.reload();
    await page.getByTestId("weight-vehicle").locator("summary").click();
    await expect(page.getByTestId("vehicle-curbRear")).toHaveValue("1496.9 kg");
  });

  test("a part's weight can be overridden and reset", async ({ page }) => {
    await selectPart(page, "fridge");
    const mass = page.getByTestId("field-mass");
    await expect(mass).toHaveValue("21 kg");
    await mass.fill("50");
    await mass.press("Enter");
    await expect(page.getByTestId("weight-gross-load")).toHaveText("2,639");
    await page.getByTestId("field-mass-reset").click();
    await expect(mass).toHaveValue("21 kg");
    await expect(page.getByTestId("weight-gross-load")).toHaveText("2,610");
  });

  test("switching van keeps the layout and changes the numbers", async ({ page }) => {
    await page.getByTestId("weight-vehicle").locator("summary").click();
    const floorBefore = await page.locator(".plan-floor").boundingBox();
    await page.getByTestId("van-select").selectOption("sprinter-170-high-roof");
    await expect(page.locator(".toolbar-shell")).toHaveText("Sprinter 170 High Roof");
    await expect(page.locator("[data-part-name]")).toHaveCount(5);
    // Empty van 1001.5 + 1383.5 kg, plus the same 370 kg.
    await expect(page.getByTestId("weight-gross-load")).toHaveText("2,755");
    const floorAfter = await page.locator(".plan-floor").boundingBox();
    expect(floorAfter?.height).toBeLessThan(floorBefore?.height ?? 0);

    await page.getByTestId("undo").click();
    await expect(page.locator(".toolbar-shell")).toHaveText("Sprinter 144 High Roof");
  });
});

test.describe("parts inside furniture", () => {
  test("a battery can sit inside a cabinet and travels with it", async ({ page }) => {
    await page.getByTestId("add-battery-200ah").click();
    await expect(page.getByTestId("inspector-name")).toHaveText("Battery 200 Ah");
    const battery = centre(await selectedRect(page));
    const galley = centre(await partRect(page, "galley"));
    await dragBetween(page, battery, galley);
    await expect(page.locator('[data-flagged="true"]')).toHaveCount(0);
    await expect(page.getByTestId("field-elevation")).toHaveValue("0 mm");

    // It really is inside the galley's footprint, and it is drawn on top so it can be picked.
    const inside = await selectedRect(page);
    const cabinet = await partRect(page, "galley");
    expect(inside.x).toBeGreaterThanOrEqual(cabinet.x - 0.5);
    expect(inside.x + inside.width).toBeLessThanOrEqual(cabinet.x + cabinet.width + 0.5);
    expect(inside.y).toBeGreaterThanOrEqual(cabinet.y - 0.5);
    expect(inside.y + inside.height).toBeLessThanOrEqual(cabinet.y + cabinet.height + 0.5);

    // Move the cabinet by typing: the battery goes with it.
    await page.keyboard.press("Escape");
    const corner = { x: cabinet.x + 4, y: cabinet.y + 4 };
    await page.mouse.click(corner.x, corner.y);
    await expect(page.getByTestId("inspector-name")).toHaveText("Galley cabinet");
    await page.getByTestId("field-driver").fill("300");
    await page.getByTestId("field-driver").press("Enter");
    const movedCabinet = await partRect(page, "galley");
    await page.keyboard.press("Escape");
    const movedBattery = await page
      .locator('[data-part-name="Battery 200 Ah"] .part-body')
      .evaluate((element) => {
        const shape = element as SVGGraphicsElement;
        const svg = shape.ownerSVGElement?.getBoundingClientRect();
        const box = shape.getBBox();
        return { x: (svg?.left ?? 0) + box.x, y: (svg?.top ?? 0) + box.y };
      });
    expect(movedBattery.x - movedCabinet.x).toBeCloseTo(inside.x - cabinet.x, 0);
    expect(movedBattery.y - movedCabinet.y).toBeCloseTo(inside.y - cabinet.y, 0);
    await expect(page.locator('[data-flagged="true"]')).toHaveCount(0);
  });
});

test.describe("weight on phones", () => {
  test("the strip shows the three loads and opens the full panel", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "Wide screens show the panel beside the plan");
    await expect(page.getByTestId("weight-panel")).toHaveCount(0);
    await expect(page.getByTestId("strip-gross")).toHaveText("64%");

    await page.getByTestId("weight-strip").click();
    const dialog = page.getByTestId("weight-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("weight-gross-load")).toHaveText("2,610");
    await dialog.getByTestId("occupants-less").click();
    await expect(dialog.getByTestId("weight-gross-load")).toHaveText("2,530");
    await page.getByTestId("weight-dialog-close").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("strip-gross")).toHaveText("62%");
  });
});

test.describe("designs saved by an older version", () => {
  test("a version 1 design opens with a default load case", async ({ page }) => {
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("vanbuild", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const transaction = request.result.transaction("designs", "readwrite");
            transaction.objectStore("designs").put(
              {
                schemaVersion: 1,
                name: "From last month",
                shellId: "sprinter-144-high-roof",
                chassisId: "worker-rwd-diesel",
                parts: {
                  old: {
                    id: "old",
                    defId: "bench-seat",
                    defVersion: 1,
                    params: { width: 1000, depth: 500, height: 480 },
                    position: { x: 1500, y: 0, z: 0 },
                    yaw: 0,
                    locks: { position: false, params: [] },
                    overrides: {},
                  },
                },
              },
              "current",
            );
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
          };
        }),
    );
    await page.reload();
    await expect(page.getByTestId("design-name")).toHaveText("From last month");
    await expect(page.locator("[data-part-name]")).toHaveCount(1);
    await expect(page.getByTestId("notice")).toHaveCount(0);
  });
});
