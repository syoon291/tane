// IndexedDB store: one database ("tane"), one object store per kind of data.
// Later phases add stores or indexes by bumping DB_VERSION (and SCHEMA in
// backup.js when an owner store changes) and adding a step to UPGRADES;
// existing data is never dropped by an upgrade.
export const DB_NAME = "tane";
export const DB_VERSION = 1;

export const KEY_PATHS = { meta: "key", library: "id", notes: "id", myIdeas: "id", days: "id" };

// UPGRADES[n] moves a database from version n to n+1.
const UPGRADES = [
  (db) => {
    // Key-value app facts: { key, value }. Never in a backup.
    db.createObjectStore("meta", { keyPath: KEY_PATHS.meta });
    // The last library loaded from tane-data, one record:
    // { id: "current", data (the parsed file), loadedAt (ISO), source (repo/path) }.
    // Never in a backup: it reloads from tane-data. The demo library is never written here.
    db.createObjectStore("library", { keyPath: KEY_PATHS.library });
    // The owner's own content (phase 2), created now so it needs no migration:
    // notes { id, text, createdAt, editedAt, links: [{ to, kind: "about" | "agrees" | "disagrees" | "builds on" }], context, promptId?, pinned? }
    db.createObjectStore("notes", { keyPath: KEY_PATHS.notes }).createIndex("createdAt", "createdAt");
    // myIdeas: a note promoted to an idea of the owner's own, { id, text, fromNote, createdAt, editedAt, links }.
    db.createObjectStore("myIdeas", { keyPath: KEY_PATHS.myIdeas });
    // days: { id: "YYYY-MM-DD", ideaId, answered }.
    db.createObjectStore("days", { keyPath: KEY_PATHS.days });
  },
];

let dbPromise;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) { reject(new Error("This browser has no IndexedDB.")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      for (let v = e.oldVersion; v < DB_VERSION; v++) UPGRADES[v](db, req.transaction);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab opened a newer version: close so its upgrade can run.
      db.onversionchange = () => { db.close(); dbPromise = undefined; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("tane is open in another tab with an older version. Close it and reload."));
  });
  dbPromise.catch(() => { dbPromise = undefined; });
  return dbPromise;
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = (e) => reject(tx.error ?? e.target?.error ?? new Error("Transaction failed"));
  tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
});

const result = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export async function get(store, key) {
  const db = await openDB();
  return result(db.transaction(store).objectStore(store).get(key));
}

export async function put(store, record) {
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(record);
  return done(tx);
}

export async function getMeta(key, fallback) {
  const row = await get("meta", key);
  return row ? row.value : fallback;
}

export const setMeta = (key, value) => put("meta", { key, value });

// Every record in the named stores: { storeName: [records] }.
export async function dump(names) {
  const db = await openDB();
  const tx = db.transaction(names);
  const out = {};
  await Promise.all(names.map(async (n) => { out[n] = await result(tx.objectStore(n).getAll()); }));
  return out;
}

// Replace the contents of every store named in `stores` in one transaction:
// either the whole import lands or none of it does.
export async function replaceAll(stores) {
  const db = await openDB();
  const names = Object.keys(stores);
  const tx = db.transaction(names, "readwrite");
  const finished = done(tx);
  try {
    for (const n of names) {
      const os = tx.objectStore(n);
      os.clear();
      for (const r of stores[n]) os.put(r);
    }
  } catch (e) {
    // put() throws synchronously on a record with no usable key, which would
    // not abort the transaction: it would commit the clear() and lose data.
    tx.abort();
    finished.catch(() => {});
    throw e;
  }
  return finished;
}

// ---------- device-only store ----------
// A second, separate database for things that belong to this device and must
// never travel: the GitHub token. It is not part of dump() or replaceAll(), so
// it never lands in a backup or a synced file, and an import never overwrites it.

export const DEVICE_DB = "tane-device";
let devicePromise;

function openDevice() {
  if (devicePromise) return devicePromise;
  devicePromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) { reject(new Error("This browser has no IndexedDB.")); return; }
    const req = indexedDB.open(DEVICE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv", { keyPath: "key" });
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); devicePromise = undefined; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  devicePromise.catch(() => { devicePromise = undefined; });
  return devicePromise;
}

export async function getDevice(key, fallback) {
  const db = await openDevice();
  const row = await result(db.transaction("kv").objectStore("kv").get(key));
  return row ? row.value : fallback;
}

export async function setDevice(key, value) {
  const db = await openDevice();
  const tx = db.transaction("kv", "readwrite");
  tx.objectStore("kv").put({ key, value });
  return done(tx);
}

export async function delDevice(key) {
  const db = await openDevice();
  const tx = db.transaction("kv", "readwrite");
  tx.objectStore("kv").delete(key);
  return done(tx);
}
