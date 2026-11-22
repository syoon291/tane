import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBackup, backupFileName, parseBackup, countRecords, APP_ID, SCHEMA, OWNER_STORES, FILE_STORES } from "../backup.js";

const now = new Date("2026-01-02T03:04:05.000Z");
const note = { id: "n1", text: "a made-up note", createdAt: "2026-01-01T00:00:00Z", links: [] };

test("a backup holds only the owner's stores: never the token, meta or the library", () => {
  const fakeToken = "github_pat_" + "x".repeat(40);
  const b = buildBackup({ notes: [note], meta: [{ key: "githubToken", value: fakeToken }], library: [{ id: "current", data: {} }], kv: [{ key: "githubToken", value: fakeToken }] }, now);
  assert.equal(b.app, APP_ID);
  assert.equal(b.schema, SCHEMA);
  assert.deepEqual(Object.keys(b.stores), FILE_STORES);
  assert.deepEqual(b.stores.notes, [note]);
  assert.deepEqual(b.stores.myIdeas, []);
  assert.ok(!JSON.stringify(b).includes("github_pat_"));
});

test("an exported backup parses back", () => {
  const r = parseBackup(JSON.stringify(buildBackup({ notes: [note] }, now)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.backup.stores.notes, [note]);
  assert.deepEqual(countRecords(r.backup.stores), { notes: 1, myIdeas: 0, days: 0 });
});

test("the file name is dated", () => {
  assert.equal(backupFileName(now), "tane-backup-2026-01-02.json");
});

test("rejects bad files with a message", () => {
  const bad = (v) => parseBackup(typeof v === "string" ? v : JSON.stringify(v));
  assert.match(bad("{x").error, /not valid JSON/);
  assert.match(bad({ app: "genki", schema: 1, stores: {} }).error, /not a tane backup/);
  assert.match(bad({ app: "tane", schema: 0, stores: {} }).error, /schema/);
  assert.match(bad({ app: "tane", schema: SCHEMA + 1, stores: {} }).error, /newer version/);
  assert.match(bad({ app: "tane", schema: 1, stores: { library: [] } }).error, /unknown section "library"/);
  assert.match(bad({ app: "tane", schema: 1, stores: { meta: [] } }).error, /unknown section "meta"/);
  assert.match(bad({ app: "tane", schema: 1, stores: {} }).error, /no data/);
  assert.match(bad({ app: "tane", schema: 1, stores: { notes: {} } }).error, /not a list/);
  assert.match(bad({ app: "tane", schema: 1, stores: { notes: [{ text: "no id" }] } }).error, /valid "id"/);
});

test("the delete tombstones travel in a backup, and a schema 1 file still imports", () => {
  const b = buildBackup({ notes: [], deleted: [{ id: 'notes:"n1"', store: "notes", key: "n1", at: "2026-11-21T10:00:00.000Z" }] });
  assert.equal(b.schema, 2);
  assert.equal(b.stores.deleted.length, 1);
  assert.ok(parseBackup(JSON.stringify(b)).ok);
  const old = parseBackup(JSON.stringify({ app: APP_ID, schema: 1, stores: { notes: [{ id: "n1", text: "x" }] } }));
  assert.ok(old.ok);
  assert.deepEqual(countRecords({ notes: [{ id: 1 }], deleted: [{ id: 2 }] }), { notes: 1, myIdeas: 0, days: 0 });
});

test("a record with bad text or links is refused", () => {
  const file = (rec) => JSON.stringify({ app: "tane", schema: 2, stores: { notes: [rec] } });
  assert.equal(parseBackup(file({ id: "n1", text: 3 })).ok, false);
  assert.equal(parseBackup(file({ id: "n1", text: "ok", links: "x" })).ok, false);
  assert.equal(parseBackup(file({ id: "n1", text: "ok", links: [null] })).ok, false);
  assert.equal(parseBackup(file({ id: "n1", text: "ok", links: [] })).ok, true);
});

test("notes need text and tombstones need a store and a time", () => {
  const file = (stores) => JSON.stringify({ app: "tane", schema: 2, stores });
  assert.equal(parseBackup(file({ myIdeas: [{ id: "m1" }] })).ok, false);
  assert.equal(parseBackup(file({ deleted: [{ id: "notes:\"n1\"" }] })).ok, false);
  assert.equal(parseBackup(file({ deleted: [{ id: "notes:\"n1\"", store: "notes", key: "n1", at: "2026-01-01T00:00:00Z" }] })).ok, true);
});
