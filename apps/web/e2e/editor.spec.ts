import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  centre,
  dragPart,
  dragPath,
  gapToWall,
  partRect,
  selectPart,
  setUnits,
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

test("opens with the starter layout and nothing flagged", async ({ page }) => {
  await expect(page.locator("[data-part-name]")).toHaveCount(4);
  await expect(page.locator('[data-flagged="true"]')).toHaveCount(0);
  await expect(page.getByTestId("units-metric")).toBeChecked();
});

test("shows layout totals on wide screens", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "The summary is replaced by the parts tray on phones",
  );
  await expect(page.getByTestId("total-parts")).toHaveText("4");
  // 45 + 38 + 21 + (6 + 100 L of water) kg.
  await expect(page.getByTestId("total-mass")).toHaveText("210.0 kg");
  await expect(page.getByTestId("total-price")).toHaveText("$2,030");
});

test("dragging a part near a wall snaps it flush", async ({ page }) => {
  const gap = await gapToWall(page, "fridge", "passenger");
  // Stop 5 px short of the wall: close enough that the snap finishes the job.
  await dragPart(page, "fridge", "passenger", gap - 5, false);
  await expect(page.locator('[data-testid="guides"] line[data-kind="wall"]')).toHaveCount(1);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-name")).toHaveText("Fridge 85 L");
  // The floor is 1778 mm wide and the fridge is 500 mm deep.
  await expect(page.getByTestId("field-driver")).toHaveValue("1278 mm");
  await expect(page.getByTestId("guides")).toHaveCount(0);
  await expect(page.getByTestId("undo")).toBeEnabled();
});

test("a part cannot be dragged into another part", async ({ page }) => {
  // The galley cabinet sits directly behind the fridge.
  await dragPart(page, "fridge", "rear", 120);
  await expect(page.locator('[data-flagged="true"]')).toHaveCount(0);
  await expect(page.getByTestId("inspector-issues")).toHaveCount(0);
});

test("typing an exact distance moves the part, and overlaps are flagged not refused", async ({
  page,
}) => {
  await selectPart(page, "galley");
  const front = page.getByTestId("field-front");
  await expect(front).toHaveValue("614 mm");

  await front.fill("500");
  await front.press("Enter");
  await expect(front).toHaveValue("500 mm");
  await expect(page.getByTestId("inspector-issues")).toHaveText("Overlaps Fridge 85 L.");
  await expect(page.getByTestId("part-galley")).toHaveAttribute("data-flagged", "true");
  await expect(page.getByTestId("part-fridge")).toHaveAttribute("data-flagged", "true");

  await page.getByTestId("undo").click();
  await expect(front).toHaveValue("614 mm");
  await expect(page.locator('[data-flagged="true"]')).toHaveCount(0);

  await page.getByTestId("redo").click();
  await expect(front).toHaveValue("500 mm");
});

test("length fields accept sums, relative nudges and reject nonsense", async ({ page }) => {
  await selectPart(page, "galley");
  const width = page.getByTestId("field-width");

  await width.fill("1000 + 18");
  await width.press("Enter");
  await expect(width).toHaveValue("1018 mm");

  await width.fill("-18");
  await width.press("Enter");
  await expect(width).toHaveValue("1000 mm");

  await width.fill("wide");
  await width.press("Enter");
  await expect(width).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toContainText("Cannot read");
  await width.press("Escape");
  await expect(width).toHaveValue("1000 mm");

  // Resizing keeps the cabinet against the driver-side wall.
  const depth = page.getByTestId("field-depth");
  await depth.fill("400");
  await depth.press("Enter");
  await expect(page.getByTestId("field-driver")).toHaveValue("0 mm");
});

test("switching units converts every value without changing the design", async ({ page }) => {
  await selectPart(page, "galley");
  await setUnits(page, "imperial");
  const width = page.getByTestId("field-width");
  await expect(width).toHaveValue('47 1/4"');

  await width.fill('48"');
  await width.press("Enter");
  await setUnits(page, "metric");
  await expect(width).toHaveValue("1219.2 mm");
});

test("keyboard: rotate, nudge, delete, undo and redo", async ({ page }) => {
  await selectPart(page, "fridge");
  const before = await partRect(page, "fridge");
  await page.keyboard.press("r");
  const after = await partRect(page, "fridge");
  // 475 x 500 becomes 500 x 475 on screen.
  expect(Math.sign(after.width - after.height)).toBe(-Math.sign(before.width - before.height));
  // It was against the driver-side wall and stays there.
  await expect(page.getByTestId("field-driver")).toHaveValue("0 mm");

  await page.keyboard.press("Delete");
  await expect(page.locator("[data-part-name]")).toHaveCount(3);
  await page.keyboard.press("Control+z");
  await expect(page.locator("[data-part-name]")).toHaveCount(4);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator("[data-part-name]")).toHaveCount(3);
});

test("adding parts drops them in a free spot", async ({ page }) => {
  await page.getByTestId("add-bench-seat").click();
  await expect(page.getByTestId("inspector-name")).toHaveText("Bench seat");
  await expect(page.locator("[data-part-name]")).toHaveCount(5);
  await expect(page.locator('[data-flagged="true"]')).toHaveCount(0);
});

test("an overhead cabinet stops at the leaning wall, not the floor outline", async ({ page }) => {
  await page.getByTestId("add-overhead-cabinet").click();
  await expect(page.getByTestId("inspector-name")).toHaveText("Overhead cabinet");
  // The wall at cabinet height is shown, inside the floor outline.
  await expect(page.getByTestId("wall-at-height")).toBeVisible();

  const driver = page.getByTestId("field-driver");
  await driver.fill("0");
  await driver.press("Enter");
  await expect(page.locator('[data-flagged="true"]')).toHaveCount(0);

  const cabinet = await page.locator(".part.is-selected .part-body").boundingBox();
  const floor = await page.locator(".plan-floor").boundingBox();
  const orientation = await page.getByTestId("plan").getAttribute("data-orientation");
  if (!cabinet || !floor) throw new Error("plan is not on screen");
  const gap =
    orientation === "portrait"
      ? cabinet.x - floor.x
      : floor.y + floor.height - (cabinet.y + cabinet.height);
  // Flush with the wall up there, which leaves a visible gap to the wall at floor level.
  expect(gap).toBeGreaterThan(4);
});

test("clicking a selected part again selects what is underneath it", async ({ page }) => {
  // The water tank sits under the raised bed platform.
  const point = centre(await partRect(page, "water"));
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId("inspector-name")).toHaveText("Bed platform");
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId("inspector-name")).toHaveText("Fresh water 100 L");
});

test("exports a vector PDF of the floor plan", async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-pdf").click(),
  ]);
  expect(download.suggestedFilename()).toBe("my-sprinter-144-floor-plan.pdf");
  const pdf = (await readFile(await download.path())).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  for (const text of [
    "My Sprinter 144",
    "Galley cabinet",
    "1200 x 550 x 900",
    "Dimensions in mm",
  ]) {
    expect(pdf, text).toContain(`(${text}`);
  }
  expect(pdf).not.toContain("/Subtype /Image");
});

test("dragging with a finger works and snaps", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "Touch input is exercised on the phone project");
  const gap = await gapToWall(page, "fridge", "passenger");
  const { from, to } = await dragPath(page, "fridge", "passenger", gap - 8);

  // Real touch events through the browser, not synthetic pointer events.
  const client = await page.context().newCDPSession(page);
  const touch = (type: string, point?: { x: number; y: number }) =>
    client.send("Input.dispatchTouchEvent", {
      type: type as "touchStart",
      touchPoints: point ? [{ x: point.x, y: point.y }] : [],
    });
  await touch("touchStart", from);
  for (let step = 1; step <= 10; step++) {
    await touch("touchMove", {
      x: from.x + ((to.x - from.x) * step) / 10,
      y: from.y + ((to.y - from.y) * step) / 10,
    });
  }
  await touch("touchEnd");

  await expect(page.getByTestId("field-driver")).toHaveValue("1278 mm");
  // The tray keeps its height, so the plan did not resize under the finger.
  await expect(page.getByTestId("deselect")).toBeVisible();
  await page.getByTestId("deselect").click();
  await expect(page.getByTestId("palette")).toBeVisible();
});
