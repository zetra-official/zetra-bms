// Browser-only transactional queue storage. Legacy localStorage is never erased
// or rewritten. Keep older app tabs closed; a changed legacy snapshot fails safe.
const DATABASE = "zetra_sales_queue_w2_v1";
const STORE = "queues";
let opening: Promise<IDBDatabase> | undefined;

type StoredQueue = { value: string; legacy: string | null };

function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("Offline queue requires IndexedDB in this browser"));
  }
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    let rejected = false;
    const request = globalThis.indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onerror = () => { rejected = true; reject(request.error); };
    request.onblocked = () => {
      rejected = true;
      reject(new Error("Offline queue storage is blocked; close older app tabs and retry"));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (rejected) { db.close(); return; }
      db.onversionchange = () => { db.close(); opening = undefined; };
      resolve(db);
    };
  });
  opening.catch(() => { opening = undefined; });
  return opening;
}

function storedValue(record: unknown, legacy: string | null): string | null {
  if (record === undefined) return legacy;
  const entry = record as Partial<StoredQueue> | null;
  if (!entry || typeof entry.value !== "string" ||
      (entry.legacy !== null && typeof entry.legacy !== "string")) {
    throw new Error("Invalid transactional queue data; existing storage was preserved");
  }
  if (entry.legacy !== legacy) {
    throw new Error("Legacy queue changed in another app version; close older tabs before recovery");
  }
  return entry.value;
}

export async function readBrowserQueue(key: string, legacy: string | null): Promise<string | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readonly");
    let value: string | null = null;
    let failure: unknown;
    const request = transaction.objectStore(STORE).get(key);
    request.onsuccess = () => {
      try { value = storedValue(request.result, legacy); }
      catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(value);
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Queue read aborted"));
    transaction.onerror = () => { /* onabort reports the transaction failure */ };
  });
}

export async function updateBrowserQueue<T>(
  key: string,
  legacy: string | null,
  mutation: (raw: string | null) => { value: string; result: T }
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    // Keep read, reduction and write inside one transaction; do not await here.
    const transaction = db.transaction(STORE, "readwrite");
    let result: T;
    let failure: unknown;
    const store = transaction.objectStore(STORE);
    const request = store.get(key);
    request.onsuccess = () => {
      try {
        const next = mutation(storedValue(request.result, legacy));
        result = next.result;
        store.put({ value: next.value, legacy } satisfies StoredQueue, key);
      } catch (error) { failure = error; transaction.abort(); }
    };
    // A caller receives success only after IndexedDB commits the write.
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Queue write aborted"));
    transaction.onerror = () => { /* onabort reports the transaction failure */ };
  });
}
