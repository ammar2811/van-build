import type { CloudBackend } from "./backend";

/**
 * Which account service this build talks to. Accounts are optional: without configuration
 * the editor works exactly as before, saving on this device only.
 *
 *   VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY   a Supabase project
 *   VITE_CLOUD=test                                      the end-to-end test stand-in
 */
export async function loadBackend(): Promise<CloudBackend | null> {
  // Read straight from import.meta.env so the build can drop whichever branch is unused.
  if (import.meta.env.VITE_CLOUD === "test") {
    const { hasTestBridge, testBackend } = await import("./testBackend");
    return hasTestBridge() ? testBackend() : null;
  }
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  // Loaded on demand so the editor's first paint never waits for the account library.
  const { supabaseBackend } = await import("./supabaseBackend");
  return supabaseBackend(url, key);
}
