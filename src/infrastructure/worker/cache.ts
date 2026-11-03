/** Optional cache: denied storage or corruption always falls back to rebuilding. */
export class IndexCache {
  private db: Promise<IDBDatabase>;
  constructor(name: string) {
    this.db = new Promise((resolve, reject) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("shards");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    this.db.catch(() => {});
  }
  async get(key: string): Promise<Uint8Array | undefined> {
    try {
      const db = await this.db;
      return await new Promise((resolve, reject) => {
        const r = db.transaction("shards").objectStore("shards").get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }).then(async (record: any) => {
        if (!record?.bytes || record.hash !== (await checksum(record.bytes)))
          return undefined;
        return record.bytes;
      });
    } catch {
      return undefined;
    }
  }
  async put(key: string, value: Uint8Array): Promise<void> {
    try {
      const db = await this.db;
      const record = { bytes: value, hash: await checksum(value) };
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction("shards", "readwrite");
        t.objectStore("shards").put(record, key);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    } catch {
      /* Cache failure must not prevent searching. */
    }
  }
  async retain(keys: string[]): Promise<void> {
    try {
      const db = await this.db;
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction("shards", "readwrite");
        const store = t.objectStore("shards");
        const r = store.openKeyCursor();
        r.onsuccess = () => {
          const cursor = r.result;
          if (!cursor) return;
          if (!keys.includes(String(cursor.key))) store.delete(cursor.key);
          cursor.continue();
        };
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    } catch {
      /* Optional cache. */
    }
  }
  close() {
    void this.db.then((db) => db.close()).catch(() => {});
  }
}

async function checksum(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer,
  );
  return [...new Uint8Array(digest)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
