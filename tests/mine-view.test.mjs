import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLibrary, buildIndex } from "../library.js";
import { parseHash } from "../router.js";
import { mineAbout } from "../notes.js";
import { renderMine, mineResults } from "../mine-view.js";

const ix = buildIndex(parseLibrary(readFileSync(new URL("../demo/library.json", import.meta.url), "utf8")).library);
const mineOf = (notes = [], ideas = []) => ({
  notes, ideas,
  note: (id) => notes.find((n) => n.id === id) ?? null,
  idea: (id) => ideas.find((m) => m.id === id) ?? null,
  about: (t, id) => mineAbout(t, id, notes, ideas, ix),
});
const notes = [
  { id: "note-1", text: "First <thought>", createdAt: "2026-11-20T09:00:00.000Z", links: [{ to: "idea-0a1b01", type: "idea", kind: "agrees" }], ideaId: "mine-1" },
  { id: "note-2", text: "Second", createdAt: "2026-11-21T09:00:00.000Z", links: [] },
  { id: "note-3", text: "Builds on mine", createdAt: "2026-11-21T10:00:00.000Z", links: [{ to: "mine-1", type: "myIdea", kind: "builds on" }] },
];
const ideas = [{ id: "mine-1", text: "My idea", fromNote: "note-1", createdAt: "2026-11-20T10:00:00.000Z", links: [{ to: "idea-0a1b01", type: "idea", kind: "agrees" }] }];

test("Mine lists own ideas, then notes newest first, each with You and its links", () => {
  const html = renderMine(parseHash("#mine"), ix, mineOf(notes, ideas), { syncLine: "Synced." });
  assert.equal(html.match(/<h2 [^>]*data-focus/g)?.length, 1);
  assert.ok(html.indexOf("Your ideas") < html.indexOf(">Notes"));
  assert.ok(html.indexOf("Builds on mine") < html.indexOf("Second") && html.indexOf("Second") < html.indexOf("First"));
  assert.match(html, /First &lt;thought&gt;/);
  assert.match(html, /Agrees with<\/span> <a href="#explore\/idea\/idea-0a1b01">/);
  assert.match(html, /A free-standing thought/);
  assert.match(html, /Made into <a href="#mine\/idea\/mine-1">your idea/);
  assert.match(html, /data-act="export-md"/);
  assert.match(html, /Synced\./);
  assert.match(html, /You · /);
});

test("search narrows the results; nothing written shows how to start", () => {
  const hit = mineResults(ix, mineOf(notes, ideas), "second");
  assert.match(hit, /Second/);
  assert.doesNotMatch(hit, /First/);
  assert.match(mineResults(ix, mineOf(notes, ideas), "zzz"), /Nothing you wrote matches/);
  const empty = renderMine(parseHash("#mine"), ix, mineOf());
  assert.match(empty, /Nothing written yet/);
  assert.match(empty, /data-act="export-md" disabled/);
});

test("an own idea's page: what it grew from, its note, what builds on it", () => {
  const html = renderMine(parseHash("#mine/idea/mine-1"), ix, mineOf(notes, ideas));
  assert.match(html, /Your idea/);
  assert.match(html, /Grew from[\s\S]*idea-0a1b01/);
  assert.match(html, /From your note[\s\S]*First &lt;thought&gt;/);
  assert.match(html, /Building on it[\s\S]*Builds on mine/);
  assert.match(html, /data-act="edit-idea" data-id="mine-1"/);
  assert.match(renderMine(parseHash("#mine/idea/nope"), ix, mineOf()), /Not found/);
  // Works with no library loaded.
  assert.match(renderMine(parseHash("#mine/idea/mine-1"), null, mineOf(notes, ideas)), /Not in the library on this device/);
});
