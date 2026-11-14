import { type Browser, expect, type Page, type TestInfo, test } from "@playwright/test";
import { testCloud } from "./cloud";
import { waitForSave, watchForErrors } from "./helpers";

/**
 * Accounts, sync between devices, versions and share links. Each "device" is its own browser
 * context with its own storage; all of them talk to one test cloud held by this process.
 */

interface Device {
  page: Page;
  errors: string[];
  setOffline(offline: boolean): void;
  close(): Promise<void>;
}

let cloud = testCloud();
const devices: Device[] = [];

test.beforeEach(() => {
  cloud = testCloud();
});

test.afterEach(async () => {
  for (const device of devices.splice(0)) {
    expect(device.errors, "page errors").toEqual([]);
    await device.close();
  }
});

async function openDevice(browser: Browser, testInfo: TestInfo, path = "/"): Promise<Device> {
  const context = await browser.newContext({ ...testInfo.project.use });
  const { setOffline } = await cloud.connect(context);
  const page = await context.newPage();
  const errors = watchForErrors(page);
  await page.goto(path);
  await expect(page.getByTestId("plan")).toBeVisible();
  const device = { page, errors, setOffline, close: () => context.close() };
  devices.push(device);
  return device;
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.getByTestId("main-menu").click();
  await page.getByTestId("menu-sign-in").click();
  await page.getByTestId("sign-in-email").fill(email);
  await page.getByTestId("sign-in-send").click();
  await expect(page.getByTestId("sign-in-sent")).toContainText(email);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("sign-in-dialog")).toHaveCount(0);
  await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
}

async function rename(page: Page, name: string): Promise<void> {
  await page.getByTestId("design-name").click();
  await page.getByTestId("design-name-input").fill(name);
  await page.getByTestId("design-name-input").press("Enter");
  await expect(page.getByTestId("design-name")).toHaveText(name);
}

async function synced(page: Page): Promise<void> {
  await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
}

/** What happens when someone comes back to a tab: it checks the account for changes. */
async function refocus(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

async function menu(page: Page, item: string): Promise<void> {
  await page.getByTestId("main-menu").click();
  await page.getByTestId(`menu-${item}`).click();
}

test("without an account nothing changes: the design is saved on the device", async ({
  browser,
}, testInfo) => {
  const { page } = await openDevice(browser, testInfo);
  await expect(page.getByTestId("save-status")).toHaveText("Saved on this device");
  await page.getByTestId("main-menu").click();
  await expect(page.getByTestId("menu-sign-in")).toBeVisible();
  await expect(page.getByTestId("menu-designs")).toHaveCount(0);
});

test("signing in rejects an address that is not an email", async ({ browser }, testInfo) => {
  const { page } = await openDevice(browser, testInfo);
  await page.getByTestId("main-menu").click();
  await page.getByTestId("menu-sign-in").click();
  await page.getByTestId("sign-in-email").fill("van life");
  await page.getByTestId("sign-in-send").click();
  await expect(page.getByRole("alert")).toHaveText("Enter an email address like name@example.com");
  await expect(page.getByTestId("sign-in-email")).toHaveAttribute("aria-invalid", "true");
});

test("a layout made on the laptop opens on the phone, and changes flow back", async ({
  browser,
}, testInfo) => {
  const laptop = await openDevice(browser, testInfo);
  await rename(laptop.page, "Ann's Sprinter");
  await signIn(laptop.page, "ann@example.com");
  expect(cloud.store.designsOf("ann@example.com").map((d) => d.name)).toEqual(["Ann's Sprinter"]);

  // A fresh phone has only the starter layout, so signing in opens the account's layout.
  const phone = await openDevice(browser, testInfo);
  await signIn(phone.page, "ann@example.com");
  await expect(phone.page.getByTestId("design-name")).toHaveText("Ann's Sprinter");
  expect(cloud.store.designsOf("ann@example.com")).toHaveLength(1);

  await rename(phone.page, "Ann's Sprinter, phone edit");
  await synced(phone.page);
  await refocus(laptop.page);
  await expect(laptop.page.getByTestId("design-name")).toHaveText("Ann's Sprinter, phone edit");

  // And it stays that way after a reload, on both.
  await laptop.page.reload();
  await expect(laptop.page.getByTestId("design-name")).toHaveText("Ann's Sprinter, phone edit");
  await synced(laptop.page);
});

test("a change made on two devices at once is never overwritten silently", async ({
  browser,
}, testInfo) => {
  const laptop = await openDevice(browser, testInfo);
  await signIn(laptop.page, "ann@example.com");
  const phone = await openDevice(browser, testInfo);
  await signIn(phone.page, "ann@example.com");

  await rename(phone.page, "Phone name");
  await synced(phone.page);
  await rename(laptop.page, "Laptop name");
  await expect(laptop.page.getByTestId("conflict")).toBeVisible();
  await expect(laptop.page.getByTestId("save-status")).toHaveText("Changed on another device");
  expect(cloud.store.designsOf("ann@example.com")[0]?.name).toBe("Phone name");

  await laptop.page.getByTestId("conflict-keep-mine").click();
  await expect(laptop.page.getByTestId("conflict")).toHaveCount(0);
  await synced(laptop.page);
  expect(cloud.store.designsOf("ann@example.com")[0]?.name).toBe("Laptop name");

  await refocus(phone.page);
  await expect(phone.page.getByTestId("design-name")).toHaveText("Laptop name");
});

test("the other copy can win a conflict instead", async ({ browser }, testInfo) => {
  const laptop = await openDevice(browser, testInfo);
  await signIn(laptop.page, "ann@example.com");
  const phone = await openDevice(browser, testInfo);
  await signIn(phone.page, "ann@example.com");

  await rename(phone.page, "Phone name");
  await synced(phone.page);
  await rename(laptop.page, "Laptop name");
  await laptop.page.getByTestId("conflict-take-theirs").click();
  await expect(laptop.page.getByTestId("design-name")).toHaveText("Phone name");
  await synced(laptop.page);
});

test("edits made offline sync when the connection comes back", async ({ browser }, testInfo) => {
  const laptop = await openDevice(browser, testInfo);
  await signIn(laptop.page, "ann@example.com");
  laptop.setOffline(true);
  await rename(laptop.page, "Edited offline");
  await expect(laptop.page.getByTestId("save-status")).toHaveText(
    "Saved on this device, will sync",
  );
  expect(cloud.store.designsOf("ann@example.com")[0]?.name).not.toBe("Edited offline");

  laptop.setOffline(false);
  await laptop.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await synced(laptop.page);
  expect(cloud.store.designsOf("ann@example.com")[0]?.name).toBe("Edited offline");
});

test("versions can be saved and restored, and a restore can be undone", async ({
  browser,
}, testInfo) => {
  const { page } = await openDevice(browser, testInfo);
  await rename(page, "Before");
  await signIn(page, "ann@example.com");

  await menu(page, "versions");
  await page.getByTestId("version-label").fill("Before the bed");
  await page.getByTestId("version-save").click();
  await expect(page.getByTestId("version-row")).toHaveCount(1);
  await expect(page.getByTestId("version-row")).toContainText("Before the bed");
  await page.keyboard.press("Escape");

  await rename(page, "After");
  await menu(page, "versions");
  // An empty name gets a numbered one.
  await page.getByTestId("version-save").click();
  await expect(page.getByTestId("version-row")).toHaveCount(2);
  await expect(page.getByTestId("version-row").first()).toContainText("Version 2");

  await page.getByTestId("version-restore").nth(1).click();
  await expect(page.getByTestId("version-restored")).toContainText("Before the bed");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("design-name")).toHaveText("Before");
  await synced(page);

  await page.getByTestId("undo").click();
  await expect(page.getByTestId("design-name")).toHaveText("After");
});

test("a share link opens the layout read-only, and stops working when sharing stops", async ({
  browser,
}, testInfo) => {
  const owner = await openDevice(browser, testInfo);
  await rename(owner.page, "Shared Sprinter");
  await signIn(owner.page, "ann@example.com");
  await menu(owner.page, "share");
  await owner.page.getByTestId("share-create").click();
  const url = await owner.page.getByTestId("share-url").inputValue();
  expect(url).toMatch(/#\/share\/[A-Za-z0-9_-]{43}$/);
  await owner.page.keyboard.press("Escape");

  const sharePath = url.slice(url.indexOf("/#"));
  const visitor = await openDevice(browser, testInfo, sharePath);
  const page = visitor.page;
  await expect(page.getByTestId("design-name")).toHaveText("Shared Sprinter");
  await expect(page.getByTestId("save-status")).toHaveText("Shared layout, changes are not saved");
  await expect(page.getByTestId("main-menu")).toHaveCount(0);
  await expect(page.getByTestId("part-galley")).toBeVisible();

  // Trying a change on the shared layout never reaches the owner's copy.
  await rename(page, "Visitor was here");
  await page.waitForTimeout(500);
  expect(cloud.store.designsOf("ann@example.com")[0]?.name).toBe("Shared Sprinter");

  await menu(owner.page, "share");
  await owner.page.getByTestId("share-stop").click();
  await expect(owner.page.getByTestId("share-create")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("notice")).toContainText("That share link does not work any more");
  await expect(page.getByTestId("save-status")).toHaveText("Saved on this device");
  expect(new URL(page.url()).hash).toBe("");
});

test("a shared layout can be copied to keep working on it", async ({ browser }, testInfo) => {
  const owner = await openDevice(browser, testInfo);
  await rename(owner.page, "Ann's layout");
  await signIn(owner.page, "ann@example.com");
  await menu(owner.page, "share");
  await owner.page.getByTestId("share-create").click();
  const url = await owner.page.getByTestId("share-url").inputValue();

  const visitor = await openDevice(browser, testInfo, url.slice(url.indexOf("/#")));
  await visitor.page.getByTestId("copy-shared").click();
  await expect(visitor.page.getByTestId("design-name")).toHaveText("Copy of Ann's layout");
  await expect(visitor.page.getByTestId("save-status")).toHaveText("Saved on this device");
  expect(new URL(visitor.page.url()).hash).toBe("");

  // The copy is the visitor's own: editing it never touches the owner's account.
  await rename(visitor.page, "Ben's layout");
  await waitForSave(visitor.page);
  await visitor.page.reload();
  await expect(visitor.page.getByTestId("design-name")).toHaveText("Ben's layout");
  expect(cloud.store.designsOf("ann@example.com")[0]?.name).toBe("Ann's layout");
});

test("an account can hold several layouts", async ({ browser }, testInfo) => {
  const { page } = await openDevice(browser, testInfo);
  await rename(page, "First van");
  await signIn(page, "ann@example.com");

  await menu(page, "designs");
  await expect(page.getByTestId("design-row")).toHaveCount(1);
  await page.getByTestId("design-new").click();
  await expect(page.getByTestId("designs-dialog")).toHaveCount(0);
  await expect(page.getByTestId("design-name")).toHaveText("New layout");
  await expect(page.locator(".plan .part")).toHaveCount(0);
  await rename(page, "Second van");
  await synced(page);

  await menu(page, "designs");
  await expect(page.getByTestId("design-row")).toHaveCount(2);
  await expect(page.locator('[data-testid="design-row"][data-open="true"]')).toContainText(
    "Second van",
  );
  await page
    .locator('[data-testid="design-row"]', { hasText: "First van" })
    .getByTestId("design-open")
    .click();
  await expect(page.getByTestId("design-name")).toHaveText("First van");

  // Deleting takes two clicks.
  await menu(page, "designs");
  const second = page.locator('[data-testid="design-row"]', { hasText: "Second van" });
  await second.getByTestId("design-delete").click();
  await expect(second.getByTestId("design-delete")).toHaveText("Delete?");
  await second.getByTestId("design-delete").click();
  await expect(page.getByTestId("design-row")).toHaveCount(1);
  await expect(page.getByTestId("design-row")).toContainText("First van");
});

test("signing out keeps the layout on the device but stops syncing it", async ({
  browser,
}, testInfo) => {
  const { page } = await openDevice(browser, testInfo);
  await rename(page, "Mine");
  await signIn(page, "ann@example.com");
  await menu(page, "sign-out");
  await expect(page.getByTestId("save-status")).toHaveText("Saved on this device");
  await page.getByTestId("main-menu").click();
  await expect(page.getByTestId("menu-sign-in")).toBeVisible();
  await page.keyboard.press("Escape");
  await rename(page, "Mine, signed out");
  await page.waitForTimeout(500);
  expect(cloud.store.designsOf("ann@example.com")[0]?.name).toBe("Mine");
});

test.describe("installable app", () => {
  test("has a manifest with icons that exist", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    const manifest = await (await request.get(href ?? "")).json();
    expect(manifest).toMatchObject({ name: "Van Build", display: "standalone", start_url: "/" });
    expect(manifest.icons.map((icon: { purpose?: string }) => icon.purpose ?? "any")).toContain(
      "maskable",
    );
    for (const icon of manifest.icons as { src: string; type: string }[]) {
      const response = await request.get(icon.src);
      expect(response.ok(), icon.src).toBe(true);
      expect(response.headers()["content-type"]).toBe(icon.type);
    }
  });

  test("opens without a connection once it has been visited", async ({ page, context }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    await expect(page.getByTestId("plan")).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId("plan")).toBeVisible();
    await expect(page.getByTestId("part-galley")).toBeVisible();
    // Parts of the app loaded on demand are kept for offline use too.
    await page.locator("label", { has: page.getByTestId("view-parts") }).click();
    await expect(page.getByTestId("parts-total")).toHaveText("$2,030");
    await page.getByTestId("export-menu").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-pack").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/build-pack\.pdf$/);
    await context.setOffline(false);
    expect(errors).toEqual([]);
  });
});
