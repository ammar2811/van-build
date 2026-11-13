import type { DesignRepository } from "./repository";

const DATABASE = "vanbuild";
const STORE = "designs";
const CURRENT = "current";

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
