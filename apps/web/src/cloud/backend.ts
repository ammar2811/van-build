import type { DesignDoc } from "@vanbuild/core";

/**
 * Everything the app needs from an account service. The editor only knows this interface:
 * Supabase implements it in production, and the end-to-end tests swap in a stand-in.
 */

export interface CloudUser {
  id: string;
  email: string;
}

export interface CloudDesignSummary {
  id: string;
  name: string;
  shellId: string;
  revision: number;
  /** ISO timestamp. */
  updatedAt: string;
}

export interface CloudDesign extends CloudDesignSummary {
  /** As stored. Not validated: it may come from an older or newer version of the app. */
  doc: unknown;
}

export interface CloudVersion {
  id: string;
  label: string;
  revision: number;
  /** ISO timestamp. */
  createdAt: string;
}

export interface SharedDesign {
  name: string;
  doc: unknown;
}

/** The design changed elsewhere since the revision this save was based on. */
export class ConflictError extends Error {
  constructor() {
    super("The design was changed somewhere else");
    this.name = "ConflictError";
  }
}

export interface CloudBackend {
  currentUser(): Promise<CloudUser | null>;
  /** Called with the new user (or null) whenever someone signs in or out. Returns unsubscribe. */
  onUserChange(listener: (user: CloudUser | null) => void): () => void;
  /** Email a one-time sign-in link that comes back to `redirectTo`. */
  sendSignInLink(email: string, redirectTo: string): Promise<void>;
  signOut(): Promise<void>;

  listDesigns(): Promise<CloudDesignSummary[]>;
  /** Null when the design does not exist, was deleted, or belongs to someone else. */
  getDesign(id: string): Promise<CloudDesign | null>;
  createDesign(doc: DesignDoc): Promise<CloudDesignSummary>;
  /** Save over `expectedRevision`. Returns the new revision, or throws ConflictError. */
  saveDesign(id: string, doc: DesignDoc, expectedRevision: number): Promise<number>;
  deleteDesign(id: string, expectedRevision: number): Promise<void>;

  listVersions(designId: string): Promise<CloudVersion[]>;
  getVersion(id: string): Promise<unknown | null>;
  saveVersion(
    designId: string,
    label: string,
    revision: number,
    doc: DesignDoc,
  ): Promise<CloudVersion>;

  /** Make a new read-only link and return its secret token. Older links stop working. */
  createShareLink(designId: string): Promise<string>;
  revokeShareLinks(designId: string): Promise<void>;
  hasShareLink(designId: string): Promise<boolean>;
  /** Anyone with the token can open the design, signed in or not. */
  openShared(token: string): Promise<SharedDesign | null>;
}

/** A share token: 32 random bytes, base64url, 43 characters. Only its hash is stored. */
export function newShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
