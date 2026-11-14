import { starterDesign } from "@vanbuild/catalog";
import type { DesignDoc } from "@vanbuild/core";
import { openSaved } from "../persistence/boot";
import { indexedDbLinkStore } from "../persistence/indexedDbRepository";
import type { DesignRepository } from "../persistence/repository";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import type { CloudBackend, CloudDesignSummary, CloudVersion } from "./backend";
import { loadBackend } from "./config";
import { SyncEngine } from "./sync";

/**
 * The account side of the app: signing in, keeping the design in step with the account,
 * versions and share links. Started after the editor is on screen, so it never delays it.
 */

let backend: CloudBackend | null = null;
let engine: SyncEngine | null = null;

/** Keys sorted, so two equal designs always serialise the same way. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

const PRISTINE = canonical(starterDesign());

/** A blank van for "New layout": the same vehicle as the starter, nothing in it yet. */
export function blankDesign(): DesignDoc {
  return { ...starterDesign(), name: "New layout", parts: {} };
}

function openDoc(raw: unknown, mode: "replace" | "restore"): DesignDoc | string {
  const opened = openSaved(raw);
  if (typeof opened === "string") return opened;
  const store = useDocStore.getState();
  if (mode === "restore") store.replace("Restore version", opened.doc);
  else {
    store.reset(opened.doc);
    useUiStore.getState().select(null);
  }
  if (opened.notice) useUiStore.getState().setNotice(opened.notice);
  return useDocStore.getState().doc;
}

/** Connect to the account service, if this build has one. */
export async function startCloud(repository: DesignRepository): Promise<void> {
  backend = await loadBackend();
  const ui = useUiStore.getState();
  if (!backend) return;
  ui.setCloud({ cloudAvailable: true });

  const sync = new SyncEngine({
    backend,
    links: indexedDbLinkStore(),
    getDoc: () => useDocStore.getState().doc,
    saveLocal: (doc) => repository.save(doc),
    openDoc,
    isPristine: (doc) => canonical(doc) === PRISTINE,
    onStatus: (syncStatus) => useUiStore.getState().setCloud({ syncStatus }),
    onNotice: (notice) => useUiStore.getState().setNotice(notice),
  });
  engine = sync;

  useDocStore.subscribe((state, previous) => {
    if (state.doc !== previous.doc) sync.localChanged();
  });
  backend.onUserChange((account) => {
    useUiStore.getState().setCloud({ account });
    void sync.connect(account);
  });
  // Check for changes made on other devices whenever this one comes back into use.
  const refresh = () => void sync.reconcile();
  window.addEventListener("online", refresh);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
    else void sync.flush();
  });
  window.addEventListener("pagehide", () => void sync.flush());

  const account = await backend.currentUser();
  tidyAddress();
  useUiStore.getState().setCloud({ account });
  await sync.connect(account);
}

function requireBackend(): CloudBackend {
  if (!backend) throw new Error("Accounts are not available in this version");
  return backend;
}

function requireEngine(): SyncEngine {
  if (!engine) throw new Error("Accounts are not available in this version");
  return engine;
}

/** The address an emailed sign-in link brings people back to: this page, without extras. */
function returnAddress(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export const cloud = {
  sendSignInLink: (email: string) => requireBackend().sendSignInLink(email, returnAddress()),
  signOut: async () => {
    await requireEngine().flush();
    await requireBackend().signOut();
  },
  listDesigns: (): Promise<CloudDesignSummary[]> => requireBackend().listDesigns(),
  currentDesignId: (): string | null => engine?.currentLink?.designId ?? null,
  openDesign: (id: string) => requireEngine().openDesign(id),
  newDesign: () => requireEngine().createDesign(blankDesign()),
  deleteDesign: (design: CloudDesignSummary) =>
    requireEngine().deleteDesign(design.id, design.revision, blankDesign),
  listVersions: (): Promise<CloudVersion[]> => requireEngine().listVersions(),
  saveVersion: (label: string) => requireEngine().saveVersion(label),
  restoreVersion: (id: string) => requireEngine().restoreVersion(id),
  shareState: () => requireEngine().shareState(),
  share: (renew = false) => requireEngine().shareToken(renew),
  stopSharing: () => requireEngine().stopSharing(),
  keepMine: () => requireEngine().keepMine(),
  takeTheirs: () => requireEngine().takeTheirs(),
};

/** The address that opens a design read-only. The token stays after "#", out of server logs. */
export function shareUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}#/share/${token}`;
}

/** The share token in the current address, if this page was opened from a share link. */
export function sharedToken(): string | null {
  const match = /^#\/share\/([A-Za-z0-9_-]{32,128})$/.exec(window.location.hash);
  return match?.[1] ?? null;
}

/**
 * Open a shared design for viewing. It is not saved anywhere and nothing syncs: the owner's
 * copy can only change from the owner's account. Returns false when the link does not work.
 */
export async function openSharedDesign(token: string): Promise<boolean> {
  const shared = await loadBackend()
    .then((service) => service?.openShared(token) ?? null)
    .catch((error) => {
      console.error("Could not open the shared design", error);
      return null;
    });
  const opened = shared ? openSaved(shared.doc) : null;
  if (!opened || typeof opened === "string") return false;
  const ui = useUiStore.getState();
  ui.setMode("shared");
  useDocStore.getState().reset(opened.doc);
  if (opened.notice) ui.setNotice(opened.notice);
  return true;
}

/**
 * Keep a copy of the shared design (with any changes tried on it) as this device's own
 * design, then open the editor on it. Whatever was on this device is kept as a backup.
 */
export async function copySharedDesign(repository: DesignRepository): Promise<void> {
  const doc = useDocStore.getState().doc;
  const previous = await repository.load().catch(() => null);
  if (previous !== null) await repository.keepBackup(previous);
  await repository.save({ ...doc, name: `Copy of ${doc.name}`.slice(0, 120) });
  // The copy is a new design: it must not be pushed over the account design open before.
  await indexedDbLinkStore().save(null);
  window.location.replace(`${window.location.origin}${window.location.pathname}`);
}

/** Drop the sign-in code from the address once it has been used. */
export function tidyAddress(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("code") && !url.searchParams.has("error_description")) return;
  url.searchParams.delete("code");
  url.searchParams.delete("error");
  url.searchParams.delete("error_code");
  url.searchParams.delete("error_description");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}
