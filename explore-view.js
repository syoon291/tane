// Explore as a drill-down list: Areas > area (its themes) > theme (its ideas)
// > idea (claim, the videos behind it, its links, prompts, threads and core
// beliefs, and a separate "Your notes" section). Each function returns the
// HTML for #view; every screen starts with a breadcrumb and one h2 that the
// app focuses after navigation. No DOM access here, so it renders under `node --test`.
import { esc } from "./ui.js";
import { hrefFor } from "./router.js";
import { plural } from "./library.js";

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

const heading = (text, cls = "") => `<h2 class="page-title ${cls}" tabindex="-1" data-focus>${esc(text)}</h2>`;
const AREAS = { label: "Areas", href: hrefFor() };

export function areasPage(ix, sourceLine = "") {
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
    ${items ? `<ul class="rows">${items}</ul>` : `<p class="card empty">This library has no areas yet.</p>`}
    ${sourceLine ? `<p class="hint source-line">${sourceLine}</p>` : ""}`;
}

export function areaPage(ix, areaId) {
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
    <h3 id="themes-h">Themes</h3>
    ${items ? `<ul class="rows" aria-labelledby="themes-h">${items}</ul>` : `<p class="card empty">No themes in this area yet.</p>`}`;
}

export function themePage(ix, themeId) {
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
    <h3 id="ideas-h">Ideas</h3>
    ${items ? `<ul class="rows" aria-labelledby="ideas-h">${items}</ul>` : `<p class="card empty">No ideas in this theme yet.</p>`}`;
}

function videoCard(v) {
  const keys = v.keyIdeas.length ? `<h5>Key points</h5><ul class="keys">${v.keyIdeas.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : "";
  const quotes = v.quotes.map((q) => `<blockquote class="quote">${esc(q.text)}</blockquote>`).join("");
  const link = v.url ? `<a class="btn ghost open-link" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">Open in TikTok<span class="visually-hidden"> (opens a new tab)</span></a>` : "";
  return `<li class="card video">
    <h4>${esc(v.title || (v.creator ? `A video by ${v.creator}` : "A saved video"))}</h4>
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

export function ideaPage(ix, ideaId) {
  const i = ix.idea(ideaId);
  if (!i) return notFound("That idea is not in the library.");
  const { theme: t, area: a } = ix.parentsOf(i.id);
  const trail = t && a ? [AREAS, { label: a.name, href: hrefFor("area", a.id) }, { label: t.name, href: hrefFor("theme", t.id) }] : [AREAS];
  const retired = i.status === "retired";
  const videos = ix.videosOf(i.id);
  const prompts = i.prompts.length ? `<section class="block" aria-labelledby="prompts-h">
      <h3 id="prompts-h">Write about it</h3>
      <ul class="prompts">${i.prompts.map((p) => `<li>${esc(p.text)}</li>`).join("")}</ul>
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

    <div class="source">
      ${videos.length ? `<section class="block" aria-labelledby="videos-h">
        <h3 id="videos-h">From the videos</h3>
        <ul class="videos">${videos.map(videoCard).join("")}</ul>
      </section>` : ""}
      ${linksSection(ix, i.id)}
      ${prompts}
      ${partOf}
    </div>

    <section class="mine-section" aria-labelledby="mine-h">
      <h3 id="mine-h">Your notes</h3>
      <p>Your own notes on this idea arrive in the next update. They will sit here, apart from what the videos say.</p>
    </section>`;
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

// The screen for a route, given a built index.
export function renderExplore(route, ix, sourceLine) {
  if (route.level === "area") return areaPage(ix, route.id);
  if (route.level === "theme") return themePage(ix, route.id);
  if (route.level === "idea") return ideaPage(ix, route.id);
  return areasPage(ix, sourceLine);
}
