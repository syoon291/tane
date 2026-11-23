import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLibrary, buildIndex } from "../library.js";
import { mapModel, layout, wrapLines, foldersOf, roomOf, MAP_WIDTH } from "../map-model.js";
import { renderExplore } from "../explore-view.js";
import { parseHash } from "../router.js";
import { mineAbout } from "../notes.js";

const lib = parseLibrary(readFileSync(new URL("../demo/library.json", import.meta.url), "utf8")).library;
const ix = buildIndex(lib);
const mineOf = (notes = [], ideas = []) => ({
  notes, ideas,
  note: (id) => notes.find((n) => n.id === id) ?? null,
  idea: (id) => ideas.find((m) => m.id === id) ?? null,
  about: (t, id) => mineAbout(t, id, notes, ideas, ix),
});
const note = (id, links) => ({ id, text: "A made-up note", createdAt: "2026-11-21T10:00:00.000Z", links });
const own = (id, links) => ({ id, text: "A made-up idea of my own", createdAt: "2026-11-21T10:00:00.000Z", links });
const ids = (m, kind) => m.nodes.filter((n) => !kind || n.kind === kind).map((n) => n.id);
const page = (hash, mine = mineOf(), map = { view: "map", show: "all", folder: "" }) => renderExplore(parseHash(hash), ix, "", mine, map);

test("wrapLines breaks at words and ends a cut with an ellipsis", () => {
  assert.deepEqual(wrapLines("Attention and time", 12), ["Attention", "and time"]);
  const out = wrapLines("one two three four five six seven eight nine ten", 8, 2);
  assert.equal(out.length, 2);
  assert.match(out[1], /…$/);
});

test("the areas level has one bubble per area, sized by idea count", () => {
  const m = mapModel("areas", null, ix, mineOf());
  assert.deepEqual(ids(m, "area"), ix.areas.map((a) => a.id));
  const byCount = [...m.nodes].sort((a, b) => a.count - b.count);
  for (let k = 1; k < byCount.length; k++) assert.ok(byCount[k].r >= byCount[k - 1].r);
  for (const n of m.nodes) assert.equal(n.count, ix.areaStats(n.id).ideas);
});

test("links between areas are summed per pair and kind", () => {
  const m = mapModel("areas", null, ix, mineOf());
  // idea-0a1b08 (Self and change) contradicts idea-0a1b01 (Attention and time).
  assert.ok(m.edges.some((e) => e.kind === "contradicts" && [e.from, e.to].sort().join() === ["area-a1c3e5", "area-b2d4f6"].join()));
  for (const e of m.edges) assert.notEqual(e.from, e.to);
});

test("an area shows its themes; a theme shows its ideas, with linked ideas from elsewhere as ghosts", () => {
  assert.deepEqual(ids(mapModel("area", "area-a1c3e5", ix, mineOf()), "theme"), ix.themesOf("area-a1c3e5").map((t) => t.id));
  const m = mapModel("theme", "theme-1a2b3c", ix, mineOf());
  assert.deepEqual(ids(m, "idea"), ix.ideasOf("theme-1a2b3c").map((i) => i.id));
  assert.ok(ids(m, "ghost").includes("idea-0a1b08"));
  assert.ok(m.edges.some((e) => e.kind === "supports"));
  // Retired ideas never show on the map.
  assert.ok(!ids(m).includes("idea-0a1b10"));
});

test("filters: written about, not yet touched, my ideas only, folder", () => {
  const mine = mineOf([note("note-1", [{ type: "idea", to: "idea-0a1b01", kind: "about" }])], [own("mine-1", [{ type: "idea", to: "idea-0a1b05", kind: "builds on" }])]);
  const written = mapModel("theme", "theme-1a2b3c", ix, mine, { show: "written" });
  assert.deepEqual(ids(written, "idea"), ["idea-0a1b01"]);
  const untouched = mapModel("theme", "theme-1a2b3c", ix, mine, { show: "untouched" });
  assert.ok(!ids(untouched).includes("idea-0a1b01"));
  assert.ok(!ids(untouched, "mine").length);
  const onlyMine = mapModel("areas", null, ix, mine, { show: "mine" });
  const areaOf5 = ix.parentsOf("idea-0a1b05").area.id;
  assert.deepEqual(ids(onlyMine, "area"), [areaOf5]);
  assert.deepEqual(ids(onlyMine, "mine"), ["mine-1"]);
  const [folder] = foldersOf(ix);
  const inFolder = mapModel("areas", null, ix, mineOf(), { folder });
  for (const n of inFolder.nodes) assert.ok(ix.themesOf(n.id).some((t) => t.folder === folder));
  assert.ok(inFolder.nodes.length < ix.areas.length);
});

test("own ideas join the items they link to, on every level", () => {
  const mine = mineOf([], [own("mine-1", [{ type: "idea", to: "idea-0a1b01", kind: "builds on" }]), own("mine-2", [])]);
  const areas = mapModel("areas", null, ix, mine);
  assert.deepEqual(ids(areas, "mine"), ["mine-1", "mine-2"]);
  assert.ok(areas.edges.some((e) => e.kind === "mine" && e.from === "mine-1" && e.to === "area-a1c3e5"));
  const theme = mapModel("theme", "theme-1a2b3c", ix, mine);
  assert.deepEqual(ids(theme, "mine"), ["mine-1"]);
  assert.ok(theme.edges.some((e) => e.kind === "mine" && e.to === "idea-0a1b01"));
  assert.equal(theme.nodes.find((n) => n.id === "mine-1").href, "#mine/idea/mine-1");
});

test("the layout keeps nodes apart, inside the width, and is the same every time", () => {
  const mine = mineOf([], [own("mine-1", [{ type: "idea", to: "idea-0a1b01", kind: "builds on" }])]);
  for (const [lv, id] of [["areas", null], ["area", "area-a1c3e5"], ["theme", "theme-1a2b3c"]]) {
    const m = mapModel(lv, id, ix, mine);
    const L = layout(m.nodes, m.edges);
    const pts = m.nodes.map((n) => ({ ...L.pos.get(n.id), room: roomOf(n) }));
    for (const p of pts) {
      assert.ok(p.x - p.room >= 0 && p.x + p.room <= MAP_WIDTH, `${lv} x in bounds`);
      assert.ok(p.y - p.room >= 0 && p.y + p.room <= L.height, `${lv} y in bounds`);
    }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) >= pts[i].room + pts[j].room - 1, `${lv} no overlap`);
    }
    assert.deepEqual([...layout(m.nodes, m.edges).pos], [...L.pos]);
  }
});

test("Explore opens on the map: bubbles are links, with the toggle, filters and key", () => {
  const html = page("#explore");
  assert.match(html, /<svg class="map-svg"[^>]*role="group" aria-label="Map of areas/);
  assert.match(html, /<a class="node node-area" href="#explore\/area\/area-a1c3e5" data-zoom aria-label="Attention and time, 2 themes, 6 ideas"/);
  assert.match(html, /data-act="map-view" data-id="map" aria-pressed="true"/);
  assert.match(html, /data-act="map-show" data-id="untouched"/);
  assert.match(html, /<select id="map-folder">/);
  assert.match(html, /class="map-legend"/);
  assert.doesNotMatch(html, /<ul class="rows"><li><a class="row" href="#explore\/area/);
  // Theme level: Back goes to the area; ideas open their page.
  const theme = page("#explore/theme/theme-1a2b3c");
  assert.match(theme, /class="back-link" href="#explore\/area\/area-a1c3e5"/);
  assert.match(theme, /<a class="node node-idea" href="#explore\/idea\/idea-0a1b01"/);
  assert.match(theme, /Your notes|Claude's take/);
});

test("the List toggle shows the plain list of the same level, and an empty filter offers a reset", () => {
  const list = page("#explore/area/area-a1c3e5", mineOf(), { view: "list", show: "all", folder: "" });
  assert.match(list, /data-id="list" aria-pressed="true"/);
  assert.match(list, /<h3 id="themes-h">Themes<\/h3>/);
  assert.doesNotMatch(list, /<svg class="map-svg"/);
  const empty = page("#explore", mineOf(), { view: "map", show: "written", folder: "" });
  assert.match(empty, /Nothing here matches these filters/);
  assert.match(empty, /data-act="map-reset"/);
});
