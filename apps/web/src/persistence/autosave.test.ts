import { starterDesign } from "@vanbuild/catalog";
import type { DesignDoc } from "@vanbuild/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaver, type SaveStatus } from "./autosave";

function setup(save?: (doc: DesignDoc) => Promise<void>) {
  let doc = starterDesign();
  const saved: string[] = [];
  const statuses: SaveStatus[] = [];
  const repository = {
    save: vi.fn(
      save ??
        (async (next: DesignDoc) => {
          saved.push(next.name);
        }),
    ),
  };
  const autosaver = createAutosaver(
    repository,
    () => doc,
    (status) => statuses.push(status),
    400,
  );
  const rename = (name: string) => {
    doc = { ...doc, name };
    autosaver.changed();
  };
  return { autosaver, repository, saved, statuses, rename };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("autosave", () => {
  it("saves once after a burst of edits, with the latest design", async () => {
    const { repository, saved, statuses, rename } = setup();
    rename("A");
    await vi.advanceTimersByTimeAsync(200);
    rename("B");
    await vi.advanceTimersByTimeAsync(399);
    expect(repository.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toEqual(["B"]);
    expect(statuses.at(-1)).toBe("saved");
  });

  it("saves again when the design changes during a save", async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    const { statuses, rename, repository } = setup(async (doc) => {
      order.push(doc.name);
      if (doc.name === "A") await new Promise<void>((resolve) => (release = resolve));
    });
    rename("A");
    await vi.advanceTimersByTimeAsync(400);
    rename("B");
    await vi.advanceTimersByTimeAsync(400);
    // The second save waits for the first instead of running alongside it.
    expect(order).toEqual(["A"]);
    expect(statuses.at(-1)).not.toBe("saved");
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(["A", "B"]);
    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toBe("saved");
  });

  it("flush saves immediately", async () => {
    const { autosaver, saved, rename } = setup();
    rename("A");
    await autosaver.flush();
    expect(saved).toEqual(["A"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(saved).toEqual(["A"]);
  });

  it("reports a failed save and recovers on the next edit", async () => {
    let fail = true;
    const { statuses, rename, repository } = setup(async () => {
      if (fail) throw new Error("storage full");
    });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    rename("A");
    await vi.advanceTimersByTimeAsync(400);
    expect(statuses.at(-1)).toBe("failed");
    fail = false;
    rename("B");
    await vi.advanceTimersByTimeAsync(400);
    expect(statuses.at(-1)).toBe("saved");
    expect(repository.save).toHaveBeenCalledTimes(2);
    quiet.mockRestore();
  });

  it("does nothing after dispose", async () => {
    const { autosaver, repository, rename } = setup();
    autosaver.dispose();
    rename("A");
    await vi.advanceTimersByTimeAsync(1000);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
