// Backup format: build an export file of the owner's own data from a store
// dump, and parse/validate one before it replaces anything. Pure functions
// (no DOM, no IndexedDB) so they run under `node --test` as well as in the browser.
//
// Only the owner's stores travel (OWNER_STORES). The library is left out (it
// reloads from tane-data), and so is meta. The GitHub token lives in a
// separate device-only database (db.js) that a backup never reads.

export const APP_ID = "tane";
// Bump with DB_VERSION in db.js whenever the owner's stores change shape.
export const SCHEMA = 1;
export const OWNER_STORES = ["notes", "myIdeas", "days"];

// dump: { storeName: [records...] }; anything but the owner's stores is dropped.
export function buildBackup(dump, now = new Date()) {
  const stores = {};
  for (const name of OWNER_STORES) stores[name] = Array.isArray(dump?.[name]) ? dump[name] : [];
  return { app: APP_ID, schema: SCHEMA, exportedAt: now.toISOString(), stores };
}

export function backupFileName(now = new Date()) {
  return `tane-backup-${now.toISOString().slice(0, 10)}.json`;
}

// Returns { ok: true, backup } or { ok: false, error } with a message fit to show.
// Every owner store has keyPath "id".
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); }
  catch { return { ok: false, error: "That file is not valid JSON." }; }
  if (!data || typeof data !== "object" || Array.isArray(data) || data.app !== APP_ID) return { ok: false, error: "That file is not a tane backup." };
  if (!Number.isInteger(data.schema) || data.schema < 1) return { ok: false, error: "The backup has no valid schema version." };
  if (data.schema > SCHEMA) return { ok: false, error: "The backup comes from a newer version of tane. Update the app first." };
  const stores = data.stores;
  if (!stores || typeof stores !== "object" || Array.isArray(stores)) return { ok: false, error: "The backup has no data." };
  for (const [name, records] of Object.entries(stores)) {
    if (!OWNER_STORES.includes(name)) return { ok: false, error: `The backup has an unknown section "${name}".` };
    if (!Array.isArray(records)) return { ok: false, error: `The "${name}" section is not a list.` };
    if (records.some((r) => !r || typeof r !== "object" || Array.isArray(r))) return { ok: false, error: `The "${name}" section has a bad record.` };
    if (records.some((r) => !validKey(r.id))) return { ok: false, error: `The "${name}" section has a record without a valid "id".` };
  }
  if (!Object.keys(stores).length) return { ok: false, error: "The backup has no data." };
  return { ok: true, backup: data };
}

function validKey(k) {
  return (typeof k === "string" && k !== "") || (typeof k === "number" && Number.isFinite(k));
}

export function countRecords(stores) {
  return Object.fromEntries(OWNER_STORES.map((k) => [k, stores?.[k]?.length ?? 0]));
}
