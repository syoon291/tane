import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLibrary, buildIndex } from "../library.js";
import { buildExport, toMarkdown, exportFileName, EXPORT_ID } from "../export.js";

const ix = buildIndex(parseLibrary(readFileSync(new URL("../demo/library.json", import.meta.url), "utf8")).library);
const now = new Date("2026-11-22T09:00:00.000Z");
const stores = {
  notes: [
    { id: "note-1", text: "Older note", createdAt: "2026-11-20T09:00:00.000Z", links: [{ to: "idea-0a1b01", type: "idea", kind: "disagrees" }], promptId: "p-000001", ideaId: "mine-1" },
    { id: "note-2", text: "Free thought", createdAt: "2026-11-21T09:00:00.000Z", links: [] },
    { id: "note-3", text: "On a gone idea", createdAt: "2026-11-19T09:00:00.000Z", links: [{ to: "idea-gone", type: "idea", kind: "about" }] },
  ],
  myIdeas: [{ id: "mine-1", text: "My idea", fromNote: "note-1", createdAt: "2026-11-21T10:00:00.000Z", links: [{ to: "idea-0a1b01", type: "idea", kind: "disagrees" }] }],
};

test("the export has every note and own idea, newest first, with the ids and text of what they link to", () => {
  const e = buildExport(stores, ix, now);
  assert.equal(e.app, EXPORT_ID);
  assert.equal(e.exportedAt, now.toISOString());
  assert.deepEqual(e.notes.map((n) => n.id), ["note-2", "note-1", "note-3"]);
  const l = e.notes[1].links[0];
  assert.deepEqual([l.to, l.type, l.kind, l.source], ["idea-0a1b01", "idea", "disagrees", true]);
  assert.equal(l.text, ix.idea("idea-0a1b01").claim);
  assert.equal(e.notes[1].prompt.id, "p-000001");
  assert.ok(e.notes[1].prompt.text);
  assert.equal(e.notes[1].ideaId, "mine-1");
  assert.deepEqual([e.notes[2].links[0].missing, e.notes[2].links[0].text], [true, null]);
  assert.equal(e.myIdeas[0].fromNote, "note-1");
});

test("the Markdown keeps the owner's words apart from the videos'", () => {
  const md = toMarkdown(buildExport(stores, ix, now));
  assert.match(md, /^# tane: what I wrote/);
  assert.match(md, /## My own ideas[\s\S]*> My idea[\s\S]*## Notes/);
  assert.match(md, /Disagrees with \(from the videos\) idea `idea-0a1b01`: "/);
  assert.match(md, /Links: none \(a free-standing thought\)/);
  assert.match(md, /\(no longer there\)/);
  assert.match(md, /Prompt \(from the videos\)/);
});

test("export without a library still lists what the owner wrote", () => {
  const e = buildExport(stores, null, now);
  assert.equal(e.notes.length, 3);
  assert.equal(e.notes[1].links[0].missing, true);
  assert.equal(exportFileName("md", now), "tane-mine-2026-11-22.md");
});
