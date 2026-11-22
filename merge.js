// Sync merge (genki's): combine this device's owner stores with the copy in
// tane-data app/latest.json record by record, so two devices (or a device and
// an older copy) never lose each other's notes. Pure functions (no DOM, no
// IndexedDB) so they run under `node --test` as well as in the browser.
//
// - Every record is matched by its store key. A record on one side only is kept.
// - The same key on both sides: the newer edit wins (editedAt, which db.js
//   stamps on every owner write, else createdAt). A tie keeps this device's copy.
// - Deletes travel as tombstones in the "deleted" store ({ id, store, key, at }):
//   a record is dropped when a tombstone for its key is at least as new as the
//   record, so a delete on one device is not undone by the other. A record
//   edited after the delete is kept. Tombstones are never pruned (each is tiny).

export const TOMBSTONES = "deleted";

export const tombstoneId = (store, key) => `${store}:${JSON.stringify(key)}`;

const ms = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string" || !v) return 0;
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
};

// When a record was last edited, in ms (0 when it carries no time at all).
export function editedMs(r) {
  if (!r || typeof r !== "object") return 0;
  return ms(r.editedAt) || ms(r.createdAt);
}

// The store set a restore or import writes: the file's stores, with the
// tombstones always replaced by the file's own (none when it has none).
export function withTombstones(stores) {
  return { ...stores, [TOMBSTONES]: stores?.[TOMBSTONES] ?? [] };
}

const keyOf = (r, kp) => JSON.stringify(r[kp]);

// local, remote: { storeName: [records] }. keyPaths: { storeName: keyPath }.
// Returns the merged { storeName: [records] }, every store of either side.
export function mergeStores(local, remote, keyPaths) {
  const names = [...new Set([...Object.keys(local || {}), ...Object.keys(remote || {})])];
  const tombs = new Map();
  for (const t of [...(local?.[TOMBSTONES] ?? []), ...(remote?.[TOMBSTONES] ?? [])]) {
    const had = tombs.get(t.id);
    if (!had || ms(t.at) > ms(had.at)) tombs.set(t.id, t);
  }
  const out = {};
  for (const name of names) {
    if (name === TOMBSTONES) continue;
    const kp = keyPaths[name];
    if (!kp) throw new Error(`No key path for the "${name}" section.`);
    const recs = new Map();
    for (const r of local?.[name] ?? []) recs.set(keyOf(r, kp), r);
    for (const r of remote?.[name] ?? []) {
      const k = keyOf(r, kp);
      const mine = recs.get(k);
      recs.set(k, mine && editedMs(r) <= editedMs(mine) ? mine : r);
    }
    out[name] = [...recs.values()].filter((r) => {
      const t = tombs.get(tombstoneId(name, r[kp]));
      return !t || editedMs(r) > ms(t.at);
    });
  }
  out[TOMBSTONES] = [...tombs.values()];
  return out;
}

// What applying `merged` over `base` (this device's dump) changes:
// [{ store, key, before, after }], before/after null for a record added/removed.
export function diffStores(base, merged, keyPaths) {
  const changes = [];
  const names = [...new Set([...Object.keys(base || {}), ...Object.keys(merged || {})])];
  for (const store of names) {
    const kp = keyPaths[store];
    const before = new Map((base?.[store] ?? []).map((r) => [keyOf(r, kp), r]));
    const after = new Map((merged?.[store] ?? []).map((r) => [keyOf(r, kp), r]));
    for (const [k, b] of before) {
      const a = after.get(k);
      if (!a) changes.push({ store, key: b[kp], before: b, after: null });
      else if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ store, key: b[kp], before: b, after: a });
    }
    for (const [k, a] of after) if (!before.has(k)) changes.push({ store, key: a[kp], before: null, after: a });
  }
  return changes;
}
