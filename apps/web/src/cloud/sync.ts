import type { DesignDoc } from "@vanbuild/core";
import {
  type CloudBackend,
  type CloudDesign,
  type CloudUser,
  type CloudVersion,
  ConflictError,
} from "./backend";

/**
 * Keeps the design on this device and the copy in the account in step.
 *
 * The device is always the working copy: the editor saves locally first, so it works offline
 * and never waits for the network. This engine then pushes changes up a moment later, naming
 * the cloud revision the local copy is based on. If the design changed somewhere else in the
 * meantime the save is refused, and the person chooses which copy to keep. Nothing is merged
 * and nothing is overwritten silently.
 */

/** What this device knows about the cloud copy of the design it has open. */
export interface CloudLink {
  userId: string;
  designId: string;
  /** The cloud revision the local copy is based on. */
  revision: number;
  /** The local copy has changes the cloud does not have yet. */
  dirty: boolean;
  /** The share token made on this device, if any. Only its hash is stored in the cloud. */
  shareToken?: string;
}

export interface LinkStore {
  load(): Promise<CloudLink | null>;
  save(link: CloudLink | null): Promise<void>;
}

export type SyncStatus = "signedOut" | "syncing" | "synced" | "offline" | "conflict" | "error";

export interface SyncDeps {
  backend: CloudBackend;
  links: LinkStore;
  getDoc(): DesignDoc;
  /**
   * Put a stored design in the editor. "replace" opens it fresh (another design, or a newer
   * copy from another device); "restore" makes it one undoable step. Returns the design as
   * opened, or why it could not be opened.
   */
  openDoc(raw: unknown, mode: "replace" | "restore"): DesignDoc | string;
  /**
   * Write a design to this device's storage. The engine calls it before recording that the
   * device holds a cloud revision, so the record is never ahead of the design on disk.
   */
  saveLocal(doc: DesignDoc): Promise<void>;
  /** The untouched starter layout, which is not worth keeping over a design in the account. */
  isPristine(doc: DesignDoc): boolean;
  onStatus(status: SyncStatus): void;
  onNotice(message: string): void;
  /** Pause after the last change before pushing it. */
  pushDelayMs?: number;
  /** Wait before trying again after a failed push. */
  retryDelayMs?: number;
}

export class SyncEngine {
  private user: CloudUser | null = null;
  private link: CloudLink | null = null;
  /** The document object last known to match the cloud copy. */
  private synced: DesignDoc | null = null;
  /** The cloud copy that refused our save, until the person chooses. */
  private conflict: CloudDesign | null = null;
  private status: SyncStatus = "signedOut";
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pushing: Promise<void> | null = null;
  private reconciling: Promise<void> | null = null;
  private reconcileAgain = false;
  /** Set while this engine itself is changing the editor's design. */
  private applying = false;
  private linkWrites: Promise<void> = Promise.resolve();
  private connecting: Promise<void> = Promise.resolve();
  private readonly deps: Required<SyncDeps>;

  constructor(deps: SyncDeps) {
    this.deps = { pushDelayMs: 1500, retryDelayMs: 15_000, ...deps };
  }

  get currentLink(): CloudLink | null {
    return this.link;
  }

  get currentStatus(): SyncStatus {
    return this.status;
  }

  /**
   * Someone signed in (or out). Picks up where this device left off with that account.
   * Calls run one after another: the auth service can report the same sign-in twice.
   */
  connect(user: CloudUser | null): Promise<void> {
    this.connecting = this.connecting.then(() => this.runConnect(user));
    return this.connecting;
  }

  private async runConnect(user: CloudUser | null): Promise<void> {
    if (user?.id === this.user?.id && (user === null || this.link !== null)) return;
    this.cancelTimers();
    this.user = user;
    this.conflict = null;
    if (!user) {
      // The design stays on this device, but it is no longer tied to that account.
      this.link = null;
      this.synced = null;
      this.persistLink();
      this.setStatus("signedOut");
      return;
    }
    const stored = await this.deps.links.load();
    this.link = stored && stored.userId === user.id ? stored : null;
    await this.reconcile();
  }

  /**
   * Bring this device and the account into step: upload a design the account does not have,
   * pull a newer copy, push local changes, or report a conflict. Safe to call any time (on
   * focus, when the network comes back); calls never overlap.
   */
  reconcile(): Promise<void> {
    if (!this.user) return Promise.resolve();
    if (this.reconciling) {
      // The check under way may have read the account before this request's reason for
      // asking (a save on another device), so run once more after it.
      this.reconcileAgain = true;
      return this.reconciling;
    }
    this.reconciling = (async () => {
      do {
        this.reconcileAgain = false;
        await this.runReconcile();
      } while (this.reconcileAgain);
    })().finally(() => {
      this.reconciling = null;
    });
    return this.reconciling;
  }

  private async runReconcile(): Promise<void> {
    const user = this.user;
    if (!user || this.conflict) return;
    this.setStatus("syncing");
    try {
      if (this.pushing) await this.pushing;
      if (!this.link) {
        await this.attach(user);
        return;
      }
      const remote = await this.deps.backend.getDesign(this.link.designId);
      if (!remote) {
        // Deleted on another device. Keep the work: it goes back up as a new design.
        this.link = null;
        this.deps.onNotice(
          "This layout had been deleted from your account on another device. It was saved to your account again.",
        );
        await this.upload(user, this.deps.getDoc());
        return;
      }
      if (remote.revision === this.link.revision) {
        if (this.link.dirty) await this.push();
        else this.setStatus("synced");
        return;
      }
      if (!this.link.dirty) {
        this.adopt(remote);
        this.setStatus("synced");
        return;
      }
      this.conflict = remote;
      this.setStatus("conflict");
    } catch (error) {
      this.failed(error);
    }
  }

  /** First sync for this device and account. */
  private async attach(user: CloudUser): Promise<void> {
    const doc = this.deps.getDoc();
    if (this.deps.isPristine(doc)) {
      // A fresh device: open the latest design in the account instead of uploading a starter.
      const [latest] = await this.deps.backend.listDesigns();
      const design = latest && (await this.deps.backend.getDesign(latest.id));
      if (design) {
        this.adopt(design);
        this.setStatus("synced");
        return;
      }
    }
    await this.upload(user, doc);
  }

  private async upload(user: CloudUser, doc: DesignDoc): Promise<void> {
    const created = await this.deps.backend.createDesign(doc);
    this.link = {
      userId: user.id,
      designId: created.id,
      revision: created.revision,
      dirty: this.deps.getDoc() !== doc,
    };
    this.synced = doc;
    this.persistLink();
    if (this.link.dirty) await this.push();
    else this.setStatus("synced");
  }

  /** Open a cloud copy in the editor and link this device to it. */
  private adopt(design: CloudDesign, mode: "replace" | "restore" = "replace"): void {
    const user = this.user;
    if (!user) return;
    this.applying = true;
    let opened: DesignDoc | string;
    try {
      opened = this.deps.openDoc(design.doc, mode);
    } finally {
      this.applying = false;
    }
    if (typeof opened === "string") throw new Error(opened);
    const keepToken = this.link?.designId === design.id ? this.link.shareToken : undefined;
    this.link = { userId: user.id, designId: design.id, revision: design.revision, dirty: false };
    if (keepToken) this.link.shareToken = keepToken;
    this.synced = opened;
    this.persistLink(opened);
  }

  /** The editor's design changed. Pushes it after a short pause. */
  localChanged(): void {
    if (this.applying || !this.user || !this.link) return;
    if (this.deps.getDoc() === this.synced) return;
    if (!this.link.dirty) {
      this.link = { ...this.link, dirty: true };
      this.persistLink();
    }
    if (this.conflict) return;
    this.setStatus("syncing");
    this.schedulePush(this.deps.pushDelayMs);
  }

  /** Push anything waiting now (the tab is closing, or another design is about to open). */
  async flush(): Promise<void> {
    this.cancelTimers();
    if (this.link?.dirty && !this.conflict) await this.push();
    else if (this.pushing) await this.pushing;
  }

  private schedulePush(delay: number): void {
    if (this.pushTimer !== null) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.push();
    }, delay);
  }

  private push(): Promise<void> {
    if (this.pushing) {
      // Run once more after the current push, which may have started before the last edit.
      const next = this.pushing.then(() => this.push());
      return next;
    }
    this.pushing = this.runPush().finally(() => {
      this.pushing = null;
    });
    return this.pushing;
  }

  private async runPush(): Promise<void> {
    while (this.link?.dirty && !this.conflict && this.user) {
      const link = this.link;
      const doc = this.deps.getDoc();
      try {
        const revision = await this.deps.backend.saveDesign(link.designId, doc, link.revision);
        if (this.link?.designId !== link.designId) return;
        this.synced = doc;
        this.link = { ...this.link, revision, dirty: this.deps.getDoc() !== doc };
        this.persistLink();
      } catch (error) {
        if (error instanceof ConflictError) {
          const remote = await this.deps.backend.getDesign(link.designId).catch(() => null);
          if (!remote) {
            this.failed(error);
            return;
          }
          this.conflict = remote;
          this.setStatus("conflict");
          return;
        }
        this.failed(error);
        return;
      }
    }
    if (!this.conflict && this.user) this.setStatus("synced");
  }

  private failed(error: unknown): void {
    // A dropped connection is normal on the road; anything else is worth a log line.
    const offline = error instanceof TypeError || globalThis.navigator?.onLine === false;
    if (!offline) console.error("Sync failed", error);
    this.setStatus(offline ? "offline" : "error");
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.reconcile();
    }, this.deps.retryDelayMs);
  }

  /** Resolve a conflict by saving this device's copy over the other one. */
  async keepMine(): Promise<void> {
    const conflict = this.conflict;
    if (!conflict || !this.link) return;
    this.conflict = null;
    this.link = { ...this.link, revision: conflict.revision, dirty: true };
    this.persistLink();
    await this.push();
  }

  /** Resolve a conflict by opening the other copy. This device's changes are dropped. */
  takeTheirs(): void {
    const conflict = this.conflict;
    if (!conflict) return;
    this.conflict = null;
    try {
      this.adopt(conflict);
      this.setStatus("synced");
    } catch (error) {
      this.failed(error);
    }
  }

  async openDesign(id: string): Promise<void> {
    await this.flush();
    const design = await this.deps.backend.getDesign(id);
    if (!design) throw new Error("That layout is no longer in your account");
    this.conflict = null;
    this.adopt(design);
    this.setStatus("synced");
  }

  /** Start a new design in the account and open it. */
  async createDesign(doc: DesignDoc): Promise<void> {
    const user = this.user;
    if (!user) throw new Error("Sign in first");
    await this.flush();
    this.applying = true;
    let opened: DesignDoc | string;
    try {
      opened = this.deps.openDoc(doc, "replace");
    } finally {
      this.applying = false;
    }
    if (typeof opened === "string") throw new Error(opened);
    this.conflict = null;
    this.link = null;
    await this.upload(user, opened);
  }

  /** Delete a design from the account. The open one is replaced by the next most recent. */
  async deleteDesign(id: string, revision: number, replacement: () => DesignDoc): Promise<void> {
    await this.flush();
    const open = this.link?.designId === id;
    const expected = open && this.link ? this.link.revision : revision;
    await this.deps.backend.deleteDesign(id, expected);
    if (!open) return;
    const [next] = await this.deps.backend.listDesigns();
    if (next) await this.openDesign(next.id);
    else await this.createDesign(replacement());
  }

  async saveVersion(label: string): Promise<CloudVersion> {
    await this.flush();
    const link = this.link;
    if (!link) throw new Error("Sign in to save versions");
    if (this.conflict) throw new Error("Choose which copy to keep first");
    return this.deps.backend.saveVersion(link.designId, label, link.revision, this.deps.getDoc());
  }

  listVersions(): Promise<CloudVersion[]> {
    return this.link ? this.deps.backend.listVersions(this.link.designId) : Promise.resolve([]);
  }

  /** Bring back an old version as one undoable change. It syncs like any other edit. */
  async restoreVersion(id: string): Promise<void> {
    const raw = await this.deps.backend.getVersion(id);
    if (raw === null) throw new Error("That version could not be found");
    const opened = this.deps.openDoc(raw, "restore");
    if (typeof opened === "string") throw new Error(opened);
  }

  /** The share link for the open design, made now if this device does not know one. */
  async shareToken(renew = false): Promise<string> {
    await this.flush();
    const link = this.link;
    if (!link) throw new Error("Sign in to share");
    if (link.shareToken && !renew) return link.shareToken;
    const token = await this.deps.backend.createShareLink(link.designId);
    if (this.link?.designId === link.designId) {
      this.link = { ...this.link, shareToken: token };
      this.persistLink();
    }
    return token;
  }

  /** Whether the open design has a working link, and whether this device knows it. */
  async shareState(): Promise<{ active: boolean; token: string | null }> {
    const link = this.link;
    if (!link) return { active: false, token: null };
    const active = await this.deps.backend.hasShareLink(link.designId);
    if (!active && link.shareToken && this.link?.designId === link.designId) {
      const { shareToken: _revoked, ...rest } = this.link;
      this.link = rest;
      this.persistLink();
    }
    return { active, token: active ? (link.shareToken ?? null) : null };
  }

  async stopSharing(): Promise<void> {
    const link = this.link;
    if (!link) return;
    await this.deps.backend.revokeShareLinks(link.designId);
    if (this.link?.designId === link.designId) {
      const { shareToken: _revoked, ...rest } = this.link;
      this.link = rest;
      this.persistLink();
    }
  }

  dispose(): void {
    this.cancelTimers();
  }

  private cancelTimers(): void {
    if (this.pushTimer !== null) clearTimeout(this.pushTimer);
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.pushTimer = null;
    this.retryTimer = null;
  }

  /** Record the link. With `doc`, write that design first, so the two always agree on disk. */
  private persistLink(doc?: DesignDoc): void {
    const link = this.link ? { ...this.link } : null;
    // Writes go in order, so an older link never lands after a newer one.
    this.linkWrites = this.linkWrites
      .then(async () => {
        if (doc) await this.deps.saveLocal(doc);
        await this.deps.links.save(link);
      })
      .catch((error) => console.warn("Could not remember the cloud link", error));
  }

  /** Resolves when the link on disk matches this engine. For tests and page close. */
  settled(): Promise<void> {
    return this.linkWrites;
  }

  private setStatus(status: SyncStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.deps.onStatus(status);
  }
}
