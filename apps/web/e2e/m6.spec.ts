import { expect, type Page, test } from "@playwright/test";
import { testCloud } from "./cloud";
import { waitForSave, watchForErrors } from "./helpers";

let errors: string[] = [];

test.afterEach(() => {
  expect(errors, "page errors").toEqual([]);
});

async function partCount(page: Page): Promise<number> {
  return page.locator('.plan [data-testid^="part-"]').count();
}

test.describe("first visit", () => {
  // A browser that has never been here.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    errors = watchForErrors(page);
    await page.goto("/");
  });

  test("offers a van and a starting layout, and builds it", async ({ page }) => {
    const dialog = page.getByTestId("new-layout-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading")).toHaveText("Start your layout");
    await expect(page.getByTestId("template-weekender")).toBeChecked();
    await expect(page.getByTestId("van-sprinter-144-high-roof")).toBeChecked();

    await page.locator("label", { has: page.getByTestId("van-promaster-159-high-roof") }).click();
    await page.locator("label", { has: page.getByTestId("template-full-time") }).click();
    await page.getByTestId("new-layout-start").click();
    await expect(dialog).toHaveCount(0);

    await expect(page.getByTestId("design-name")).toHaveText(
      "Full-time solo, ProMaster 159 High Roof",
    );
    expect(await partCount(page)).toBe(14);
    // A template is a finished starting point: nothing overlaps or sticks out.
    await expect(page.locator(".part.is-flagged")).toHaveCount(0);

    await waitForSave(page);
    await page.reload();
    await expect(page.getByTestId("design-name")).toHaveText(
      "Full-time solo, ProMaster 159 High Roof",
    );
    await expect(page.getByTestId("new-layout-dialog")).toHaveCount(0);
  });

  test("can be skipped, and does not come back", async ({ page }) => {
    await page.getByTestId("new-layout-skip").click();
    await expect(page.getByTestId("new-layout-dialog")).toHaveCount(0);
    await expect(page.getByTestId("design-name")).toHaveText("My Sprinter 144");
    await page.reload();
    await expect(page.getByTestId("plan")).toBeVisible();
    await expect(page.getByTestId("new-layout-dialog")).toHaveCount(0);
  });

  test("Escape closes it like skipping", async ({ page }) => {
    await expect(page.getByTestId("new-layout-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("new-layout-dialog")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("plan")).toBeVisible();
    await expect(page.getByTestId("new-layout-dialog")).toHaveCount(0);
  });
});

test.describe("new layout", () => {
  test.beforeEach(async ({ page }) => {
    errors = watchForErrors(page);
    await page.goto("/");
    await expect(page.getByTestId("plan")).toBeVisible();
  });

  test("replaces the layout on screen, and undo brings the old one back", async ({ page }) => {
    await page.getByTestId("main-menu").click();
    await page.getByTestId("menu-new").click();
    await expect(page.getByTestId("new-layout-note")).toHaveText(
      "This replaces the layout on screen. Undo brings it back.",
    );
    await expect(page.getByTestId("template-empty")).toBeChecked();
    await page.locator("label", { has: page.getByTestId("van-transit-148-medium-roof") }).click();
    await page.getByTestId("new-layout-start").click();

    await expect(page.getByTestId("design-name")).toHaveText("My Transit 148 Medium Roof");
    expect(await partCount(page)).toBe(0);

    await page.getByTestId("undo").click();
    await expect(page.getByTestId("design-name")).toHaveText("My Sprinter 144");
    expect(await partCount(page)).toBe(5);
  });

  test("every template opens cleanly", async ({ page }) => {
    for (const template of ["weekender", "full-time", "dinette"]) {
      await page.getByTestId("main-menu").click();
      await page.getByTestId("menu-new").click();
      await page.locator("label", { has: page.getByTestId(`template-${template}`) }).click();
      await page.getByTestId("new-layout-start").click();
      await expect(page.getByTestId("new-layout-dialog")).toHaveCount(0);
      await expect(page.locator(".part.is-flagged")).toHaveCount(0);
      expect(await partCount(page)).toBeGreaterThan(5);
    }
  });

  test("when signed in, a new layout is added to the account", async ({ browser }, testInfo) => {
    const cloud = testCloud();
    const context = await browser.newContext({ ...testInfo.project.use });
    await cloud.connect(context);
    const page = await context.newPage();
    const pageErrors = watchForErrors(page);
    await page.goto("/");
    await page.getByTestId("main-menu").click();
    await page.getByTestId("menu-sign-in").click();
    await page.getByTestId("sign-in-email").fill("ann@example.com");
    await page.getByTestId("sign-in-send").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");

    await page.getByTestId("main-menu").click();
    await page.getByTestId("menu-new").click();
    await expect(page.getByTestId("new-layout-note")).toHaveText(
      "Your current layout stays in My layouts.",
    );
    await page.locator("label", { has: page.getByTestId("template-dinette") }).click();
    await page.getByTestId("new-layout-start").click();
    await expect(page.getByTestId("design-name")).toHaveText(
      "Couple with a dinette, Sprinter 144 High Roof",
    );
    await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
    expect(
      cloud.store
        .designsOf("ann@example.com")
        .map((d) => d.name)
        .sort(),
    ).toEqual(["Couple with a dinette, Sprinter 144 High Roof", "My Sprinter 144"]);
    expect(pageErrors).toEqual([]);
    await context.close();
  });
});

test.describe("keyboard", () => {
  test.beforeEach(async ({ page }) => {
    errors = watchForErrors(page);
    await page.goto("/");
    await expect(page.getByTestId("plan")).toBeVisible();
  });

  test("parts on the plan can be reached with Tab, selected and moved", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "phone", "Keyboard use is a desktop concern");
    // Tab from the start of the page until a part has focus.
    let focused = "";
    for (let i = 0; i < 80 && !focused.startsWith("part-"); i++) {
      await page.keyboard.press("Tab");
      focused = await page.evaluate(
        () =>
          document.activeElement?.closest('[data-testid^="part-"]')?.getAttribute("data-testid") ??
          "",
      );
    }
    expect(focused).toMatch(/^part-/);
    const part = page.getByTestId(focused).locator(".part-body");
    await expect(part).toHaveAttribute("role", "button");
    await expect(part).toHaveAccessibleName(/mm/);

    await page.keyboard.press("Enter");
    await expect(part).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("inspector")).toBeVisible();

    // Nudge it across the van. One way is a wall it already touches, so try both.
    const position = async () =>
      `${await page.getByTestId("field-front").inputValue()} ${await page.getByTestId("field-driver").inputValue()}`;
    const before = await position();
    await part.focus();
    await page.keyboard.press("Shift+ArrowUp");
    if ((await position()) === before) await page.keyboard.press("Shift+ArrowDown");
    expect(await position()).not.toBe(before);
    await page.keyboard.press("Escape");
    await expect(part).toHaveAttribute("aria-pressed", "false");
  });
});
