// Claude's take: perspectives and discussions in the library, the collapsed
// section, Reply (a note with a "reply" link), Discussions, the Mine filter
// and the export.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLibrary, buildIndex } from "../library.js";
import { parseHash, hrefFor } from "../router.js";
import { renderExplore } from "../explore-view.js";
import { renderMine, mineResults } from "../mine-view.js";
import { cleanLinks, setKind, replyLinks, resolveLink, contextFor, mineAbout, isReply, makeNote } from "../notes.js";
import { buildExport, toMarkdown } from "../export.js";
import { contrastFailures, hue } from "../scripts/contrast.mjs";

const demoText = readFileSync(new URL("../demo/library.json", import.meta.url), "utf8");
const ix = buildIndex(parseLibrary(demoText).library);
const mineOf = (notes = [], ideas = []) => ({
  notes, ideas,
  note: (id) => notes.find((n) => n.id === id) ?? null,
  idea: (id) => ideas.find((m) => m.id === id) ?? null,
  about: (t, id) => mineAbout(t, id, notes, ideas, ix),
});
const page = (hash, mine = mineOf()) => renderExplore(parseHash(hash), ix, "", mine);
const small = () => ({
  schema: "tane-library", v: 1,
  areas: [{ id: "area-1", name: "A" }],
  themes: [{ id: "theme-1", areaId: "area-1", name: "T" }],
  ideas: [
    { id: "idea-1", themeId: "theme-1", claim: "One", videoIds: [], prompts: [] },
    { id: "idea-2", themeId: "theme-1", claim: "Two", videoIds: [], prompts: [] },
  ],
  videos: [],
});

test("the demo has a take on every area, theme and active idea, and discussions", () => {
  assert.equal(ix.totals.perspectives, ix.totals.areas + ix.totals.themes + ix.totals.ideas);
  assert.ok(ix.totals.discussions >= 2);
  const p = ix.perspectiveOf("idea-0a1b08");
  assert.deepEqual([p.type, p.verdict, !!p.better, !!p.question], ["idea", "push back", true, true]);
});

test("perspectives and discussions: bad items skipped, unknown verdicts dropped, dangling targets and sides gone", () => {
  const lib = small();
  lib.perspectives = [
    { id: "p1", target: "idea-1", verdict: "holds up", take: "Fine.", question: "Q?" },
    { id: "p2", target: "idea-1", verdict: "mixed", take: "A second take on the same idea." },
    { id: "p3", target: "theme-1", verdict: "nonsense", take: "Odd verdict." },
    { id: "p4", target: "gone", take: "On nothing." },
    { id: "p5", target: "area-1" },
  ];
  lib.discussions = [
    { id: "d1", title: "One or two", sides: ["idea-1", "idea-2", "gone"], take: "T", question: "Q" },
    { id: "d2", title: "Lonely", sides: ["idea-1", "gone"], take: "T" },
  ];
  const r = parseLibrary(lib);
  assert.equal(r.ok, true);
  assert.equal(r.skipped, 1); // p5 has no take
  const x = buildIndex(r.library);
  assert.equal(x.perspectiveOf("idea-1").id, "p1");
  assert.equal(x.perspectiveOf("theme-1").verdict, "");
  assert.equal(x.perspective("p4"), null);
  assert.deepEqual(x.discussions.map((d) => d.id), ["d1"]);
  assert.deepEqual(x.discussion("d1").sides, ["idea-1", "idea-2"]);
  assert.deepEqual(x.discussionsOf("idea-2").map((d) => d.id), ["d1"]);
});

test("a library without perspectives still works, and a non-list one is refused", () => {
  const x = buildIndex(parseLibrary(small()).library);
  assert.equal(x.perspectiveOf("idea-1"), null);
  assert.deepEqual(x.discussions, []);
  assert.equal(parseLibrary({ ...small(), perspectives: {} }).ok, false);
  assert.ok(!renderExplore(parseHash("#explore/idea/idea-1"), x, "", mineOf()).includes("claude-take"));
});

test("routes for the discussions list and one discussion", () => {
  assert.deepEqual(parseHash("#explore/discussions"), { tab: "explore", level: "discussions", id: null });
  assert.deepEqual(parseHash(hrefFor("discussion", "disc-1")), { tab: "explore", level: "discussion", id: "disc-1" });
  assert.equal(hrefFor("discussions"), "#explore/discussions");
});

test("Claude's take is a collapsed disclosure with its label, verdict, better version, question and Reply", () => {
  for (const h of ["#explore/area/area-a1c3e5", "#explore/theme/theme-1a2b3c", "#explore/idea/idea-0a1b08"]) {
    const html = page(h);
    assert.match(html, /<details class="claude-take"[^>]*>\s*<summary>/, h);
    assert.ok(!/<details class="claude-take"[^>]*\sopen[\s=>]/.test(html), `${h} starts closed`);
    assert.match(html, /Claude · perspective/, h);
    assert.match(html, /data-act="reply" data-type="perspective"/, h);
  }
  const idea = page("#explore/idea/idea-0a1b08");
  assert.match(idea, /Verdict: <\/span>Push back/);
  assert.match(idea, /A better version/);
  assert.match(idea, /Claude asks/);
  assert.match(idea, /In Claude's discussions/);
  // Claude's take sits outside both the videos' block and "Your notes".
  const take = idea.indexOf("claude-take"), src = idea.indexOf('class="source"'), notes = idea.indexOf("mine-section");
  assert.ok(take < src && src < notes);
});

test("Areas links to Discussions; a discussion shows its sides from the videos, Claude's take and Reply", () => {
  assert.match(page("#explore"), /href="#explore\/discussions"/);
  const list = page("#explore/discussions");
  assert.match(list, /Start now, or do fewer things\?/);
  const d = page("#explore/discussion/disc-01a2b3");
  assert.match(d, /The two sides, from the videos/);
  assert.match(d, /href="#explore\/idea\/idea-0a1b08"/);
  assert.match(d, /data-act="reply" data-type="discussion"/);
  assert.match(d, /Your notes/);
  assert.match(page("#explore/discussion/nope"), /Not found/);
});

test("Reply links the take (kind reply) and what it is about; reply goes with take links only", () => {
  const links = replyLinks(ix, "perspective", "persp-0a1b08");
  assert.deepEqual(links, [{ to: "persp-0a1b08", type: "perspective", kind: "reply" }, { to: "idea-0a1b08", type: "idea", kind: "about" }]);
  assert.deepEqual(replyLinks(ix, "discussion", "disc-01a2b3").map((l) => l.to), ["disc-01a2b3", "idea-0a1b08", "idea-0a1b01"]);
  assert.deepEqual(cleanLinks([{ to: "persp-0a1b08", type: "perspective", kind: "agrees" }, { to: "idea-0a1b01", type: "idea", kind: "reply" }]).map((l) => l.kind), ["reply", "about"]);
  assert.equal(setKind(links, links[0], "agrees")[0].kind, "reply");
  const r = resolveLink(links[0], ix);
  assert.deepEqual([r.claude, r.source, r.href], [true, false, "#explore/idea/idea-0a1b08"]);
  assert.match(r.label, /^Claude's take on Starting badly/);
  assert.equal(resolveLink({ to: "persp-gone", type: "perspective", kind: "reply" }, ix).missing, true);
  assert.deepEqual(contextFor(parseHash("#explore/discussion/disc-01a2b3"), ix).links[0], { to: "disc-01a2b3", type: "discussion", kind: "reply" });
});

const reply = { ...makeNote({ text: "I start badly on purpose.", links: replyLinks(ix, "perspective", "persp-0a1b08") }, new Date("2026-11-22T08:00:00.000Z")), id: "note-r" };
const plain = { id: "note-p", text: "Plain note", createdAt: "2026-11-22T07:00:00.000Z", links: [{ to: "idea-0a1b08", type: "idea", kind: "agrees" }] };

test("a reply shows in Your notes on the item as 'Replying to Claude's take on …'", () => {
  const html = page("#explore/idea/idea-0a1b08", mineOf([reply, plain]));
  const notes = html.slice(html.indexOf("mine-section"));
  assert.match(notes, /class="reply-to"><span class="claude-mark" aria-hidden="true"><\/span>Replying to <a href="#explore\/idea\/idea-0a1b08">Claude&#39;s take on Starting badly/);
  assert.ok(isReply(reply) && !isReply(plain));
});

test("Mine filters to replies to Claude", () => {
  const mine = mineOf([reply, plain]);
  const all = renderMine(parseHash("#mine"), ix, mine, {});
  assert.match(all, /data-act="mine-filter" data-id="replies" aria-pressed="false">Replies to Claude/);
  const only = mineResults(ix, mine, "", "replies");
  assert.ok(only.includes("I start badly") && !only.includes("Plain note"));
  assert.match(mineResults(ix, mineOf([plain]), "", "replies"), /No replies to Claude yet/);
  assert.match(renderMine(parseHash("#mine"), ix, mine, { filter: "replies" }), /data-id="replies" aria-pressed="true"/);
});

test("the export carries each reply with the take it answers, Claude's words apart from the owner's", () => {
  const disc = { id: "note-d", text: "Both, at different times.", createdAt: "2026-11-22T09:00:00.000Z", links: replyLinks(ix, "discussion", "disc-01a2b3") };
  const e = buildExport({ notes: [reply, plain, disc], myIdeas: [] }, ix);
  const r = e.notes.find((n) => n.id === "note-r").replyTo;
  assert.deepEqual([r.type, r.id, r.on.id, r.verdict, !!r.take, !!r.better, !!r.question], ["perspective", "persp-0a1b08", "idea-0a1b08", "push back", true, true, true]);
  assert.equal(e.notes.find((n) => n.id === "note-p").replyTo, null);
  const d = e.notes.find((n) => n.id === "note-d").replyTo;
  assert.equal(d.title, "Start now, or do fewer things?");
  assert.equal(d.sides.length, 2);
  const md = toMarkdown(e);
  assert.match(md, /Replying to Claude's take on idea "Starting badly/);
  assert.match(md, /Claude \(push back\): "/);
  assert.match(md, /Claude asked: "/);
  assert.match(md, /Replying to Claude's discussion "Start now, or do fewer things\?"/);
  assert.equal(buildExport({ notes: [reply], myIdeas: [] }, null).notes[0].replyTo.missing, true);
});

test("the three voices keep apart in hue, and Claude's color meets its contrast floors", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.deepEqual(contrastFailures(css), []);
  assert.equal(Math.round(hue("#ff0000")), 0);
  assert.equal(Math.round(hue("#0000ff")), 240);
  const close = css.replace("--claude: #2b5397;", "--claude: #7a3d8d;");
  assert.ok(contrastFailures(close).some((f) => /--mine and --claude are too close/.test(f)));
});
