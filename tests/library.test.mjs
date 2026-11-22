import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLibrary, buildIndex, plural } from "../library.js";

const demoText = readFileSync(new URL("../demo/library.json", import.meta.url), "utf8");
const demo = () => JSON.parse(demoText);
const base = () => ({
  schema: "tane-library", v: 1, generatedAt: "2026-01-01T00:00:00Z",
  areas: [{ id: "area-1", name: "A", summary: "s" }, { id: "area-2", name: "Empty area", summary: "" }],
  themes: [{ id: "theme-1", areaId: "area-1", name: "T1", summary: "" }, { id: "theme-2", areaId: "area-1", name: "T2", summary: "", folder: "relatable" }],
  ideas: [
    { id: "idea-1", themeId: "theme-1", claim: "One", videoIds: ["v1", "v2"], prompts: [{ id: "p-1", text: "Why?" }], status: "active" },
    { id: "idea-2", themeId: "theme-1", claim: "Two", videoIds: ["v2"], prompts: [], status: "active" },
    { id: "idea-3", themeId: "theme-2", claim: "Three", videoIds: ["v3"], prompts: [], status: "active" },
  ],
  videos: ["v1", "v2", "v3"].map((id) => ({ id, title: id, creator: "@demo", url: `https://www.tiktok.com/@demo/video/${id}`, summary: "", keyIdeas: [], quotes: [] })),
  links: [{ from: "idea-1", to: "idea-2", kind: "supports", why: "w" }],
  threads: [{ id: "th-1", title: "Title", question: "Q?", ideaIds: ["idea-1", "idea-3"] }],
  core: [{ id: "c-1", belief: "B", ideaIds: ["idea-2"] }],
});
const ix = (lib) => { const r = parseLibrary(lib); assert.equal(r.ok, true, r.error); return buildIndex(r.library); };

test("the demo library parses cleanly and has every feature", () => {
  const r = parseLibrary(demoText);
  assert.equal(r.ok, true);
  assert.equal(r.skipped, 0);
  const i = buildIndex(r.library);
  assert.deepEqual(i.totals, { areas: 3, themes: 6, ideas: 15, videos: 12, threads: 2, core: 1 });
  const kinds = new Set(r.library.links.map((l) => l.kind));
  assert.deepEqual([...kinds].sort(), ["contradicts", "extends", "supports"]);
  assert.ok(r.library.ideas.some((x) => x.status === "retired"));
});

test("rejects a wrong schema or version with a clear message", () => {
  assert.match(parseLibrary("{nope").error, /not valid JSON/);
  assert.match(parseLibrary("[]").error, /not a tane library/);
  assert.match(parseLibrary({ ...base(), schema: "other" }).error, /schema is "other", expected "tane-library"/);
  assert.match(parseLibrary({ ...base(), v: 2 }).error, /version 2, newer than this app reads/);
  assert.match(parseLibrary({ ...base(), v: 0 }).error, /version 0; this app reads version 1/);
  assert.match(parseLibrary({ ...base(), v: "1" }).error, /no valid version/);
  const noIdeas = base(); delete noIdeas.ideas;
  assert.match(parseLibrary(noIdeas).error, /no "ideas" list/);
  assert.match(parseLibrary({ ...base(), links: {} }).error, /"links" is not a list/);
});

test("tolerates unknown fields and missing optional lists", () => {
  const lib = { ...base(), extra: { anything: 1 }, links: undefined, threads: undefined, core: undefined };
  lib.areas[0].color = "red";
  const r = parseLibrary(lib);
  assert.equal(r.ok, true);
  assert.equal(r.library.areas[0].color, undefined);
  assert.deepEqual(r.library.links, []);
});

test("index counts ideas and distinct videos per idea, theme and area", () => {
  const i = ix(base());
  assert.equal(i.ideaCount("idea-1"), 2);
  assert.deepEqual(i.themeStats("theme-1"), { ideas: 2, videos: 2 });
  assert.deepEqual(i.areaStats("area-1"), { themes: 2, ideas: 3, videos: 3 });
  assert.deepEqual(i.areaStats("area-2"), { themes: 0, ideas: 0, videos: 0 });
  assert.deepEqual(i.themesOf("area-1").map((t) => t.id), ["theme-1", "theme-2"]);
  assert.equal(i.folderOf("theme-2"), "relatable");
  assert.equal(i.folderOf("theme-1"), "");
});

test("array order is display order", () => {
  const lib = base();
  lib.ideas.reverse();
  assert.deepEqual(ix(lib).ideasOf("theme-1").map((x) => x.id), ["idea-2", "idea-1"]);
});

test("links show on both ideas with their direction", () => {
  const i = ix(base());
  assert.deepEqual(i.linksOf("idea-1"), [{ kind: "supports", other: "idea-2", dir: "out", why: "w" }]);
  assert.deepEqual(i.linksOf("idea-2"), [{ kind: "supports", other: "idea-1", dir: "in", why: "w" }]);
  assert.equal(i.threadsOf("idea-3")[0].title, "Title");
  assert.equal(i.coreOf("idea-2")[0].belief, "B");
});

test("retired ideas leave the lists but open by id, even when their theme is gone", () => {
  const lib = base();
  lib.ideas.push({ id: "idea-r", themeId: "theme-gone", claim: "Old", videoIds: ["v1"], prompts: [], status: "retired" });
  lib.ideas[1].status = "retired";
  lib.links.push({ from: "idea-r", to: "idea-1", kind: "contradicts", why: "" });
  const i = ix(lib);
  assert.deepEqual(i.ideasOf("theme-1").map((x) => x.id), ["idea-1"]);
  assert.equal(i.idea("idea-2").status, "retired");
  assert.equal(i.idea("idea-r").status, "retired");
  assert.deepEqual(i.parentsOf("idea-r"), { theme: null, area: null });
  assert.equal(i.parentsOf("idea-2").area.id, "area-1");
  assert.equal(i.totals.ideas, 2);
  assert.ok(i.linksOf("idea-1").some((l) => l.other === "idea-r" && l.kind === "contradicts"));
});

test("dangling ids are skipped, never fatal", () => {
  const lib = base();
  lib.themes.push({ id: "theme-x", areaId: "area-missing", name: "Orphan" });
  lib.ideas.push({ id: "idea-x", themeId: "theme-missing", claim: "Orphan idea", videoIds: [], prompts: [], status: "active" });
  lib.ideas[0].videoIds.push("v-missing", "v1");
  lib.links.push({ from: "idea-1", to: "idea-missing", kind: "extends", why: "" }, { from: "idea-1", to: "idea-2", kind: "weird", why: "" }, { from: "idea-1", to: "idea-1", kind: "supports" });
  lib.threads.push({ id: "th-2", question: "Gone?", ideaIds: ["idea-missing"] });
  lib.core[0].ideaIds.push("idea-missing");
  const i = ix(lib);
  assert.equal(i.theme("theme-x"), null);
  assert.equal(i.idea("idea-x"), null);
  assert.deepEqual(i.idea("idea-1").videoIds, ["v1", "v2"]);
  assert.equal(i.linksOf("idea-1").length, 1);
  assert.equal(i.totals.threads, 1);
  assert.deepEqual(i.coreOf("idea-2")[0].ideaIds, ["idea-2"]);
});

test("malformed items are skipped and counted; duplicates keep the first", () => {
  const lib = base();
  lib.areas.push(null, { name: "no id" }, { id: "area-1", name: "dupe" });
  lib.ideas.push({ id: "idea-9", themeId: "theme-1", claim: "", videoIds: [] });
  const r = parseLibrary(lib);
  assert.equal(r.ok, true);
  assert.equal(r.skipped, 4);
  assert.equal(r.library.areas.find((a) => a.id === "area-1").name, "A");
});

test("only https video links survive", () => {
  const lib = base();
  lib.videos[0].url = "javascript:alert(1)";
  lib.videos[1].url = "http://example.com/x";
  const i = ix(lib);
  assert.equal(i.video("v1").url, "");
  assert.equal(i.video("v2").url, "");
  assert.match(i.video("v3").url, /^https:/);
});

test("plural", () => {
  assert.equal(plural(1, "idea"), "1 idea");
  assert.equal(plural(0, "idea"), "0 ideas");
});
