import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";

const GOLDEN_DIR = join(import.meta.dirname, "../../fixtures/golden");

/**
 * Compare output with a checked-in golden file. Goldens only change when someone runs
 * `pnpm test:update-golden` on purpose, and the change then shows up in the diff for review.
 * A missing golden fails the test rather than being created silently.
 */
export function expectGolden(name: string, actual: string): void {
  const path = join(GOLDEN_DIR, name);
  if (process.env.UPDATE_GOLDEN === "1") {
    writeFileSync(path, actual);
    return;
  }
  if (!existsSync(path)) {
    throw new Error(`Golden file ${name} is missing. Run "pnpm test:update-golden" and review it.`);
  }
  expect(actual).toBe(readFileSync(path, "utf8"));
}
