import { starterDesign } from "@vanbuild/catalog";
import type { DesignDoc } from "@vanbuild/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudUser } from "./backend";
import { createMemoryCloud, type MemoryCloud, memoryBackend } from "./memoryCloud";
import { type CloudLink, SyncEngine, type SyncStatus } from "./sync";

const ANN: CloudUser = { id: "ann@example.com", email: "ann@example.com" };
const BEN: CloudUser = { id: "ben@example.com", email: "ben@example.com" };

/** One browser on one device: an editor document, a link store, and a sync engine. */
function device(cloud: MemoryCloud, user: CloudUser | null, doc: DesignDoc = starterDesign()) {
  const backend = memoryBackend(cloud, user);
  let current = doc;
  let stored: CloudLink | null = null;
  let onDisk: DesignDoc | null = null;
  const statuses: SyncStatus[] = [];
  const notices: string[] = [];
  const pristine = JSON.stringify(starterDesign());
  const engine = new SyncEngine({
    backend,
    links: {
      load: async () => stored,
      save: async (link) => {
        stored = link;
      },
    },
    getDoc: () => current,
    saveLocal: async (saved) => {
      onDisk = saved;
    },
    openDoc: (raw) => {
      current = structuredClone(raw) as DesignDoc;
      engine.localChanged();
      return current;
    },
    isPristine: (d) => JSON.stringify(d) === pristine,
    onStatus: (status) => statuses.push(status),
    onNotice: (message) => notices.push(message),
    pushDelayMs: 100,
    retryDelayMs: 1000,
  });
  return {
    engine,
    backend,
    statuses,
    notices,
    get doc() {
      return current;
    },
    get stored() {
      return stored;
    },
    get onDisk() {
      return onDisk;
    },
    /** An edit in the editor: a new document object, as the editor's store makes. */
    edit(change: (doc: DesignDoc) => void) {
      const next = structuredClone(current);
      change(next);
      current = next;
      engine.localChanged();
    },
    async settle() {
      await vi.runAllTimersAsync();
      await engine.settled();
    },
  };
}

let cloud: MemoryCloud;

beforeEach(() => {
  vi.useFakeTimers();
  cloud = createMemoryCloud();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SyncEngine", () => {
  it("does nothing while signed out", async () => {
    const laptop = device(cloud, null);
    await laptop.engine.connect(null);
    laptop.edit((doc) => {
      doc.name = "Offline only";
    });
    await laptop.settle();
    expect(laptop.engine.currentStatus).toBe("signedOut");
    expect(laptop.stored).toBeNull();
  });

  it("uploads a design the account does not have, then pushes each change", async () => {
    const laptop = device(cloud, ANN);
    laptop.edit((doc) => {
      doc.name = "Ann's van";
    });
    await laptop.engine.connect(ANN);
    expect(cloud.designsOf(ANN.id)).toHaveLength(1);
    expect(laptop.stored).toMatchObject({ userId: ANN.id, revision: 1, dirty: false });

    laptop.edit((doc) => {
      doc.name = "Ann's van, v2";
    });
    expect(laptop.engine.currentStatus).toBe("syncing");
    await laptop.engine.settled();
    expect(laptop.stored?.dirty).toBe(true);
    await laptop.settle();
    expect(laptop.engine.currentStatus).toBe("synced");
    const [stored] = cloud.designsOf(ANN.id);
    expect(stored).toMatchObject({ revision: 2, name: "Ann's van, v2" });
    expect(laptop.stored).toMatchObject({ revision: 2, dirty: false });
  });

  it("batches quick edits into one save", async () => {
    const laptop = device(cloud, ANN);
    await laptop.engine.connect(ANN);
    for (let i = 0; i < 10; i++) {
      laptop.edit((doc) => {
        doc.name = `Edit ${i}`;
      });
    }
    await laptop.settle();
    expect(cloud.designsOf(ANN.id)[0]).toMatchObject({ revision: 2, name: "Edit 9" });
  });

  it("opens the latest design from the account on a fresh device", async () => {
    const laptop = device(cloud, ANN);
    laptop.edit((doc) => {
      doc.name = "Built on the laptop";
    });
    await laptop.engine.connect(ANN);

    const phone = device(cloud, ANN);
    await phone.engine.connect(ANN);
    expect(phone.doc.name).toBe("Built on the laptop");
    // The design is on disk by the time the device records which revision it holds.
    await phone.engine.settled();
    expect(phone.onDisk?.name).toBe("Built on the laptop");
    expect(cloud.designsOf(ANN.id)).toHaveLength(1);
    // Opening it is not an edit, so nothing is pushed back.
    await phone.settle();
    expect(cloud.designsOf(ANN.id)[0]?.revision).toBe(1);
  });

  it("keeps a design started before signing in, rather than replacing it", async () => {
    const laptop = device(cloud, ANN);
    laptop.edit((doc) => {
      doc.name = "First";
    });
    await laptop.engine.connect(ANN);

    const phone = device(cloud, ANN);
    phone.edit((doc) => {
      doc.name = "Started on the phone";
    });
    await phone.engine.connect(ANN);
    expect(phone.doc.name).toBe("Started on the phone");
    expect(
      cloud
        .designsOf(ANN.id)
        .map((d) => d.name)
        .sort(),
    ).toEqual(["First", "Started on the phone"]);
  });

  it("picks up changes made on another device when it checks again", async () => {
    const laptop = device(cloud, ANN);
    laptop.edit((doc) => {
      doc.name = "v1";
    });
    await laptop.engine.connect(ANN);
    const phone = device(cloud, ANN);
    await phone.engine.connect(ANN);

    phone.edit((doc) => {
      doc.name = "v2 from the phone";
    });
    await phone.settle();
    await laptop.engine.reconcile();
    expect(laptop.doc.name).toBe("v2 from the phone");
    expect(laptop.stored).toMatchObject({ revision: 2, dirty: false });
  });

  it("checks again when asked during a check that may have read too early", async () => {
    const laptop = device(cloud, ANN);
    laptop.edit((doc) => {
      doc.name = "v1";
    });
    await laptop.engine.connect(ANN);
    const phone = device(cloud, ANN);
    await phone.engine.connect(ANN);

    // A check starts and reads the account, but its answer is held up on the way back.
    const getDesign = laptop.backend.getDesign;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    laptop.backend.getDesign = async (id) => {
      const design = await getDesign(id);
      await held;
      return design;
    };
    const first = laptop.engine.reconcile();
    await vi.advanceTimersByTimeAsync(0);
    // Meanwhile the phone saves, and the laptop is asked to check again.
    phone.edit((doc) => {
      doc.name = "v2";
    });
    await phone.settle();
    const second = laptop.engine.reconcile();
    laptop.backend.getDesign = getDesign;
    release();
    await Promise.all([first, second]);
    expect(laptop.doc.name).toBe("v2");
  });

  it("refuses to overwrite a change made elsewhere, and lets the person choose", async () => {
    const laptop = device(cloud, ANN);
    laptop.edit((doc) => {
      doc.name = "v1";
    });
    await laptop.engine.connect(ANN);
    const phone = device(cloud, ANN);
    await phone.engine.connect(ANN);

    phone.edit((doc) => {
      doc.name = "phone";
    });
    await phone.settle();
    laptop.edit((doc) => {
      doc.name = "laptop";
    });
    await laptop.settle();
    expect(laptop.engine.currentStatus).toBe("conflict");
    expect(cloud.designsOf(ANN.id)[0]?.name).toBe("phone");

    // Editing more does not push while the conflict is open.
    laptop.edit((doc) => {
      doc.name = "laptop, more";
    });
    await laptop.settle();
    expect(cloud.designsOf(ANN.id)[0]?.name).toBe("phone");

    await laptop.engine.keepMine();
    expect(laptop.engine.currentStatus).toBe("synced");
    expect(cloud.designsOf(ANN.id)[0]).toMatchObject({ name: "laptop, more", revision: 3 });

    // The phone's copy is now behind; it has no local changes, so it simply updates.
    await phone.engine.reconcile();
    expect(phone.doc.name).toBe("laptop, more");
  });

  it("can drop local changes in favour of the other copy", async () => {
    const laptop = device(cloud, ANN);
    await laptop.engine.connect(ANN);
    const phone = device(cloud, ANN);
    await phone.engine.connect(ANN);
    phone.edit((doc) => {
      doc.name = "phone";
    });
    await phone.settle();
    laptop.edit((doc) => {
      doc.name = "laptop";
    });
    await laptop.engine.reconcile();
    expect(laptop.engine.currentStatus).toBe("conflict");

    laptop.engine.takeTheirs();
    expect(laptop.doc.name).toBe("phone");
    expect(laptop.engine.currentStatus).toBe("synced");
    await laptop.settle();
    expect(cloud.designsOf(ANN.id)[0]?.revision).toBe(2);
  });

  it("keeps working offline and catches up when the connection is back", async () => {
    const laptop = device(cloud, ANN);
    await laptop.engine.connect(ANN);
    laptop.backend.setOnline(false);
    laptop.edit((doc) => {
      doc.name = "Edited in the desert";
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(laptop.engine.currentStatus).toBe("offline");
    expect(laptop.stored?.dirty).toBe(true);

    laptop.backend.setOnline(true);
    await laptop.settle();
    expect(laptop.engine.currentStatus).toBe("synced");
    expect(cloud.designsOf(ANN.id)[0]).toMatchObject({ name: "Edited in the desert" });
  });

  it("forgets the account link on sign out, and never pushes to someone else's account", async () => {
    const laptop = device(cloud, ANN);
    await laptop.engine.connect(ANN);
    await laptop.engine.connect(null);
    expect(laptop.stored).toBeNull();
    laptop.edit((doc) => {
      doc.name = "After signing out";
    });
    await laptop.settle();
    expect(cloud.designsOf(ANN.id)[0]?.name).not.toBe("After signing out");
  });

  it("does not reuse another account's link", async () => {
    const shared = device(cloud, ANN);
    shared.edit((doc) => {
      doc.name = "Ann's";
    });
    await shared.engine.connect(ANN);
    // Ben signs in on the same browser. The engine starts from the stored link.
    const engine = new SyncEngine({
      backend: memoryBackend(cloud, BEN),
      links: { load: async () => shared.stored, save: async () => {} },
      getDoc: () => shared.doc,
      saveLocal: async () => {},
      openDoc: (raw) => raw as DesignDoc,
      isPristine: () => false,
      onStatus: () => {},
      onNotice: () => {},
    });
    await engine.connect(BEN);
    expect(engine.currentLink?.userId).toBe(BEN.id);
    expect(engine.currentLink?.designId).not.toBe(shared.stored?.designId);
    expect(cloud.designsOf(BEN.id)).toHaveLength(1);
  });

  it("uploads again if the design was deleted on another device", async () => {
    const laptop = device(cloud, ANN);
    laptop.edit((doc) => {
      doc.name = "Keep me";
    });
    await laptop.engine.connect(ANN);
    const phone = device(cloud, ANN);
    await phone.engine.connect(ANN);
    const id = laptop.stored?.designId ?? "";
    await phone.engine.deleteDesign(id, 1, () => ({ ...starterDesign(), name: "Fresh" }));

    await laptop.engine.reconcile();
    expect(laptop.notices[0]).toMatch(/deleted from your account/);
    expect(laptop.doc.name).toBe("Keep me");
    expect(
      cloud
        .designsOf(ANN.id)
        .filter((d) => !d.deleted)
        .map((d) => d.name),
    ).toContain("Keep me");
  });

  it("switches between designs, pushing pending changes first", async () => {
    const laptop = device(cloud, ANN);
    laptop.edit((doc) => {
      doc.name = "One";
    });
    await laptop.engine.connect(ANN);
    await laptop.engine.createDesign({ ...starterDesign(), name: "Two", parts: {} });
    expect(laptop.doc.name).toBe("Two");
    const one = cloud.designsOf(ANN.id).find((d) => d.name === "One");

    laptop.edit((doc) => {
      doc.name = "Two, edited";
    });
    await laptop.engine.openDesign(one?.id ?? "");
    expect(laptop.doc.name).toBe("One");
    expect(
      cloud
        .designsOf(ANN.id)
        .map((d) => d.name)
        .sort(),
    ).toEqual(["One", "Two, edited"]);
  });

  it("opens the next design when the open one is deleted", async () => {
    const laptop = device(cloud, ANN);
    laptop.edit((doc) => {
      doc.name = "Older";
    });
    await laptop.engine.connect(ANN);
    await laptop.engine.createDesign({ ...starterDesign(), name: "Newer", parts: {} });
    const open = laptop.stored;
    await laptop.engine.deleteDesign(open?.designId ?? "", open?.revision ?? 0, starterDesign);
    expect(laptop.doc.name).toBe("Older");

    const last = laptop.stored;
    await laptop.engine.deleteDesign(last?.designId ?? "", last?.revision ?? 0, () => ({
      ...starterDesign(),
      name: "Replacement",
    }));
    expect(laptop.doc.name).toBe("Replacement");
    expect(
      cloud
        .designsOf(ANN.id)
        .filter((d) => !d.deleted)
        .map((d) => d.name),
    ).toEqual(["Replacement"]);
  });

  it("saves versions and restores one", async () => {
    const laptop = device(cloud, ANN);
    laptop.edit((doc) => {
      doc.name = "Before the bed";
    });
    await laptop.engine.connect(ANN);
    const saved = await laptop.engine.saveVersion("Before the bed");
    expect(saved).toMatchObject({ label: "Before the bed", revision: 1 });

    laptop.edit((doc) => {
      doc.name = "After the bed";
    });
    const second = await laptop.engine.saveVersion("After");
    // Pending changes are pushed first, so the version matches a real revision.
    expect(second.revision).toBe(2);
    expect((await laptop.engine.listVersions()).map((v) => v.label)).toEqual([
      "After",
      "Before the bed",
    ]);

    await laptop.engine.restoreVersion(saved.id);
    expect(laptop.doc.name).toBe("Before the bed");
    await laptop.settle();
    expect(cloud.designsOf(ANN.id)[0]).toMatchObject({ name: "Before the bed", revision: 3 });
  });

  it("makes one share link per design and can stop sharing", async () => {
    const laptop = device(cloud, ANN);
    laptop.edit((doc) => {
      doc.name = "Shared van";
    });
    await laptop.engine.connect(ANN);
    const token = await laptop.engine.shareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await laptop.engine.shareToken()).toBe(token);
    expect(await laptop.engine.shareState()).toEqual({ active: true, token });

    const visitor = memoryBackend(cloud, null);
    expect((await visitor.openShared(token))?.name).toBe("Shared van");

    const renewed = await laptop.engine.shareToken(true);
    expect(renewed).not.toBe(token);
    expect(await visitor.openShared(token)).toBeNull();

    await laptop.engine.stopSharing();
    expect(await visitor.openShared(renewed)).toBeNull();
    expect(await laptop.engine.shareState()).toEqual({ active: false, token: null });
    expect(laptop.stored?.shareToken).toBeUndefined();
  });

  it("knows a link exists even when it was made on another device", async () => {
    const laptop = device(cloud, ANN);
    laptop.edit((doc) => {
      doc.name = "Van";
    });
    await laptop.engine.connect(ANN);
    await laptop.engine.shareToken();
    const phone = device(cloud, ANN);
    await phone.engine.connect(ANN);
    expect(await phone.engine.shareState()).toEqual({ active: true, token: null });
  });
});
