import type { BrowserContext } from "@playwright/test";
import type { CloudUser } from "../src/cloud/backend";
import { createMemoryCloud, type MemoryCloud } from "../src/cloud/memoryCloud";

/**
 * An account service for end-to-end tests. One store lives in the test process and every
 * browser context connected to it (a laptop, a phone, a stranger with a share link) talks to
 * the same store, like devices talking to one server. The app only uses it when built with
 * VITE_CLOUD=test, which the Playwright web server does.
 */
export interface TestCloud {
  store: MemoryCloud;
  connect(context: BrowserContext): Promise<{ setOffline(offline: boolean): void }>;
}

export function testCloud(): TestCloud {
  const store = createMemoryCloud();
  return {
    store,
    async connect(context) {
      let offline = false;
      await context.exposeFunction(
        "__vanbuildCloud",
        (method: string, user: CloudUser | null, args: unknown[]) =>
          offline ? { error: "offline" } : store.handle(method, user, args),
      );
      return {
        setOffline: (value) => {
          offline = value;
        },
      };
    },
  };
}
