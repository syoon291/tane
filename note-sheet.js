// The note sheet: the "+" button's quick note (already linked to what is on
// screen), editing a note or an own idea, its links (change the kind, add
// more, remove them for a free-standing thought), "Make this an idea", and
// delete. The owner's words only ever go to the owner's stores (mine-store.js).
import { $, esc, day, closeBtn, announce } from "./ui.js";
import { KINDS, KIND_LABEL, TYPE_LABEL, addLink, removeLink, setKind, resolveLink, linkTargets, makeNote, youLabel, mineHref } from "./notes.js";

const dialog = () => $("#note-dialog");
const sheet = () => $("#note-sheet");
let app;
// draft: { mode: "note" | "idea", rec (the stored record, or null for a new note), text, links, context, promptId, saved }
let draft = null;
let busy = false;

export function initNoteSheet(appApi) {
  app = appApi;
  const s = sheet();
  s.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    if (act === "close") { tryClose(); return; }
    if (act === "add-link") { showSearch(); return; }
    if (act === "unlink") { draft.links = removeLink(draft.links, { type: el.dataset.type, to: el.dataset.to }); renderLinks(); $("#add-link-btn")?.focus(); return; }
    if (act === "pick") {
      draft.links = addLink(draft.links, { type: el.dataset.type, to: el.dataset.to, kind: "about" });
      $("#link-q").value = "";
      renderLinks();
      renderResults();
      $("#link-q")?.focus();
      return;
    }
    if (act === "promote") run(onPromote);
    if (act === "delete") run(onDelete);
  });
  s.addEventListener("change", (e) => {
    const sel = e.target.closest("select[data-kind-for]");
    if (!sel) return;
    const [type, ...to] = sel.dataset.kindFor.split("|");
    draft.links = setKind(draft.links, { type, to: to.join("|") }, sel.value);
  });
  s.addEventListener("input", (e) => {
    if (e.target.id === "note-text") draft.text = e.target.value;
    if (e.target.id === "link-q") renderResults();
  });
  s.addEventListener("submit", (e) => { e.preventDefault(); run(onSave); });
  dialog().addEventListener("cancel", (e) => { e.preventDefault(); tryClose(); });
  dialog().addEventListener("click", (e) => { if (e.target === dialog()) tryClose(); });
}

// One tap = one save: a second tap while the first runs is dropped.
function run(fn) {
  if (busy) return;
  busy = true;
  Promise.resolve().then(fn).catch((err) => say(err?.message || String(err), "bad")).finally(() => { busy = false; });
}

// A new note: links and context from the screen (notes.js contextFor), or from a note button.
export function openNewNote({ links = [], context = { screen: "explore" }, promptId } = {}) {
  draft = { mode: "note", rec: null, text: "", links: [...links], context, promptId, saved: "" };
  open();
}

export function editNote(id) {
  const n = app.mine.api(app.index()).note(id);
  if (!n) return;
  draft = { mode: "note", rec: n, text: n.text, links: [...(n.links || [])], context: n.context, promptId: n.promptId, saved: n.text };
  open();
}

export function editIdea(id) {
  const m = app.mine.api(app.index()).idea(id);
  if (!m) return;
  draft = { mode: "idea", rec: m, text: m.text, links: [...(m.links || [])], saved: m.text };
  open();
}

function open() {
  render();
  if (!dialog().open) dialog().showModal();
  const ta = $("#note-text");
  ta?.focus();
  ta?.setSelectionRange(ta.value.length, ta.value.length);
}

function tryClose() {
  if (draft && draft.text.trim() && draft.text.trim() !== (draft.saved || "").trim() && !confirm(draft.rec ? "Leave without saving your changes?" : "Discard this note?")) return;
  close();
}

function close() {
  draft = null;
  if (dialog().open) dialog().close();
}

function say(text, tone = "") {
  const m = $("#note-msg");
  if (!m) return;
  m.textContent = text;
  m.className = `msg ${tone}`;
}

function promptText(id) {
  const ix = app.index();
  if (!ix || !id) return "";
  for (const i of ix.activeIdeas()) { const p = i.prompts.find((x) => x.id === id); if (p) return p.text; }
  return "";
}

function title() {
  if (draft.mode === "idea") return "Your idea";
  return draft.rec ? "Your note" : "New note";
}

function render() {
  const mine = app.mine.api(app.index());
  const rec = draft.rec;
  const q = promptText(draft.promptId);
  const promoted = draft.mode === "note" && rec?.ideaId ? mine.idea(rec.ideaId) : null;
  sheet().innerHTML = `
    <div class="sheet-head"><h2 id="note-title">${esc(title())}</h2>${closeBtn}</div>
    <p class="you">${rec ? esc(youLabel(rec.createdAt, day)) : "You · now"}${app.mine.api().demo ? " · demo: not saved" : ""}</p>
    ${q ? `<p class="prompt-q"><span class="eyebrow">Question from the videos</span>${esc(q)}</p>` : ""}
    <form id="note-form" class="note-form">
      <label for="note-text">${draft.mode === "idea" ? "Your idea, in a line or two" : "Your words"}</label>
      <textarea id="note-text" rows="${draft.mode === "idea" ? 3 : 6}" autocapitalize="sentences">${esc(draft.text)}</textarea>
      <div id="note-links-wrap"></div>
      <p id="note-msg" class="msg" role="status" aria-live="polite"></p>
      <div class="btn-row">
        <button class="btn mine-btn" type="submit">Save</button>
        ${draft.mode === "note" && !promoted ? `<button class="btn ghost" type="button" data-act="promote">Make this an idea</button>` : ""}
        ${promoted ? `<a class="btn ghost" href="${esc(mineHref(promoted.id))}">Open your idea</a>` : ""}
      </div>
      ${rec ? `<p><button class="link-btn danger" type="button" data-act="delete">Delete this ${draft.mode === "idea" ? "idea" : "note"}</button></p>` : ""}
    </form>`;
  renderLinks();
  // An "Open your idea" link closes the sheet as it navigates.
  sheet().querySelector('a[href^="#mine"]')?.addEventListener("click", () => close());
}

function renderLinks() {
  const ix = app.index();
  const mine = app.mine.api(ix);
  const rows = draft.links.map((l, i) => {
    const r = resolveLink(l, ix, mine);
    const kinds = KINDS.map((k) => `<option value="${esc(k)}"${k === l.kind ? " selected" : ""}>${esc(KIND_LABEL[k])}</option>`).join("");
    return `<li class="${r.source ? "to-source" : "to-mine"}">
      <div class="link-what"><span class="link-type">${esc(r.typeLabel)}</span><span class="link-label${r.missing ? " missing" : ""}">${esc(r.label)}</span></div>
      <div class="link-ctl">
        <label class="visually-hidden" for="kind-${i}">How your note relates to ${esc(r.label)}</label>
        <select id="kind-${i}" data-kind-for="${esc(`${l.type}|${l.to}`)}">${kinds}</select>
        <button class="icon-btn" type="button" data-act="unlink" data-type="${esc(l.type)}" data-to="${esc(l.to)}" aria-label="Remove the link to ${esc(r.label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
    </li>`;
  }).join("");
  const searchOpen = !!$("#link-search") && !$("#link-search").hidden;
  const q = $("#link-q")?.value ?? "";
  $("#note-links-wrap").innerHTML = `
    <h3 id="links-title">Linked to</h3>
    ${rows ? `<ul class="note-links" aria-labelledby="links-title">${rows}</ul>` : `<p class="hint">Not linked: a free-standing thought.</p>`}
    <button id="add-link-btn" class="link-btn" type="button" data-act="add-link"${searchOpen ? " hidden" : ""}>+ Add a link</button>
    <div id="link-search" class="link-search"${searchOpen ? "" : " hidden"}>
      <label for="link-q">Find an idea, theme or area (or an idea of yours)</label>
      <input id="link-q" type="search" autocomplete="off" value="${esc(q)}">
      <ul id="link-results" class="link-results" aria-label="Matches"></ul>
    </div>`;
  if (searchOpen) renderResults();
}

function showSearch() {
  $("#add-link-btn").hidden = true;
  $("#link-search").hidden = false;
  $("#link-q").focus();
}

function renderResults() {
  const ul = $("#link-results");
  if (!ul) return;
  const ix = app.index();
  const q = $("#link-q").value;
  const self = draft.mode === "idea" && draft.rec ? [{ type: "myIdea", to: draft.rec.id }] : [];
  const hits = linkTargets(q, ix, app.mine.api(ix).ideas, { exclude: [...draft.links, ...self] });
  ul.innerHTML = !q.trim() ? "" : hits.length
    ? hits.map((h) => `<li><button type="button" class="pick ${h.type === "myIdea" ? "to-mine" : "to-source"}" data-act="pick" data-type="${esc(h.type)}" data-to="${esc(h.id)}"><span class="link-type">${esc(TYPE_LABEL[h.type])}</span>${esc(h.label)}</button></li>`).join("")
    : `<li class="hint">Nothing matches.</li>`;
}

// The record as it is now: a sync may have brought a newer copy while the sheet was open,
// so an edit applies only the text and links to it.
function current(d) {
  if (!d.rec) return null;
  const api = app.mine.api(app.index());
  return (d.mode === "idea" ? api.idea(d.rec.id) : api.note(d.rec.id)) || d.rec;
}

// Each handler keeps its own `d`: closing the sheet mid-save clears `draft`.
async function onSave() {
  const d = draft;
  const text = d.text.trim();
  if (!text) { say("Write something first.", "bad"); $("#note-text")?.focus(); return; }
  if (d.mode === "idea") {
    await app.mine.saveIdea({ ...current(d), text, links: d.links });
  } else if (d.rec) {
    await app.mine.saveNote({ ...current(d), text, links: d.links });
  } else {
    await app.mine.saveNote(makeNote({ text, links: d.links, context: d.context, promptId: d.promptId }));
  }
  const what = d.mode === "idea" ? "Idea saved." : "Note saved.";
  close();
  announce(what);
  app.toast(what);
}

async function onPromote() {
  const d = draft;
  const text = d.text.trim();
  if (!text) { say("Write something first: the idea starts with these words.", "bad"); return; }
  const note = d.rec ? { ...current(d), text, links: d.links } : makeNote({ text, links: d.links, context: d.context, promptId: d.promptId });
  const idea = await app.mine.promote(note);
  close();
  announce("Made into your idea.");
  location.hash = mineHref(idea.id);
}

async function onDelete() {
  const d = draft;
  const isIdea = d.mode === "idea";
  const msg = isIdea
    ? "Delete this idea of yours? The note it came from stays."
    : current(d).ideaId ? "Delete this note? The idea you made from it stays." : "Delete this note?";
  if (!confirm(msg)) return;
  const id = d.rec.id;
  if (isIdea) await app.mine.deleteIdea(id); else await app.mine.deleteNote(id);
  close();
  announce(isIdea ? "Idea deleted." : "Note deleted.");
  app.toast(isIdea ? "Idea deleted." : "Note deleted.");
  if (isIdea && location.hash.startsWith(mineHref(id))) location.hash = "#mine";
}
