import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLibrary, buildIndex } from "../library.js";
import { renderExplore, shorten } from "../explore-view.js";
import { parseHash } from "../router.js";

const lib = parseLibrary(readFileSync(new URL("../demo/library.json", import.meta.url), "utf8")).library;
const ix = buildIndex(lib);
const page = (hash) => renderExplore(parseHash(hash), ix, "");

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
