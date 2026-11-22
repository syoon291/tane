// The owner's own content as HTML: the Mine tab (everything written, newest
// first, with search and the export), an own idea's page, and the "Your
// notes" section that source pages show after (never inside) the source block.
// Everything here wears the --mine style and a "You · <date>" label. No DOM
// access, so it renders under `node --test`.
import { esc, day } from "./ui.js";
import { resolveLink, searchMine, sortNewest, KIND_LABEL, youLabel, mineHref } from "./notes.js";
import { plural } from "./library.js";

// mine: { notes, ideas, idea(id), note(id), about(type, id) } (app.js mineApi).

const heading = (text, cls = "") => `<h2 class="page-title ${cls}" tabindex="-1" data-focus>${esc(text)}</h2>`;

// A record's links. `here` ({ type, id }): the item whose page this is; its
// link is shown as a kind line ("Disagrees with this") instead of a row.
function linkList(rec, ix, mine, here) {
  const items = (rec.links || []).filter((l) => !(here && l.type === here.type && l.to === here.id)).map((l) => {
    const r = resolveLink(l, ix, mine);
    const name = r.href ? `<a href="${esc(r.href)}">${esc(r.label)}</a>` : `<span class="${r.missing ? "missing" : ""}">${esc(r.label)}</span>`;
    return `<li class="${r.source ? "to-source" : "to-mine"}"><span class="link-kind">${esc(KIND_LABEL[l.kind])}</span> ${name} <span class="link-type">${esc(r.typeLabel)}${r.retired ? " · retired" : ""}</span></li>`;
  }).join("");
  return items ? `<ul class="mine-links" aria-label="Linked to">${items}</ul>` : "";
}

function hereLine(rec, here) {
  const l = here && (rec.links || []).find((x) => x.type === here.type && x.to === here.id);
  return l && l.kind !== "about" ? `<p class="here-kind">${esc(KIND_LABEL[l.kind])} this</p>` : "";
}

export function noteCard(n, ix, mine, here = null) {
  const idea = n.ideaId ? mine.idea(n.ideaId) : null;
  return `<li class="mine-card note">
    <p class="you">${esc(youLabel(n.createdAt, day))}${n.editedAt && day(n.editedAt) !== day(n.createdAt) ? ` · edited ${esc(day(n.editedAt))}` : ""}</p>
    ${hereLine(n, here)}
    <p class="mine-text">${esc(n.text)}</p>
    ${linkList(n, ix, mine, here)}
    ${!here && (!n.links || !n.links.length) ? `<p class="hint">A free-standing thought, not linked to anything.</p>` : ""}
    ${idea ? `<p class="made-into">Made into <a href="${esc(mineHref(idea.id))}">your idea</a></p>` : ""}
    <button class="link-btn mine-edit" type="button" data-act="edit-note" data-id="${esc(n.id)}">Edit<span class="visually-hidden"> this note</span></button>
  </li>`;
}

export function ideaCard(m, ix, mine, here = null) {
  return `<li class="mine-card idea">
    <p class="you"><span class="mine-badge">Your idea</span> ${esc(youLabel(m.createdAt, day))}</p>
    ${hereLine(m, here)}
    <a class="mine-idea-title" href="${esc(mineHref(m.id))}">${esc(m.text)}</a>
    ${linkList(m, ix, mine, here)}
  </li>`;
}

// The "Your notes" section on a source page (area, theme or idea).
export function yourNotes(type, id, ix, mine, { always = false } = {}) {
  if (!mine) return "";
  const { notes, ideas } = mine.about(type, id);
  if (!always && !notes.length && !ideas.length) return "";
  const here = { type, id };
  const list = [...ideas.map((m) => ideaCard(m, ix, mine, here)), ...notes.map((n) => noteCard(n, ix, mine, here))].join("");
  return `<section class="mine-section" aria-labelledby="mine-h">
      <h3 id="mine-h">Your notes</h3>
      ${list ? `<ul class="mine-list">${list}</ul>` : `<p>Nothing yet. What you write here stays yours, apart from what the videos say.</p>`}
      <button class="btn mine-btn" type="button" data-act="note" data-type="${esc(type)}" data-id="${esc(id)}">Write a note</button>
    </section>`;
}

// The results part of the Mine tab (re-rendered on each search keystroke, so
// the search box itself keeps focus).
export function mineResults(ix, mine, query = "") {
  const ideas = searchMine(query, sortNewest(mine.ideas), ix, mine);
  const notes = searchMine(query, sortNewest(mine.notes), ix, mine);
  if (!mine.ideas.length && !mine.notes.length) {
    return `<p class="card empty">Nothing written yet. Tap <b>+</b> on any screen to write a note; it links itself to what is on screen.</p>`;
  }
  if (query.trim() && !ideas.length && !notes.length) return `<p class="card empty">Nothing you wrote matches “${esc(query.trim())}”.</p>`;
  return `
    ${ideas.length ? `<section aria-labelledby="my-ideas-h"><h3 id="my-ideas-h">Your ideas <span class="count">${ideas.length}</span></h3><ul class="mine-list">${ideas.map((m) => ideaCard(m, ix, mine)).join("")}</ul></section>` : ""}
    ${notes.length ? `<section aria-labelledby="notes-h"><h3 id="notes-h">Notes <span class="count">${notes.length}</span></h3><ul class="mine-list">${notes.map((n) => noteCard(n, ix, mine)).join("")}</ul></section>` : ""}`;
}

// syncLine: a short status of the notes sync (already escaped HTML), or "".
export function minePage(ix, mine, { query = "", syncLine = "" } = {}) {
  const total = mine.ideas.length + mine.notes.length;
  return `
    ${heading("Mine")}
    <p class="sub">Your own notes and ideas, newest first, kept apart from what the videos say.${total ? ` ${esc(plural(mine.ideas.length, "idea"))} · ${esc(plural(mine.notes.length, "note"))}.` : ""}</p>
    ${total ? `<div class="search"><label for="mine-q" class="visually-hidden">Search what you wrote</label><input id="mine-q" type="search" placeholder="Search what you wrote" value="${esc(query)}" autocomplete="off"></div>` : ""}
    <div id="mine-results" aria-live="polite">${mineResults(ix, mine, query)}</div>
    ${syncLine ? `<p class="hint sync-line">${syncLine}</p>` : ""}
    <section class="block export" aria-labelledby="export-h">
      <h3 id="export-h">Export</h3>
      <p class="hint">Every note and idea of yours, with the ids and text of what each links to, for looking back on the computer.</p>
      <div class="btn-row">
        <button class="btn ghost" type="button" data-act="export-md"${total ? "" : " disabled"}>Export Markdown</button>
        <button class="btn ghost" type="button" data-act="export-json"${total ? "" : " disabled"}>Export JSON</button>
      </div>
    </section>`;
}

export function myIdeaPage(id, ix, mine) {
  const m = mine.idea(id);
  const crumbs = (label) => `<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="#mine">Mine</a></li><li><span aria-current="page">${esc(label)}</span></li></ol></nav>`;
  if (!m) {
    return `${crumbs("Not found")}${heading("Not found")}<p class="sub">That idea of yours is not on this device. It may have been deleted.</p><p><a class="btn ghost" href="#mine">Back to Mine</a></p>`;
  }
  const from = m.fromNote ? mine.note(m.fromNote) : null;
  const about = mine.about("myIdea", m.id);
  const short = m.text.length > 40 ? `${m.text.slice(0, 39).trimEnd()}…` : m.text;
  return `
    ${crumbs(short)}
    <div class="mine-page">
      <p class="you"><span class="mine-badge">Your idea</span> ${esc(youLabel(m.createdAt, day))}</p>
      ${heading(m.text, "mine-title")}
      ${linkList(m, ix, mine) ? `<h3>Grew from</h3>${linkList(m, ix, mine)}` : `<p class="hint">Not linked to anything yet.</p>`}
      ${from ? `<h3>From your note</h3><ul class="mine-list">${noteCard(from, ix, mine)}</ul>` : m.fromNote ? `<p class="hint">It came from a note you since deleted.</p>` : ""}
      ${about.notes.length || about.ideas.length ? `<h3>Building on it</h3><ul class="mine-list">${[...about.ideas.map((x) => ideaCard(x, ix, mine, { type: "myIdea", id: m.id })), ...about.notes.map((n) => noteCard(n, ix, mine, { type: "myIdea", id: m.id }))].join("")}</ul>` : ""}
      <div class="btn-row">
        <button class="btn mine-btn" type="button" data-act="edit-idea" data-id="${esc(m.id)}">Edit</button>
        <button class="btn ghost" type="button" data-act="note" data-type="myIdea" data-id="${esc(m.id)}">Write a note on it</button>
      </div>
    </div>`;
}

export function renderMine(route, ix, mine, opts) {
  if (route.level === "idea") return myIdeaPage(route.id, ix, mine);
  return minePage(ix, mine, opts);
}
