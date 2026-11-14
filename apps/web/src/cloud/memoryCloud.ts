import type { DesignDoc } from "@vanbuild/core";
import {
  type CloudBackend,
  type CloudDesign,
  type CloudDesignSummary,
  type CloudUser,
  type CloudVersion,
  ConflictError,
  newShareToken,
  type SharedDesign,
} from "./backend";

/**
 * An account service held in memory, following the same rules as the database: people only
 * see their own designs, saves must name the revision they are based on, and a share token
 * opens one design until it is revoked. Used by unit tests and, through a bridge, by the
 * end-to-end tests, where one store is shared by several browser contexts.
 */

interface StoredDesign extends CloudDesign {
  owner: string;
  deleted: boolean;
}

interface StoredVersion extends CloudVersion {
  designId: string;
  owner: string;
  doc: unknown;
}

export type MemoryCloud = ReturnType<typeof createMemoryCloud>;

export function createMemoryCloud() {
  const designs = new Map<string, StoredDesign>();
  const versions: StoredVersion[] = [];
  const links = new Map<string, { designId: string; revoked: boolean }>();
  let clock = Date.parse("2026-01-01T00:00:00Z");
  let ids = 0;
  // A clock that ticks one second per write, so "most recent" is never a tie.
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const newId = (prefix: string) => `${prefix}-${++ids}`;
  // Structured copies, so callers can never change what is stored by holding a reference.
  const copy = <T>(value: T): T => structuredClone(value);

  const owned = (user: CloudUser | null, id: string): StoredDesign | null => {
    const design = designs.get(id);
    return design && user && design.owner === user.id && !design.deleted ? design : null;
  };
  const summary = (d: StoredDesign): CloudDesignSummary => ({
    id: d.id,
    name: d.name,
    shellId: d.shellId,
    revision: d.revision,
    updatedAt: d.updatedAt,
  });
  const requireUser = (user: CloudUser | null): CloudUser => {
    if (!user) throw new Error("Not signed in");
    return user;
  };

  const api = {
    signIn: (_user: CloudUser | null, _email: string) => undefined,
    listDesigns(user: CloudUser | null): CloudDesignSummary[] {
      const me = requireUser(user);
      return [...designs.values()]
        .filter((d) => d.owner === me.id && !d.deleted)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(summary);
    },
    getDesign(user: CloudUser | null, id: string): CloudDesign | null {
      const design = owned(user, id);
      return design ? { ...summary(design), doc: copy(design.doc) } : null;
    },
    createDesign(user: CloudUser | null, doc: DesignDoc): CloudDesignSummary {
      const me = requireUser(user);
      const design: StoredDesign = {
        id: newId("design"),
        owner: me.id,
        name: doc.name,
        shellId: doc.shellId,
        revision: 1,
        updatedAt: now(),
        doc: copy(doc),
        deleted: false,
      };
      designs.set(design.id, design);
      return summary(design);
    },
    saveDesign(user: CloudUser | null, id: string, doc: DesignDoc, expected: number): number {
      const design = owned(user, id);
      if (!design || design.revision !== expected) throw new ConflictError();
      design.revision += 1;
      design.doc = copy(doc);
      design.name = doc.name;
      design.shellId = doc.shellId;
      design.updatedAt = now();
      return design.revision;
    },
    deleteDesign(user: CloudUser | null, id: string, expected: number): void {
      const design = owned(user, id);
      if (!design || design.revision !== expected) throw new ConflictError();
      design.deleted = true;
      design.revision += 1;
    },
    listVersions(user: CloudUser | null, designId: string): CloudVersion[] {
      if (!owned(user, designId)) return [];
      return versions
        .filter((v) => v.designId === designId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ id, label, revision, createdAt }) => ({ id, label, revision, createdAt }));
    },
    getVersion(user: CloudUser | null, id: string): unknown | null {
      const version = versions.find((v) => v.id === id && user && v.owner === user.id);
      return version ? copy(version.doc) : null;
    },
    saveVersion(
      user: CloudUser | null,
      designId: string,
      label: string,
      revision: number,
      doc: DesignDoc,
    ): CloudVersion {
      const me = requireUser(user);
      if (!owned(user, designId)) throw new Error("No such design");
      const version: StoredVersion = {
        id: newId("version"),
        designId,
        owner: me.id,
        label,
        revision,
        createdAt: now(),
        doc: copy(doc),
      };
      versions.push(version);
      return { id: version.id, label, revision, createdAt: version.createdAt };
    },
    createShareLink(user: CloudUser | null, designId: string): string {
      api.revokeShareLinks(user, designId);
      const token = newShareToken();
      links.set(token, { designId, revoked: false });
      return token;
    },
    revokeShareLinks(user: CloudUser | null, designId: string): void {
      if (!owned(user, designId)) throw new Error("No such design");
      for (const link of links.values()) if (link.designId === designId) link.revoked = true;
    },
    hasShareLink(user: CloudUser | null, designId: string): boolean {
      if (!owned(user, designId)) return false;
      return [...links.values()].some((l) => l.designId === designId && !l.revoked);
    },
    openShared(_user: CloudUser | null, token: string): SharedDesign | null {
      const link = links.get(token);
      const design = link && !link.revoked ? designs.get(link.designId) : undefined;
      return design && !design.deleted ? { name: design.name, doc: copy(design.doc) } : null;
    },
  };

  return {
    /** Run one call the way the bridge does: errors come back as values, not exceptions. */
    handle(method: string, user: CloudUser | null, args: unknown[]) {
      const fn = (api as Record<string, unknown>)[method];
      if (typeof fn !== "function") return { error: `Unknown method ${method}` };
      try {
        return { value: fn(user, ...args) };
      } catch (error) {
        if (error instanceof ConflictError) return { error: "conflict" };
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
    /** Everything stored, for assertions in tests. */
    designsOf: (owner: string) => [...designs.values()].filter((d) => d.owner === owner),
  };
}

/** A backend signed in as `user`, talking straight to a memory cloud. For unit tests. */
export function memoryBackend(
  cloud: MemoryCloud,
  initialUser: CloudUser | null,
): CloudBackend & { setOnline(online: boolean): void } {
  let user = initialUser;
  let online = true;
  const listeners = new Set<(user: CloudUser | null) => void>();
  const call = async <T>(method: string, ...args: unknown[]): Promise<T> => {
    // Let other work run between calls, as a network round trip would.
    await Promise.resolve();
    if (!online) throw new TypeError("Failed to fetch");
    const result = cloud.handle(method, user, args) as { error?: string; value?: T };
    if (result.error === "conflict") throw new ConflictError();
    if (result.error) throw new Error(result.error);
    return result.value as T;
  };
  return {
    setOnline: (value) => {
      online = value;
    },
    currentUser: async () => user,
    onUserChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    sendSignInLink: async (email) => {
      user = { id: email, email };
      for (const listener of listeners) listener(user);
    },
    signOut: async () => {
      user = null;
      for (const listener of listeners) listener(null);
    },
    listDesigns: () => call("listDesigns"),
    getDesign: (id) => call("getDesign", id),
    createDesign: (doc) => call("createDesign", doc),
    saveDesign: (id, doc, expected) => call("saveDesign", id, doc, expected),
    deleteDesign: (id, expected) => call("deleteDesign", id, expected),
    listVersions: (designId) => call("listVersions", designId),
    getVersion: (id) => call("getVersion", id),
    saveVersion: (designId, label, revision, doc) =>
      call("saveVersion", designId, label, revision, doc),
    createShareLink: (designId) => call("createShareLink", designId),
    revokeShareLinks: (designId) => call("revokeShareLinks", designId),
    hasShareLink: (designId) => call("hasShareLink", designId),
    openShared: (token) => call("openShared", token),
  };
}
