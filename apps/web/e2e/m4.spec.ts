import { readFile } from "node:fs/promises";
import { type Download, expect, type Page, test } from "@playwright/test";
import { selectPart, setUnits, waitForSave, watchForErrors } from "./helpers";

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = watchForErrors(page);
  await page.goto("/");
  await expect(page.getByTestId("plan")).toBeVisible();
});

test.afterEach(() => {
  expect(errors, "page errors").toEqual([]);
});

async function setView(page: Page, view: "plan" | "side" | "parts"): Promise<void> {
  await page.locator("label", { has: page.getByTestId(`view-${view}`) }).click();
  await expect(page.getByTestId(`view-${view}`)).toBeChecked();
}

async function exportFile(page: Page, kind: "pack" | "plan-svg" | "parts-csv"): Promise<Download> {
  await page.getByTestId("export-menu").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId(`export-${kind}`).click(),
  ]);
  await expect(page.getByRole("menu")).toHaveCount(0);
  return download;
}

async function typePrice(page: Page, value: string): Promise<void> {
  const field = page.getByTestId("field-price");
  await field.fill(value);
  await field.press("Enter");
}

test.describe("export", () => {
  test("the build pack is a four-page vector PDF", async ({ page }) => {
    const download = await exportFile(page, "pack");
    expect(download.suggestedFilename()).toBe("my-sprinter-144-build-pack.pdf");
    const pdf = (await readFile(await download.path())).toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf.match(/\/Type \/Page\b/g)?.length).toBe(4);
    for (const text of [
      "My Sprinter 144",
      // Sheet 1, the floor plan.
      "Galley cabinet",
      "1200 x 550 x 900",
      "Dimensions in mm",
      // Sheet 2, the elevation.
      "Sprinter 144 High Roof - side elevation from the driver side",
      "rear axle",
      // Sheet 3, the weight estimate. Empty van 2240.3 kg, build 210 kg, two people 160 kg.
      "Weight estimate",
      "Gross 2610.3 kg",
      "Driver",
      // Sheet 4, the parts list.
      "Parts list",
      "5 parts, $2,030",
    ]) {
      expect(pdf, text).toContain(`(${text}`);
    }
    expect(pdf).toContain("sheet 4 of 4) Tj");
    expect(pdf).not.toContain("/Subtype /Image");
  });

  test("the build pack follows the unit system", async ({ page }) => {
    await setUnits(page, "imperial");
    const download = await exportFile(page, "pack");
    const pdf = (await readFile(await download.path())).toString("latin1");
    expect(pdf).toContain("(Dimensions in inches");
    expect(pdf).toContain("(Weights in lb");
    // US Letter, 11 x 8.5 in.
    expect(pdf).toMatch(/\/MediaBox \[0 0 792\. 612\.\d*\]/);
  });

  test("the floor plan downloads as an SVG drawing", async ({ page }) => {
    const download = await exportFile(page, "plan-svg");
    expect(download.suggestedFilename()).toBe("my-sprinter-144-floor-plan.svg");
    const svg = await readFile(await download.path(), "utf8");
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg).toContain('width="297mm"');
    expect(svg).toContain(">Galley cabinet</text>");
    expect(svg).toContain(">Scale 1:");
  });

  test("the parts list downloads as CSV", async ({ page }) => {
    const download = await exportFile(page, "parts-csv");
    expect(download.suggestedFilename()).toBe("my-sprinter-144-parts-list.csv");
    const csv = await readFile(await download.path(), "utf8");
    const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe(
      "Quantity,Part,Category,Width (mm),Depth (mm),Height (mm),Unit price (USD),Total (USD),Link",
    );
    expect(lines).toContain("1,Fridge 85 L,appliance,475,500,830,900.00,900.00,");
    expect(lines.at(-1)).toBe("5,Total,,,,,,2030.00,");
  });

  test("the export menu works from the keyboard and Escape only closes the menu", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "phone", "Keyboard use is a desktop concern");
    await selectPart(page, "fridge");
    const button = page.getByTestId("export-menu");
    await button.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("export-pack")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("export-plan-svg")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(page.getByTestId("export-parts-csv")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    // The part is still selected: Escape closed the menu and nothing else.
    await expect(page.getByTestId("part-fridge")).toHaveAttribute("data-selected", "true");
  });

  test("clicking outside the export menu closes it", async ({ page }) => {
    await page.getByTestId("export-menu").click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByTestId("design-name").click();
    await expect(page.getByRole("menu")).toHaveCount(0);
  });
});

test.describe("parts list", () => {
  test("lists the starter layout with its total", async ({ page }) => {
    await setView(page, "parts");
    const list = page.getByTestId("parts-list");
    await expect(list.locator("tbody tr")).toHaveCount(5);
    await expect(page.getByTestId("parts-total")).toHaveText("$2,030");
    await expect(page.getByTestId("parts-line-galley")).toContainText("Galley cabinet");
    await expect(page.getByTestId("parts-line-galley").getByTestId("parts-line-total")).toHaveText(
      "$600",
    );
  });

  test("a typed price replaces the catalog price everywhere, and can be undone and reset", async ({
    page,
  }) => {
    await setView(page, "parts");
    await page.getByTestId("parts-line-fridge").getByRole("button").click();
    await expect(page.getByTestId("inspector-name")).toHaveText("Fridge 85 L");
    await expect(page.getByTestId("parts-line-fridge")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("field-price")).toHaveValue("$900");

    await typePrice(page, "749.50");
    await expect(page.getByTestId("field-price")).toHaveValue("$749.50");
    const line = page.getByTestId("parts-line-fridge");
    await expect(line.getByTestId("parts-line-total")).toHaveText("$749.50");
    await expect(line).toContainText("your price");
    await expect(page.getByTestId("parts-total")).toHaveText("$1,879.50");

    // It is saved with the design.
    await waitForSave(page);
    await page.reload();
    await setView(page, "parts");
    await expect(page.getByTestId("parts-total")).toHaveText("$1,879.50");

    // And it is in the exported CSV.
    const download = await exportFile(page, "parts-csv");
    expect(await readFile(await download.path(), "utf8")).toContain(
      "1,Fridge 85 L,appliance,475,500,830,749.50,749.50,",
    );

    await page.getByTestId("parts-line-fridge").getByRole("button").click();
    await page.getByTestId("field-price-reset").click();
    await expect(page.getByTestId("field-price")).toHaveValue("$900");
    await expect(page.getByTestId("parts-total")).toHaveText("$2,030");
    await expect(page.getByTestId("parts-line-fridge")).not.toContainText("your price");
    await page.getByTestId("undo").click();
    await expect(page.getByTestId("parts-total")).toHaveText("$1,879.50");
  });

  test("rejects a price that is not a number and keeps the old one", async ({ page }) => {
    await setView(page, "parts");
    await page.getByTestId("parts-line-fridge").getByRole("button").click();
    await typePrice(page, "cheap");
    await expect(page.getByRole("alert")).toContainText('Cannot read "cheap" as a price');
    await page.getByTestId("field-price").press("Escape");
    await expect(page.getByTestId("field-price")).toHaveValue("$900");
    await expect(page.getByTestId("undo")).toBeDisabled();
  });

  test("a free part costs nothing", async ({ page }) => {
    await setView(page, "parts");
    await page.getByTestId("parts-line-mattress").getByRole("button").click();
    await typePrice(page, "0");
    await expect(page.getByTestId("field-price")).toHaveValue("$0");
    await expect(page.getByTestId("parts-total")).toHaveText("$1,930");
  });

  test("identical parts are counted on one line, and picking it steps through them", async ({
    page,
  }) => {
    await setView(page, "parts");
    const line = page.getByTestId("parts-line-fridge");
    await line.getByRole("button").click();
    await page.getByTestId("duplicate").click();
    await expect(line.getByTestId("parts-quantity")).toHaveText("2");
    await expect(line.getByTestId("parts-line-total")).toHaveText("$1,800");
    await expect(page.getByTestId("parts-list").locator("tbody tr")).toHaveCount(5);
    await expect(page.getByTestId("parts-total")).toHaveText("$2,930");

    // A different price for one of the two makes it a line of its own.
    await typePrice(page, "500");
    await expect(page.getByTestId("parts-list").locator("tbody tr")).toHaveCount(6);
    await expect(page.getByTestId("parts-total")).toHaveText("$2,530");
  });

  test("an empty van has an empty parts list", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "phone", "Remove all parts is in the desktop side panel");
    await page.getByTestId("clear-all").click();
    await setView(page, "parts");
    await expect(page.getByTestId("parts-list")).toContainText("Nothing to buy yet.");
    await expect(page.getByTestId("parts-csv")).toBeDisabled();
    await expect(page.getByTestId("parts-list").locator("table")).toHaveCount(0);
  });

  test("the CSV button in the parts list downloads the same file", async ({ page }) => {
    await setView(page, "parts");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("parts-csv").click(),
    ]);
    expect(download.suggestedFilename()).toBe("my-sprinter-144-parts-list.csv");
  });
});

test.describe("catalog", () => {
  test("has at least forty parts, grouped by category", async ({ page }) => {
    const palette = page.getByTestId("palette");
    expect(await palette.locator(".palette-item").count()).toBeGreaterThanOrEqual(40);
    await expect(palette.getByRole("heading", { level: 3 })).toHaveText([
      "Beds",
      "Galley",
      "Seating",
      "Storage",
      "Appliances",
      "Water",
      "Electrical",
      "Climate",
      "Windows",
      "Loads",
    ]);
  });

  test("search narrows the list, and Escape clears it", async ({ page }) => {
    const palette = page.getByTestId("palette");
    const search = page.getByTestId("palette-search");
    await search.fill("fridge");
    await expect(palette.getByRole("heading", { level: 3 })).toHaveText(["Appliances"]);
    await expect(page.getByTestId("add-fridge-upright-85")).toBeVisible();
    await expect(page.getByTestId("add-galley-cabinet")).toHaveCount(0);

    // A category name finds everything in it.
    await search.fill("windows");
    await expect(palette.getByRole("heading", { level: 3 })).toHaveText(["Windows"]);

    await search.fill("zzz");
    await expect(page.getByTestId("palette-empty")).toHaveText('No parts match "zzz".');

    await search.press("Escape");
    await expect(search).toHaveValue("");
    await expect(page.getByTestId("add-galley-cabinet")).toBeVisible();
  });

  test("a solar panel goes on the roof without being flagged as too tall", async ({ page }) => {
    await page.getByTestId("palette-search").fill("solar");
    await page.getByTestId("add-solar-panel-200").click();
    await expect(page.getByTestId("inspector-name")).toHaveText("Solar panel 200 W");
    // Interior height 2006.6 mm plus 60 mm of roof.
    await expect(page.getByTestId("field-elevation")).toHaveValue("2066.6 mm");
    await expect(page.locator(".part.is-selected")).not.toHaveClass(/is-flagged/);
    await setView(page, "parts");
    await expect(page.getByTestId("parts-total")).toHaveText("$2,250");
  });
});
