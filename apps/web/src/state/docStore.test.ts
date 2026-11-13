import { starterDesign } from "@vanbuild/catalog";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "./docStore";

const store = () => useDocStore.getState();

beforeEach(() => {
  store().reset(starterDesign());
});

describe("document history", () => {
  it("undoes and redoes a change", () => {
    const original = store().doc;
    store().commit("Rename", (draft) => {
      draft.name = "Weekender";
    });
    expect(store().doc.name).toBe("Weekender");
    expect(store().past).toHaveLength(1);

    store().undo();
    expect(store().doc).toEqual(original);
    expect(store().future).toHaveLength(1);

    store().redo();
    expect(store().doc.name).toBe("Weekender");
    expect(store().future).toHaveLength(0);
  });

  it("does not record a change that changes nothing", () => {
    store().commit("Nothing", (draft) => {
      draft.name = store().doc.name;
    });
    expect(store().past).toHaveLength(0);
  });

  it("drops the redo stack when a new change is made after an undo", () => {
    store().commit("One", (draft) => {
      draft.name = "One";
    });
    store().undo();
    store().commit("Two", (draft) => {
      draft.name = "Two";
    });
    expect(store().future).toHaveLength(0);
    store().redo();
    expect(store().doc.name).toBe("Two");
  });

  it("walks back through several steps in order", () => {
    const names = ["A", "B", "C"];
    for (const name of names) {
      store().commit(name, (draft) => {
        draft.name = name;
      });
    }
    store().undo();
    expect(store().doc.name).toBe("B");
    store().undo();
    expect(store().doc.name).toBe("A");
    store().undo();
    expect(store().doc.name).toBe("My Sprinter 144");
    store().undo();
    expect(store().doc.name).toBe("My Sprinter 144");
  });

  it("leaves earlier documents untouched (structural sharing, no mutation)", () => {
    const before = store().doc;
    store().commit("Delete bed", (draft) => {
      delete draft.parts.bed;
    });
    expect(before.parts.bed).toBeDefined();
    expect(store().doc.parts.bed).toBeUndefined();
    // Parts that did not change are the very same objects.
    expect(store().doc.parts.galley).toBe(before.parts.galley);
  });
});
