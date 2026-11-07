/** iOS persistence: vectors, text and shards are fetched in bounded units. */
export class MobileStore {
  private db: Promise<IDBDatabase>;
  constructor(vault: string) {
    this.db = new Promise((resolve, reject) => {
      const r = indexedDB.open(`softmatcha-mobile-v1:${vault}`, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("data");
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? Error("IndexedDB unavailable"));
    });
    void this.db.catch(() => {});
  }
  async get<T>(key: string): Promise<T | undefined> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("data");
      const request = transaction.objectStore("data").get(key);
      let value: T | undefined;
      const clear = () => {
        request.onsuccess = null;
        transaction.oncomplete =
          transaction.onabort =
          transaction.onerror =
            null;
      };
      request.onsuccess = () => {
        value = request.result as T | undefined;
      };
      // Do not start the next disk read while the previous transaction still
      // owns its deserialized payload and backing storage.
      transaction.oncomplete = () => {
        clear();
        resolve(value);
        value = undefined;
      };
      transaction.onabort = transaction.onerror = () => {
        clear();
        value = undefined;
        reject(transaction.error ?? Error("IndexedDB request failed"));
      };
    });
  }
  async put(key: string, value: unknown): Promise<void> {
    const db = await this.db;
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("data", "readwrite");
      t.objectStore("data").put(value, key);
      t.oncomplete = () => resolve();
      t.onabort = t.onerror = () =>
        reject(t.error ?? Error("IndexedDB transaction failed"));
    });
  }
  async getMany<T>(keys: string[]): Promise<T[]> {
    if (!keys.length) return [];
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const t = db.transaction("data"),
        store = t.objectStore("data"),
        values = new Array<T>(keys.length);
      keys.forEach((key, i) => {
        const r = store.get(key);
        r.onsuccess = () => {
          values[i] = r.result as T;
        };
      });
      t.oncomplete = () => resolve(values);
      t.onabort = t.onerror = () =>
        reject(t.error ?? Error("IndexedDB read failed"));
    });
  }
  async putMany(entries: [string, unknown][]): Promise<void> {
    const db = await this.db;
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("data", "readwrite"),
        store = t.objectStore("data");
      for (const [key, value] of entries) store.put(value, key);
      t.oncomplete = () => resolve();
      t.onabort = t.onerror = () =>
        reject(t.error ?? Error("IndexedDB write failed"));
    });
  }
  async remove(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const db = await this.db;
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("data", "readwrite");
      for (const key of keys) t.objectStore("data").delete(key);
      t.oncomplete = () => resolve();
      t.onabort = t.onerror = () =>
        reject(t.error ?? Error("IndexedDB transaction failed"));
    });
  }
  close() {
    void this.db.then((db) => db.close()).catch(() => {});
  }
}
