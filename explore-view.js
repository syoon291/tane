// Explore as a drill-down list: Areas > area (its themes) > theme (its ideas)
// > idea (claim, the videos behind it, its links, prompts, threads and core
// beliefs, and a separate "Your notes" section). Area, theme and idea pages
// also carry "Claude's take", collapsed: a third voice in its own --claude
// style, apart from both the videos and the owner. Discussions (tensions
// Claude sees between ideas) have a list and a page of their own. Each function returns the
// HTML for #view; every screen starts with a breadcrumb and one h2 that the
// app focuses after navigation. No DOM access here, so it renders under `node --test`.
import { esc } from "./ui.js";
import { hrefFor } from "./router.js";
import { plural } from "./library.js";
import { yourNotes } from "./mine-view.js";
import { mapBar, mapSection, backFor } from "./map-view.js";

// mine (optional): the owner's content (app.js mineApi). Without it the pages
// show no "Your notes" section (and no note buttons).
const noteBtn = (mine, type, id, label, extra = "") => mine ? `<button class="link-btn note-on" type="button" data-act="note" data-type="${type}" data-id="${esc(id)}"${extra}>+ Note<span class="visually-hidden"> on ${esc(label)}</span></button>` : "";

// Link kinds: a text label always goes with the color (never color alone).
// out: this idea -> the other; in: the other -> this idea.
export const KIND = {
  supports: { title: "Supports", out: "This idea supports", in: "Supports this idea" },
  contradicts: { title: "Contradicts", out: "This idea contradicts", in: "Contradicts this idea" },
  extends: { title: "Builds on", out: "This idea builds on", in: "Builds on this idea" },
};

function crumbs(items) {
  // items: [{ label, href }], the last one is the current page.
  const li = items.map((c, i) => i === items.length - 1
    ? `<li><span aria-current="page">${esc(c.label)}</span></li>`
    : `<li><a href="${esc(c.href)}">${esc(c.label)}</a></li>`).join("");
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${li}</ol></nav>`;
}

// Claude's take. verdict text always goes with its word, never color alone.
export const VERDICT_LABEL = { "holds up": "Holds up", mixed: "Mixed", "push back": "Push back" };
const VERDICT_CLASS = { "holds up": "holds", mixed: "mixed", "push back": "push" };
const claudeLabel = (what = "perspective") => `<span class="claude-label"><span class="claude-mark" aria-hidden="true"></span>Claude · ${what}</span>`;
const replyBtn = (mine, type, id, on) => mine ? `<button class="btn mine-btn reply-btn" type="button" data-act="reply" data-type="${type}" data-id="${esc(id)}">Reply<span class="visually-hidden"> to Claude's take on ${esc(on)}</span></button>` : "";

// The collapsed "Claude's take" on an area, theme or idea page ("" when
// Claude has nothing on it). on: the item's name, for screen readers.
export function claudeTake(ix, targetId, mine, on) {
  const p = ix.perspectiveOf(targetId);
  const discs = ix.idea(targetId) ? ix.discussionsOf(targetId) : [];
  if (!p && !discs.length) return "";
  const body = p ? `
      ${p.verdict ? `<p class="verdict verdict-${VERDICT_CLASS[p.verdict]}"><span class="visually-hidden">Verdict: </span>${esc(VERDICT_LABEL[p.verdict])}</p>` : ""}
      <p class="take">${esc(p.take)}</p>
      ${p.better ? `<h4>A better version</h4><p class="better">${esc(p.better)}</p>` : ""}
      ${p.question ? `<h4>Claude asks</h4><p class="claude-q">${esc(p.question)}</p>` : ""}
      ${replyBtn(mine, "perspective", p.id, on)}` : "";
  const also = discs.length ? `<h4>In Claude's discussions</h4><ul class="claude-discs">${discs.map((d) => `<li><a href="${hrefFor("discussion", d.id)}">${esc(d.title)}</a></li>`).join("")}</ul>` : "";
  return `<details class="claude-take" data-keep-open="take-${esc(targetId)}">
    <summary>${claudeLabel()}<span class="claude-title">Claude's take</span></summary>
    <div class="claude-body">${body}${also}</div>
  </details>`;
}

const heading = (text, cls = "") => `<h2 class="page-title ${cls}" tabindex="-1" data-focus>${esc(text)}</h2>`;
const AREAS = { label: "Areas", href: hrefFor() };

// map (optional): { bar, map } from renderExplore: the Map | List toggle, and
// the map that takes the place of the list.
export function areasPage(ix, sourceLine = "", { bar = "", map = null } = {}) {
  const t = ix.totals;
  const items = ix.areas.map((a) => {
    const s = ix.areaStats(a.id);
    return `<li><a class="row" href="${hrefFor("area", a.id)}">
      <span class="row-title">${esc(a.name)}</span>
      ${a.summary ? `<span class="row-sum">${esc(a.summary)}</span>` : ""}
      <span class="row-meta">${plural(s.themes, "theme")} · ${plural(s.ideas, "idea")}</span>
    </a></li>`;
  }).join("");
  return `
    ${crumbs([{ label: "Areas" }])}
    ${heading("Areas")}
    <p class="sub">${plural(t.areas, "area")} · ${plural(t.themes, "theme")} · ${plural(t.ideas, "idea")} from ${plural(t.videos, "video")}</p>
    ${bar}
    ${map ?? (items ? `<ul class="rows">${items}</ul>` : `<p class="card empty">This library has no areas yet.</p>`)}
    ${ix.discussions.length ? `<h3 id="discs-h">Discussions</h3><ul class="rows" aria-labelledby="discs-h"><li><a class="row claude-row" href="${hrefFor("discussions")}">
      ${claudeLabel("discussions")}
      <span class="row-title">Where ideas pull against each other</span>
      <span class="row-meta">${plural(ix.discussions.length, "discussion")}</span>
    </a></li></ul>` : ""}
    ${sourceLine ? `<p class="hint source-line">${sourceLine}</p>` : ""}`;
}

export function areaPage(ix, areaId, mine, { bar = "", map = null } = {}) {
  const a = ix.area(areaId);
  if (!a) return notFound("That area is not in the library.");
  const items = ix.themesOf(a.id).map((t) => {
    const s = ix.themeStats(t.id);
    return `<li><a class="row" href="${hrefFor("theme", t.id)}">
      <span class="row-title">${esc(t.name)}</span>
      ${t.summary ? `<span class="row-sum">${esc(t.summary)}</span>` : ""}
      <span class="row-meta">${plural(s.ideas, "idea")} · from ${plural(s.videos, "video")}</span>
    </a></li>`;
  }).join("");
  return `
    ${crumbs([AREAS, { label: a.name }])}
    <p class="eyebrow">Area</p>
    ${heading(a.name)}
    ${a.summary ? `<p class="sub">${esc(a.summary)}</p>` : ""}
    ${bar}
    ${map ?? `<h3 id="themes-h">Themes</h3>
    ${items ? `<ul class="rows" aria-labelledby="themes-h">${items}</ul>` : `<p class="card empty">No themes in this area yet.</p>`}`}
    ${claudeTake(ix, a.id, mine, a.name)}
    ${yourNotes("area", a.id, ix, mine)}`;
}

export function themePage(ix, themeId, mine, { bar = "", map = null } = {}) {
  const t = ix.theme(themeId);
  if (!t) return notFound("That theme is not in the library.");
  const a = ix.area(t.areaId);
  const items = ix.ideasOf(t.id).map((i) => `<li><a class="row" href="${hrefFor("idea", i.id)}">
      <span class="row-title claim">${esc(i.claim)}</span>
      <span class="row-meta">from ${plural(ix.ideaCount(i.id), "video")}</span>
    </a></li>`).join("");
  return `
    ${crumbs([AREAS, { label: a.name, href: hrefFor("area", a.id) }, { label: t.name }])}
    <p class="eyebrow">Theme</p>
    ${heading(t.name)}
    ${t.summary ? `<p class="sub">${esc(t.summary)}</p>` : ""}
    ${bar}
    ${map ?? `<h3 id="ideas-h">Ideas</h3>
    ${items ? `<ul class="rows" aria-labelledby="ideas-h">${items}</ul>` : `<p class="card empty">No ideas in this theme yet.</p>`}`}
    ${claudeTake(ix, t.id, mine, t.name)}
    ${yourNotes("theme", t.id, ix, mine)}`;
}

function videoCard(v, mine) {
  const keys = v.keyIdeas.length ? `<h5>Key points</h5><ul class="keys">${v.keyIdeas.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : "";
  const quotes = v.quotes.map((q) => `<div class="quote-row"><blockquote class="quote">${esc(q.text)}</blockquote>${q.id ? noteBtn(mine, "quote", q.id, "this quote") : ""}</div>`).join("");
  const link = v.url ? `<a class="btn ghost open-link" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">Open in TikTok<span class="visually-hidden"> (opens a new tab)</span></a>` : "";
  return `<li class="card video">
    <div class="video-head"><h4>${esc(v.title || (v.creator ? `A video by ${v.creator}` : "A saved video"))}</h4>${noteBtn(mine, "video", v.id, "this video")}</div>
    ${v.creator ? `<p class="creator">${esc(v.creator)}</p>` : ""}
    ${v.summary ? `<p>${esc(v.summary)}</p>` : ""}
    ${keys}
    ${quotes ? `<h5>Quotes</h5>${quotes}` : ""}
    ${link}
  </li>`;
}

function linksSection(ix, ideaId) {
  const links = ix.linksOf(ideaId);
  if (!links.length) return "";
  const groups = Object.entries(KIND).map(([kind, k]) => {
    const list = links.filter((l) => l.kind === kind);
    if (!list.length) return "";
    const items = list.map((l) => {
      const o = ix.idea(l.other);
      return `<li class="link-item">
        <span class="link-dir">${esc(k[l.dir])}</span>
        <a href="${hrefFor("idea", o.id)}" class="claim">${esc(o.claim)}</a>${o.status === "retired" ? ` <span class="badge">retired</span>` : ""}
        ${l.why ? `<p class="why">${esc(l.why)}</p>` : ""}
      </li>`;
    }).join("");
    return `<section class="link-group kind-${kind}" aria-labelledby="lk-${kind}">
      <h4 id="lk-${kind}"><span class="kind-mark" aria-hidden="true"></span>${esc(k.title)}</h4>
      <ul>${items}</ul>
    </section>`;
  }).join("");
  return `<section class="block" aria-labelledby="links-h"><h3 id="links-h">Connected ideas</h3>${groups}</section>`;
}

export function ideaPage(ix, ideaId, mine) {
  const i = ix.idea(ideaId);
  if (!i) return notFound("That idea is not in the library.");
  const { theme: t, area: a } = ix.parentsOf(i.id);
  const trail = t && a ? [AREAS, { label: a.name, href: hrefFor("area", a.id) }, { label: t.name, href: hrefFor("theme", t.id) }] : [AREAS];
  const retired = i.status === "retired";
  const videos = ix.videosOf(i.id);
  const prompts = i.prompts.length ? `<section class="block" aria-labelledby="prompts-h">
      <h3 id="prompts-h">Write about it</h3>
      <ul class="prompts">${i.prompts.map((p) => `<li><span>${esc(p.text)}</span>${mine && p.id ? `<button class="link-btn note-on" type="button" data-act="note" data-type="idea" data-id="${esc(i.id)}" data-prompt="${esc(p.id)}">Write<span class="visually-hidden"> about this question</span></button>` : ""}</li>`).join("")}</ul>
    </section>` : "";
  const threads = ix.threadsOf(i.id), core = ix.coreOf(i.id);
  const partOf = threads.length || core.length ? `<section class="block" aria-labelledby="partof-h">
      <h3 id="partof-h">Part of</h3>
      <ul class="part-of">
        ${core.map((b) => `<li class="card"><p class="eyebrow">Core belief</p><p class="claim">${esc(b.belief)}</p><p class="row-meta">across ${plural(b.ideaIds.length, "idea")}</p></li>`).join("")}
        ${threads.map((th) => `<li class="card"><p class="eyebrow">Thread</p>${th.title ? `<p class="thread-title">${esc(th.title)}</p>` : ""}<p class="claim">${esc(th.question)}</p><p class="row-meta">across ${plural(th.ideaIds.length, "idea")}</p></li>`).join("")}
      </ul>
    </section>` : "";
  return `
    ${crumbs([...trail, { label: shorten(i.claim) }])}
    <p class="eyebrow">Idea${retired ? ` <span class="badge">retired</span>` : ""}</p>
    ${heading(i.claim, "claim")}
    ${retired ? `<p class="hint">This idea is no longer in the library's lists. It stays here so anything that points to it still opens.</p>` : ""}
    ${i.detail ? `<p class="detail">${esc(i.detail)}</p>` : ""}
    <p class="row-meta">from ${plural(videos.length, "video")}</p>
    ${claudeTake(ix, i.id, mine, shorten(i.claim))}

    <div class="source">
      ${videos.length ? `<section class="block" aria-labelledby="videos-h">
        <h3 id="videos-h">From the videos</h3>
        <ul class="videos">${videos.map((v) => videoCard(v, mine)).join("")}</ul>
      </section>` : ""}
      ${linksSection(ix, i.id)}
      ${prompts}
      ${partOf}
    </div>

    ${yourNotes("idea", i.id, ix, mine, { always: true })}`;
}

const DISCUSSIONS = { label: "Discussions", href: hrefFor("discussions") };

export function discussionsPage(ix) {
  const items = ix.discussions.map((d) => `<li><a class="row claude-row" href="${hrefFor("discussion", d.id)}">
      <span class="row-title">${esc(d.title)}</span>
      <span class="row-meta">between ${plural(d.sides.length, "idea")}</span>
    </a></li>`).join("");
  return `
    ${crumbs([AREAS, { label: "Discussions" }])}
    <p class="eyebrow">${claudeLabel("discussions")}</p>
    ${heading("Discussions")}
    <p class="sub">Places where ideas from your videos pull against each other, as Claude sees them. Open one to see both sides and reply.</p>
    ${items ? `<ul class="rows">${items}</ul>` : `<p class="card empty">No discussions in this library yet.</p>`}`;
}

export function discussionPage(ix, id, mine) {
  const d = ix.discussion(id);
  if (!d) return notFound("That discussion is not in the library.");
  const sides = d.sides.map((s, n) => {
    const i = ix.idea(s);
    return `<li><a class="row" href="${hrefFor("idea", i.id)}">
      <span class="row-meta">Side ${n + 1}</span>
      <span class="row-title claim">${esc(i.claim)}</span>
      <span class="row-meta">from ${plural(ix.ideaCount(i.id), "video")}${i.status === "retired" ? " · retired" : ""}</span>
    </a></li>`;
  }).join("");
  return `
    ${crumbs([AREAS, DISCUSSIONS, { label: shorten(d.title) }])}
    <p class="eyebrow">${claudeLabel("discussion")}</p>
    ${heading(d.title, "claude-heading")}
    <div class="source">
      <h3 id="sides-h">${d.sides.length === 2 ? "The two sides" : "The sides"}, from the videos</h3>
      <ul class="rows" aria-labelledby="sides-h">${sides}</ul>
    </div>
    <details class="claude-take" data-keep-open="disc-${esc(d.id)}">
      <summary>${claudeLabel()}<span class="claude-title">Claude's take</span></summary>
      <div class="claude-body">
        <p class="take">${esc(d.take)}</p>
        ${d.question ? `<h4>Claude asks</h4><p class="claude-q">${esc(d.question)}</p>` : ""}
        ${replyBtn(mine, "discussion", d.id, d.title)}
      </div>
    </details>
    ${yourNotes("discussion", d.id, ix, mine, { always: true })}`;
}

export function notFound(message) {
  return `
    ${crumbs([AREAS, { label: "Not found" }])}
    ${heading("Not found")}
    <p class="sub">${esc(message)} The library may have changed since this link was made.</p>
    <p><a class="btn ghost" href="${hrefFor()}">Back to Areas</a></p>`;
}

// A crumb for a long claim: the first words, cut at a word.
export function shorten(text, max = 40) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 20 ? cut.lastIndexOf(" ") : max).trimEnd()}…`;
}

// The screen for a route, given a built index. mapState (optional, from
// app.js): { view: "map" | "list", show, folder }. With it the areas, area and
// theme levels get the Map | List toggle, and the map in place of the list
// when view is "map". Without it they are the plain list.
export function renderExplore(route, ix, sourceLine, mine, mapState = null) {
  const opts = (level, id, name) => {
    if (!mapState) return {};
    const view = mapState.view === "list" ? "list" : "map";
    return { bar: mapBar(view, backFor(level, id, ix)), map: view === "map" ? mapSection(level, id, ix, mine, mapState, name) : null };
  };
  if (route.level === "area") { const a = ix.area(route.id); return areaPage(ix, route.id, mine, a ? opts("area", a.id, a.name) : {}); }
  if (route.level === "theme") { const t = ix.theme(route.id); return themePage(ix, route.id, mine, t ? opts("theme", t.id, t.name) : {}); }
  if (route.level === "idea") return ideaPage(ix, route.id, mine);
  if (route.level === "discussions") return discussionsPage(ix);
  if (route.level === "discussion") return discussionPage(ix, route.id, mine);
  return areasPage(ix, sourceLine, opts("areas", null, "areas"));
}
