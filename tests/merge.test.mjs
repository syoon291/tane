import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeStores, diffStores, tombstoneId, withTombstones, editedMs, TOMBSTONES } from "../merge.js";

const KP = { notes: "id", myIdeas: "id", days: "id", deleted: "id" };
const n = (id, editedAt, text = id) => ({ id, text, createdAt: "2026-11-01T00:00:00.000Z", editedAt });
const tomb = (store, key, at) => ({ id: tombstoneId(store, key), store, key, at });

test("records on one side only are kept from both", () => {
  const m = mergeStores({ notes: [n("a", "2026-11-20T00:00:00Z")] }, { notes: [n("b", "2026-11-20T00:00:00Z")] }, KP);
  assert.deepEqual(m.notes.map((r) => r.id).sort(), ["a", "b"]);
});

test("the same note on both sides: the newer edit wins, a tie keeps this device's", () => {
  const local = { notes: [n("a", "2026-11-20T00:00:00Z", "phone"), n("b", "2026-11-20T00:00:00Z", "phone")] };
  const remote = { notes: [n("a", "2026-11-21T00:00:00Z", "other"), n("b", "2026-11-20T00:00:00Z", "other")] };
  const m = mergeStores(local, remote, KP);
  assert.equal(m.notes.find((r) => r.id === "a").text, "other");
  assert.equal(m.notes.find((r) => r.id === "b").text, "phone");
});

test("a delete on one device is not undone by the other; a later edit survives it", () => {
  const local = { notes: [n("a", "2026-11-20T00:00:00Z"), n("b", "2026-11-23T00:00:00Z")], deleted: [] };
  const remote = { notes: [], deleted: [tomb("notes", "a", "2026-11-21T00:00:00Z"), tomb("notes", "b", "2026-11-22T00:00:00Z")] };
  const m = mergeStores(local, remote, KP);
  assert.deepEqual(m.notes.map((r) => r.id), ["b"]);
  assert.equal(m[TOMBSTONES].length, 2);
});

test("diffStores lists adds, changes and removals against the device's dump", () => {
  const base = { notes: [n("a", "1"), n("b", "1")] };
  const merged = { notes: [n("a", "2"), n("c", "1")] };
  const d = diffStores(base, merged, KP);
  assert.deepEqual(d.map((c) => [c.key, !!c.before, !!c.after]).sort(), [["a", true, true], ["b", true, false], ["c", false, true]]);
});

test("helpers: editedAt over createdAt, tombstones reset on import, counts skip tombstones", () => {
  assert.equal(editedMs({ createdAt: "2026-11-01T00:00:00Z" }), Date.parse("2026-11-01T00:00:00Z"));
  assert.equal(editedMs({ createdAt: "2026-11-01T00:00:00Z", editedAt: "2026-11-02T00:00:00Z" }), Date.parse("2026-11-02T00:00:00Z"));
  assert.deepEqual(withTombstones({ notes: [] }), { notes: [], deleted: [] });
});

test("an unknown section is refused", () => {
  assert.throws(() => mergeStores({ library: [{ id: 1 }] }, {}, KP), /No key path/);
});
