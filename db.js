// IndexedDB store: one database ("tane"), one object store per kind of data.
// Later phases add stores or indexes by bumping DB_VERSION (and SCHEMA in
// backup.js when an owner store changes) and adding a step to UPGRADES;
// existing data is never dropped by an upgrade.
import { TOMBSTONES, tombstoneId, withTombstones } from "./merge.js";

export const DB_NAME = "tane";
export const DB_VERSION = 2;

export const KEY_PATHS = { meta: "key", library: "id", notes: "id", myIdeas: "id", days: "id", [TOMBSTONES]: "id" };

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
  (db) => {
    // v2 (phase 2, notes sync): tombstones, so a delete travels through sync:
    // { id: "<store>:<key as JSON>", store, key, at (ISO time deleted) }.
    db.createObjectStore(TOMBSTONES, { keyPath: KEY_PATHS[TOMBSTONES] });
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

export async function getAll(store) {
  const db = await openDB();
  return result(db.transaction(store).objectStore(store).getAll());
}

// The owner's stores: every write through putMine/delMine stamps editedAt or
// leaves a tombstone, so sync's merge (merge.js) keeps the newer edit and
// carries deletes. The library and meta are written with plain put().
const stamped = (record, at) => ({ ...record, editedAt: at });

export async function put(store, record) {
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(record);
  return done(tx);
}

// Several owner records (any stores) in one transaction, all stamped with the
// same time: all land or none do. writes: [{ store, record }].
export async function putMine(writes, at = new Date().toISOString()) {
  const db = await openDB();
  const tx = db.transaction([...new Set(writes.map((w) => w.store))], "readwrite");
  for (const w of writes) tx.objectStore(w.store).put(stamped(w.record, at));
  return done(tx);
}

// Delete owner records and leave a tombstone for each, so a sync removes
// them from tane-data (and other devices) instead of bringing them back.
// dels: [{ store, key }]; writes: owner records to stamp and put in the same transaction.
export async function delMine(dels, writes = [], at = new Date().toISOString()) {
  const db = await openDB();
  const tx = db.transaction([...new Set([...dels.map((d) => d.store), ...writes.map((w) => w.store), TOMBSTONES])], "readwrite");
  const ts = tx.objectStore(TOMBSTONES);
  for (const { store, key } of dels) {
    tx.objectStore(store).delete(key);
    ts.put({ id: tombstoneId(store, key), store, key, at });
  }
  for (const w of writes) tx.objectStore(w.store).put(stamped(w.record, at));
  return done(tx);
}

// Apply sync's merge result (merge.js diffStores) in one transaction, without
// stamping or tombstoning (the merged records and tombstones carry their own).
// A record that changed on this device since the dump the merge started from
// is left alone: the next sync carries that edit. Returns how many records
// (not counting tombstones) changed, and how many were skipped.
export async function applyChanges(changes) {
  if (!changes.length) return { applied: 0, skipped: 0 };
  const db = await openDB();
  const tx = db.transaction([...new Set(changes.map((c) => c.store))], "readwrite");
  const finished = done(tx);
  let applied = 0, skipped = 0;
  for (const c of changes) {
    const os = tx.objectStore(c.store);
    const req = os.get(c.key);
    req.onsuccess = () => {
      if (JSON.stringify(req.result ?? null) !== JSON.stringify(c.before ?? null)) { skipped++; return; }
      if (c.after) os.put(c.after); else os.delete(c.key);
      if (c.store !== TOMBSTONES) applied++;
    };
  }
  await finished;
  return { applied, skipped };
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
// either the whole import lands or none of it does. The tombstones are always
// reset to the file's own (none when it has none), so this device's old
// deletes can never drop imported records on the next sync.
export async function replaceAll(fileStores) {
  const db = await openDB();
  const stores = withTombstones(fileStores);
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
