import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLibrary, buildIndex } from "../library.js";
import { parseHash } from "../router.js";
import { contextFor, resolveLink, cleanLinks, addLink, removeLink, setKind, linkTargets, searchMine, makeNote, promote, mineAbout, linksTo, KINDS } from "../notes.js";

const ix = buildIndex(parseLibrary(readFileSync(new URL("../demo/library.json", import.meta.url), "utf8")).library);
const mine = (ideas = []) => ({ idea: (id) => ideas.find((m) => m.id === id) ?? null });

test("the + note links itself to what is on screen", () => {
  assert.deepEqual(contextFor(parseHash("#explore/idea/idea-0a1b01"), ix), { context: { screen: "explore", type: "idea", id: "idea-0a1b01" }, links: [{ to: "idea-0a1b01", type: "idea", kind: "about" }] });
  assert.deepEqual(contextFor(parseHash("#explore/theme/theme-1a2b3c"), ix).links, [{ to: "theme-1a2b3c", type: "theme", kind: "about" }]);
  assert.deepEqual(contextFor(parseHash("#explore/area/area-a1c3e5"), ix).links, [{ to: "area-a1c3e5", type: "area", kind: "about" }]);
  // Areas, Mine and an unknown id: a free-standing note.
  assert.deepEqual(contextFor(parseHash("#explore"), ix).links, []);
  assert.deepEqual(contextFor(parseHash("#explore/idea/nope"), ix).links, []);
  assert.deepEqual(contextFor(parseHash("#mine"), ix), { context: { screen: "mine" }, links: [] });
  assert.deepEqual(contextFor(parseHash("#mine/idea/mine-1"), ix).links, [{ to: "mine-1", type: "myIdea", kind: "builds on" }]);
  assert.deepEqual(contextFor(parseHash("#explore/idea/idea-0a1b01"), null).links, []);
});

test("links: one per target, known kinds and types only, change kind, remove", () => {
  let l = cleanLinks([{ to: "a", type: "idea", kind: "agrees" }, { to: "a", type: "idea", kind: "about" }, { to: "b", type: "nope" }, { to: "c", type: "theme", kind: "weird" }]);
  assert.deepEqual(l, [{ to: "a", type: "idea", kind: "agrees" }, { to: "c", type: "theme", kind: "about" }]);
  l = addLink(l, { to: "q-d120a", type: "quote" });
  assert.equal(l.length, 3);
  l = setKind(l, { to: "c", type: "theme" }, "disagrees");
  assert.equal(l[1].kind, "disagrees");
  l = removeLink(l, { to: "a", type: "idea" });
  assert.deepEqual(l.map((x) => x.to), ["c", "q-d120a"]);
  assert.deepEqual(KINDS, ["about", "agrees", "disagrees", "builds on"]);
});

test("a link resolves to its source item and page; a gone one still shows, marked", () => {
  const q = resolveLink({ to: "q-d120a", type: "quote", kind: "about" }, ix, mine());
  assert.equal(q.source, true);
  assert.match(q.href, /^#explore\/idea\//);
  assert.match(q.label, /^“/);
  const v = resolveLink({ to: "1000000012", type: "video", kind: "about" }, ix, mine());
  assert.match(v.href, /^#explore\/idea\//);
  const gone = resolveLink({ to: "idea-gone", type: "idea", kind: "about" }, ix, mine());
  assert.equal(gone.missing, true);
  const own = resolveLink({ to: "m1", type: "myIdea", kind: "builds on" }, ix, mine([{ id: "m1", text: "My idea" }]));
  assert.deepEqual([own.source, own.label, own.href], [false, "My idea", "#mine/idea/m1"]);
  assert.equal(resolveLink({ to: "m2", type: "myIdea" }, ix, mine()).missing, true);
});

test("a note on an idea's quote or video counts as about that idea", () => {
  const n = { links: [{ to: "q-d120a", type: "quote", kind: "about" }] };
  assert.ok(linksTo(n, "idea", "idea-0a1b01", ix));
  assert.ok(!linksTo(n, "idea", "idea-0a1b02", ix));
  const { notes } = mineAbout("idea", "idea-0a1b01", [{ id: "n1", createdAt: "1", ...n }], [], ix);
  assert.equal(notes.length, 1);
});

test("the Add a link search finds areas, themes, active ideas and own ideas, minus ones already linked", () => {
  const hits = linkTargets("boredom", ix, [{ id: "m1", text: "Boredom is my compass" }]);
  assert.ok(hits.some((h) => h.type === "theme" && h.id === "theme-2b3c4d"));
  assert.ok(hits.some((h) => h.type === "myIdea"));
  assert.ok(!linkTargets("boredom", ix, [], { exclude: [{ type: "theme", to: "theme-2b3c4d" }] }).some((h) => h.id === "theme-2b3c4d"));
  assert.deepEqual(linkTargets("  ", ix), []);
  assert.ok(linkTargets("e", ix, [], { max: 3 }).length <= 3);
});

test("search matches the owner's words and what they link to, accents and case aside", () => {
  const list = [
    { id: "n1", text: "Café thoughts", links: [] },
    { id: "n2", text: "Other", links: [{ to: "theme-2b3c4d", type: "theme", kind: "about" }] },
  ];
  assert.deepEqual(searchMine("cafe", list, ix, mine()).map((r) => r.id), ["n1"]);
  assert.deepEqual(searchMine("BOREDOM other", list, ix, mine()).map((r) => r.id), ["n2"]);
  assert.equal(searchMine("", list, ix, mine()).length, 2);
});

test("a new note and promoting it to an own idea keep each other's id", () => {
  const now = new Date("2026-11-22T09:00:00.000Z");
  const n = makeNote({ text: "  A thought  ", links: [{ to: "idea-0a1b01", type: "idea", kind: "agrees" }], context: { screen: "explore", type: "idea", id: "idea-0a1b01" }, promptId: "p-000001" }, now);
  assert.equal(n.text, "A thought");
  assert.equal(n.createdAt, now.toISOString());
  assert.match(n.id, /^note-/);
  assert.equal(n.promptId, "p-000001");
  const { idea, note } = promote(n, now);
  assert.match(idea.id, /^mine-/);
  assert.equal(idea.fromNote, n.id);
  assert.equal(note.ideaId, idea.id);
  assert.deepEqual(idea.links, n.links);
  assert.equal(idea.text, "A thought");
});
