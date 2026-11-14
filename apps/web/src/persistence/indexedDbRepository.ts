import type { CloudLink, LinkStore } from "../cloud/sync";
import type { DesignRepository } from "./repository";

const DATABASE = "vanbuild";
const STORE = "designs";
const CURRENT = "current";
const CLOUD_LINK = "cloud-link";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Design storage is blocked by another tab"));
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      // Resolve only once the transaction has committed, so "saved" really means saved.
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

/** Keeps the design in this browser, on this device. */
export function indexedDbRepository(): DesignRepository {
  return {
    load: async () => (await run("readonly", (store) => store.get(CURRENT))) ?? null,
    save: async (doc) => {
      await run("readwrite", (store) => store.put(doc, CURRENT));
    },
    keepBackup: async (raw) => {
      await run("readwrite", (store) => store.put(raw, `backup:${new Date().toISOString()}`));
    },
  };
}

/** Remembers which design in the account the design on this device belongs to. */
export function indexedDbLinkStore(): LinkStore {
  return {
    load: async () =>
      ((await run("readonly", (store) => store.get(CLOUD_LINK))) as CloudLink | undefined) ?? null,
    save: async (link) => {
      if (link) await run("readwrite", (store) => store.put(link, CLOUD_LINK));
      else await run("readwrite", (store) => store.delete(CLOUD_LINK));
    },
  };
}
