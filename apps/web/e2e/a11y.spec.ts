import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { testCloud } from "./cloud";

/**
 * Automated accessibility checks (WCAG 2.2 A and AA rules that axe can test) on every main
 * screen and dialog. They catch missing names, contrast and structure problems; they do not
 * replace trying the app with a keyboard and a screen reader.
 */

async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const problems = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`,
  );
  expect(problems, label).toEqual([]);
}

async function view(page: Page, name: string): Promise<void> {
  await page.locator("label", { has: page.getByTestId(`view-${name}`) }).click();
  await expect(page.getByTestId(`view-${name}`)).toBeChecked();
}

test("the editor and its views", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("plan")).toBeVisible();
  await expectAccessible(page, "plan");
  await page.getByTestId("part-galley").locator(".part-body").click();
  await expect(page.getByTestId("inspector-name")).toBeVisible();
  await expectAccessible(page, "plan with a part selected");
  await page.keyboard.press("Escape");
  await view(page, "side");
  await expectAccessible(page, "side view");
  await view(page, "parts");
  await expectAccessible(page, "parts list");
});

test("menus and dialogs", async ({ browser }, testInfo) => {
  const cloud = testCloud();
  const context = await browser.newContext({ ...testInfo.project.use });
  await cloud.connect(context);
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("plan")).toBeVisible();

  await page.getByTestId("export-menu").click();
  await expectAccessible(page, "export menu");
  await page.keyboard.press("Escape");

  await page.getByTestId("main-menu").click();
  await expectAccessible(page, "main menu");
  await page.getByTestId("menu-new").click();
  await expectAccessible(page, "new layout dialog");
  await page.keyboard.press("Escape");

  await page.getByTestId("main-menu").click();
  await page.getByTestId("menu-sign-in").click();
  await expectAccessible(page, "sign-in dialog");
  await page.getByTestId("sign-in-email").fill("ann@example.com");
  await page.getByTestId("sign-in-send").click();
  await expect(page.getByTestId("sign-in-sent")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");

  for (const item of ["designs", "versions", "share"]) {
    await page.getByTestId("main-menu").click();
    await page.getByTestId(`menu-${item}`).click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    await expect(page.getByText("Loading")).toHaveCount(0);
    await expectAccessible(page, `${item} dialog`);
    await page.keyboard.press("Escape");
  }
  await context.close();
});

test.describe("first visit", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("the welcome", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("new-layout-dialog")).toBeVisible();
    await expectAccessible(page, "welcome");
  });
});
