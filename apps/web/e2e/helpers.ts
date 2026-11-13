import { expect, type Page } from "@playwright/test";

export type Direction = "front" | "rear" | "driver" | "passenger";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function rectOf(page: Page, selector: string): Promise<Rect> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`Nothing on screen for ${selector}`);
  return box;
}

export function partRect(page: Page, id: string): Promise<Rect> {
  return rectOf(page, `[data-testid="part-${id}"] .part-body`);
}

export function centre(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Screen direction of a van direction. The van is nose-left on wide screens, nose-up on phones. */
async function screenVector(page: Page, direction: Direction): Promise<{ x: number; y: number }> {
  const orientation = await page.getByTestId("plan").getAttribute("data-orientation");
  const landscape = {
    front: { x: -1, y: 0 },
    rear: { x: 1, y: 0 },
    passenger: { x: 0, y: -1 },
    driver: { x: 0, y: 1 },
  };
  const portrait = {
    front: { x: 0, y: -1 },
    rear: { x: 0, y: 1 },
    passenger: { x: 1, y: 0 },
    driver: { x: -1, y: 0 },
  };
  return (orientation === "portrait" ? portrait : landscape)[direction];
}

/** Pixels between a part's face and the van wall it faces. */
export async function gapToWall(page: Page, id: string, direction: Direction): Promise<number> {
  const part = await partRect(page, id);
  const floor = await rectOf(page, ".plan-floor");
  const v = await screenVector(page, direction);
  if (v.x > 0) return floor.x + floor.width - (part.x + part.width);
  if (v.x < 0) return part.x - floor.x;
  if (v.y > 0) return floor.y + floor.height - (part.y + part.height);
  return part.y - floor.y;
}

/** The pointer path of a drag: from the part's centre, `pixels` in a van direction. */
export async function dragPath(page: Page, id: string, direction: Direction, pixels: number) {
  const from = centre(await partRect(page, id));
  const v = await screenVector(page, direction);
  return { from, to: { x: from.x + v.x * pixels, y: from.y + v.y * pixels } };
}

/** Drag a part with the mouse. Leaves the button down when `release` is false. */
export async function dragPart(
  page: Page,
  id: string,
  direction: Direction,
  pixels: number,
  release = true,
): Promise<void> {
  const { from, to } = await dragPath(page, id, direction, pixels);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  if (release) await page.mouse.up();
}

export async function selectPart(page: Page, id: string): Promise<void> {
  const point = centre(await partRect(page, id));
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId(`part-${id}`)).toHaveAttribute("data-selected", "true");
}

export async function setUnits(page: Page, units: "metric" | "imperial"): Promise<void> {
  await page.locator("label", { has: page.getByTestId(`units-${units}`) }).click();
  await expect(page.getByTestId(`units-${units}`)).toBeChecked();
}

/** Fail the test if the page logs an error or throws. */
export function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}
