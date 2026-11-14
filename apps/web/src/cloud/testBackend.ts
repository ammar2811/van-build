import type { CloudBackend, CloudUser } from "./backend";
import { ConflictError } from "./backend";

/**
 * The account service used by the end-to-end tests. Every call is forwarded to a function the
 * test runner puts on the page, so several browser contexts (a laptop and a phone) share one
 * store held by the test. The session lives in this page's own storage, like a real one.
 *
 * Only built in when VITE_CLOUD=test, and only active when the test runner provides the bridge.
 */

type Bridge = (method: string, user: CloudUser | null, args: unknown[]) => Promise<unknown>;

declare global {
  interface Window {
    __vanbuildCloud?: Bridge;
  }
}

const SESSION_KEY = "vanbuild.test-session";

export function hasTestBridge(): boolean {
  return typeof window.__vanbuildCloud === "function";
}

export function testBackend(): CloudBackend {
  const listeners = new Set<(user: CloudUser | null) => void>();
  const user = (): CloudUser | null => {
    const email = localStorage.getItem(SESSION_KEY);
    return email ? { id: email, email } : null;
  };
  const call = async <T>(method: string, ...args: unknown[]): Promise<T> => {
    const bridge = window.__vanbuildCloud;
    if (!bridge) throw new Error("The test cloud is not connected");
    const result = (await bridge(method, user(), args)) as { error?: string; value?: T };
    if (result.error === "conflict") throw new ConflictError();
    // The same error a browser gives for a request that never reached the server.
    if (result.error === "offline") throw new TypeError("Failed to fetch");
    if (result.error) throw new Error(result.error);
    return result.value as T;
  };
  const notify = () => {
    for (const listener of listeners) listener(user());
  };

  return {
    currentUser: async () => user(),
    onUserChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async sendSignInLink(email) {
      // Stands in for opening the emailed link: the user is signed in straight away.
      await call("signIn", email);
      localStorage.setItem(SESSION_KEY, email);
      setTimeout(notify, 0);
    },
    async signOut() {
      localStorage.removeItem(SESSION_KEY);
      setTimeout(notify, 0);
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
