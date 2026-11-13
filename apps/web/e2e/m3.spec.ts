import { expect, type Page, test } from "@playwright/test";
import { partRect, watchForErrors } from "./helpers";

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = watchForErrors(page);
  await page.goto("/");
  await expect(page.getByTestId("plan")).toBeVisible();
});

test.afterEach(() => {
  expect(errors, "page errors").toEqual([]);
});

async function showView(page: Page, view: "plan" | "side" | "3d" | "split"): Promise<void> {
  await page.locator("label", { has: page.getByTestId(`view-${view}`) }).click();
  await expect(page.getByTestId(`view-${view}`)).toBeChecked();
}

/**
 * Open a 3D view and wait for it. Returns false where the browser cannot do WebGL (some
 * headless builds): there the app must say so and keep working, which is checked instead.
 */
async function open3d(page: Page, view: "3d" | "split"): Promise<boolean> {
  const webgl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  });
  await showView(page, view);
  if (!webgl) {
    await expect(page.getByTestId("scene3d-unavailable")).toBeVisible();
    await page.getByRole("button", { name: "Back to the plan" }).click();
    await expect(page.getByTestId("plan")).toBeVisible();
    return false;
  }
  await expect(page.locator('[data-testid="scene3d"][data-ready="true"]')).toBeVisible({
    timeout: 20_000,
  });
  return true;
}

/** Page coordinates of a point in the van, as the 3D view currently shows it. */
function project(page: Page, x: number, y: number, z: number) {
  return page.getByTestId("scene3d").evaluate(
    (element, point) =>
      (
        element as HTMLElement & {
          project: (x: number, y: number, z: number) => { x: number; y: number };
        }
      ).project(point[0], point[1], point[2]),
    [x, y, z] as const,
  );
}

// The fridge in the starter layout: 475 x 500 x 830, against the driver-side wall.
const FRIDGE_TOP = { x: 376.5, y: -639, z: 830 };

test.describe("3D view", () => {
  test("shows the same design and selects parts", async ({ page }) => {
    if (!(await open3d(page, "3d"))) return;
    await expect(page.getByTestId("scene3d")).toHaveAttribute("data-parts", "5");
    await expect(page.getByTestId("plan")).toHaveCount(0);

    const fridge = await project(page, FRIDGE_TOP.x, FRIDGE_TOP.y, FRIDGE_TOP.z);
    await page.mouse.click(fridge.x, fridge.y);
    await expect(page.getByTestId("inspector-name")).toHaveText("Fridge 85 L");
    await expect(page.getByTestId("scene3d")).toHaveAttribute("data-selected", "fridge");
  });

  test("dragging in 3D uses the same snapping as the plan", async ({ page }) => {
    if (!(await open3d(page, "3d"))) return;
    const from = await project(page, FRIDGE_TOP.x, FRIDGE_TOP.y, FRIDGE_TOP.z);
    // Aim well past the passenger-side wall: the part must stop flush against it.
    const to = await project(page, FRIDGE_TOP.x, 700, FRIDGE_TOP.z);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 15 });
    await page.mouse.up();

    await expect(page.getByTestId("inspector-name")).toHaveText("Fridge 85 L");
    // 1778 mm floor width minus the 500 mm fridge.
    await expect(page.getByTestId("field-driver")).toHaveValue("1278 mm");
    await expect(page.getByTestId("undo")).toBeEnabled();

    // The plan agrees.
    await showView(page, "plan");
    await expect(page.getByTestId("part-fridge")).toHaveAttribute("data-selected", "true");
    await expect(page.locator('[data-flagged="true"]')).toHaveCount(0);
  });

  test("the reset button is there and orbiting does not move parts", async ({ page }) => {
    if (!(await open3d(page, "3d"))) return;
    const box = await page.getByTestId("scene3d").boundingBox();
    if (!box) throw new Error("3D view is not on screen");
    // Drag on empty space near a corner: that turns the camera, not the design.
    await page.mouse.move(box.x + 20, box.y + box.height - 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + box.height - 60, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId("undo")).toBeDisabled();
    await page.getByTestId("scene3d-reset").click();
    await expect(page.getByTestId("scene3d")).toHaveAttribute("data-parts", "5");
  });
});

test.describe("split view", () => {
  test("plan and 3D sit side by side and stay in step", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "phone", "Phones show one view at a time");
    if (!(await open3d(page, "split"))) return;
    await expect(page.getByTestId("plan")).toBeVisible();

    // Select in the plan: the 3D view follows.
    const fridge = await partRect(page, "fridge");
    await page.mouse.click(fridge.x + fridge.width / 2, fridge.y + fridge.height / 2);
    await expect(page.getByTestId("scene3d")).toHaveAttribute("data-selected", "fridge");

    // Add a part from the list: both views show it.
    await page.getByTestId("add-bench-seat").click();
    await expect(page.getByTestId("scene3d")).toHaveAttribute("data-parts", "6");
    await expect(page.locator("[data-part-name]")).toHaveCount(6);
  });

  test("is not offered on phones", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "Wide screens offer the split view");
    await expect(page.getByTestId("view-split")).toHaveCount(0);
    await expect(page.getByTestId("view-3d")).toHaveCount(1);
  });
});

test.describe("side elevation", () => {
  test("shows heights and selects parts", async ({ page }) => {
    await showView(page, "side");
    await expect(page.getByTestId("side")).toBeVisible();
    await expect(page.locator("[data-part-name]")).toHaveCount(5);

    // The mattress sits on the bed platform, well above the water tank.
    const top = (id: string) =>
      page
        .getByTestId(`side-part-${id}`)
        .locator(".part-body")
        .evaluate((element) => (element as SVGGraphicsElement).getBBox().y);
    expect(await top("mattress")).toBeLessThan(await top("bed"));
    expect(await top("bed")).toBeLessThan(await top("water"));

    const mattress = await page
      .getByTestId("side-part-mattress")
      .locator(".part-body")
      .boundingBox();
    if (!mattress) throw new Error("mattress is not on screen");
    await page.mouse.click(mattress.x + mattress.width / 2, mattress.y + mattress.height / 2);
    await expect(page.getByTestId("inspector-name")).toHaveText("Mattress");
    await expect(page.getByTestId("field-elevation")).toHaveValue("760 mm");

    // Raising it by typing moves it up in the elevation.
    const before = await top("mattress");
    await page.getByTestId("field-elevation").fill("900");
    await page.getByTestId("field-elevation").press("Enter");
    expect(await top("mattress")).toBeLessThan(before);
  });
});
