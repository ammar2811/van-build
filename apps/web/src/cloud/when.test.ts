import { describe, expect, it } from "vitest";
import { when } from "./when";

describe("when", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  it("says how long ago, in words", () => {
    expect(when("2026-11-14T11:59:50Z", now)).toBe("just now");
    expect(when("2026-11-14T11:59:00Z", now)).toBe("1 minute ago");
    expect(when("2026-11-14T11:15:00Z", now)).toBe("45 minutes ago");
    expect(when("2026-11-14T09:00:00Z", now)).toBe("3 hours ago");
    expect(when("2026-11-12T12:00:00Z", now)).toBe("2 days ago");
  });
  it("gives the date for anything older than a week", () => {
    expect(when("2026-03-03T12:00:00Z", now)).toMatch(/2026/);
  });
});
