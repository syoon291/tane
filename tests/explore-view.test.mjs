import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLibrary, buildIndex } from "../library.js";
import { renderExplore, shorten } from "../explore-view.js";
import { parseHash } from "../router.js";
import { mineAbout } from "../notes.js";

const lib = parseLibrary(readFileSync(new URL("../demo/library.json", import.meta.url), "utf8")).library;
const ix = buildIndex(lib);
// The owner's content as app.js hands it to the views (mine-store.js api).
const mineOf = (notes = [], ideas = []) => ({
  notes, ideas,
  note: (id) => notes.find((n) => n.id === id) ?? null,
  idea: (id) => ideas.find((m) => m.id === id) ?? null,
  about: (t, id) => mineAbout(t, id, notes, ideas, ix),
});
const page = (hash, mine = mineOf()) => renderExplore(parseHash(hash), ix, "", mine);
const note = (id, text, links, createdAt = "2026-11-21T10:00:00.000Z") => ({ id, text, createdAt, editedAt: createdAt, links, context: { screen: "explore" } });

test("every level has a breadcrumb and one focusable h2", () => {
  for (const h of ["#explore", "#explore/area/area-a1c3e5", "#explore/theme/theme-1a2b3c", "#explore/idea/idea-0a1b01"]) {
    const html = page(h);
    assert.match(html, /<nav class="crumbs" aria-label="Breadcrumb">/, h);
    assert.equal(html.match(/<h2 [^>]*data-focus/g)?.length, 1, h);
    assert.match(html, /aria-current="page"/, h);
  }
});

test("areas list shows themes and ideas counts", () => {
  assert.match(page("#explore"), /2 themes · 6 ideas/);
});

test("the idea page shows videos, links by kind, prompts, threads, core and a separate Your notes", () => {
  const html = page("#explore/idea/idea-0a1b01");
  assert.match(html, /Areas<\/a>.*Attention and time<\/a>.*Doing less, deliberately<\/a>/s);
  assert.match(html, /From the videos/);
  assert.match(html, /target="_blank" rel="noopener noreferrer">Open in TikTok/);
  assert.match(html, /kind-supports/);
  assert.match(html, /kind-contradicts/);
  assert.match(html, /Write about it/);
  assert.match(html, /Core belief/);
  assert.match(html, /<p class="thread-title">Slowing down<\/p>/);
  // Your notes sits after (outside) the source block.
  const src = html.indexOf('<div class="source">'), mine = html.indexOf('class="mine-section"');
  assert.ok(src > 0 && mine > src && html.lastIndexOf("</div>", mine) > src);
});

test("a retired idea with a gone theme opens, marked retired, breadcrumb Areas then idea", () => {
  const html = page("#explore/idea/idea-0a1b10");
  assert.match(html, /retired/);
  assert.match(html, /<ol><li><a href="#explore">Areas<\/a><\/li><li><span aria-current="page">/);
  assert.doesNotMatch(page("#explore/theme/theme-1a2b3c"), /idea-0a1b10/);
});

test("unknown ids show Not found", () => {
  assert.match(page("#explore/idea/idea-nope"), /Not found/);
  assert.match(page("#explore/theme/nope"), /Not found/);
});

test("library text is escaped", () => {
  const evil = parseLibrary({ schema: "tane-library", v: 1, areas: [{ id: "a", name: "<img src=x>" }], themes: [], ideas: [], videos: [] }).library;
  assert.doesNotMatch(renderExplore(parseHash("#explore/area/a"), buildIndex(evil), ""), /<img/);
});

test("shorten cuts at a word", () => {
  assert.equal(shorten("short"), "short");
  assert.equal(shorten("Doing fewer things well leaves more room than doing many things fast."), "Doing fewer things well leaves more…");
});

test("the owner's notes show in Your notes, after the source block, with You and the kind", () => {
  const mine = mineOf([
    note("n1", "My own <b>take</b>", [{ to: "idea-0a1b01", type: "idea", kind: "disagrees" }]),
    note("n2", "About the quote", [{ to: "q-d120a", type: "quote", kind: "about" }], "2026-11-22T10:00:00.000Z"),
    note("n3", "Elsewhere", [{ to: "idea-0a1b02", type: "idea", kind: "about" }]),
  ]);
  const html = page("#explore/idea/idea-0a1b01", mine);
  const src = html.indexOf('<div class="source">'), sec = html.indexOf('class="mine-section"');
  assert.ok(sec > src);
  const yours = html.slice(sec);
  assert.match(yours, /My own &lt;b&gt;take&lt;\/b&gt;/);
  assert.match(yours, /Disagrees with this/);
  assert.match(yours, /You · /);
  // A note on one of the idea's quotes counts, newest first.
  assert.ok(yours.indexOf("About the quote") < yours.indexOf("My own"));
  assert.doesNotMatch(yours, /Elsewhere/);
  // The owner's words never sit inside the source block.
  assert.doesNotMatch(html.slice(0, sec), /My own|About the quote/);
});

test("idea pages offer note buttons on videos, quotes and questions; without mine there are none", () => {
  const html = page("#explore/idea/idea-0a1b01");
  assert.match(html, /data-act="note" data-type="video" data-id="1000000012"/);
  assert.match(html, /data-act="note" data-type="quote" data-id="q-d120a"/);
  assert.match(html, /data-prompt="p-000001"/);
  assert.match(html, /Nothing yet/);
  const bare = renderExplore(parseHash("#explore/idea/idea-0a1b01"), ix, "");
  assert.doesNotMatch(bare, /data-act="note"|mine-section/);
});

test("area and theme pages show Your notes only when there are some", () => {
  assert.doesNotMatch(page("#explore/theme/theme-1a2b3c"), /mine-section/);
  const mine = mineOf([note("n1", "On the theme", [{ to: "theme-1a2b3c", type: "theme", kind: "about" }])]);
  assert.match(page("#explore/theme/theme-1a2b3c", mine), /mine-section[\s\S]*On the theme/);
});
