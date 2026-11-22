// App shell: boots the store, picks the library to show (the demo with
// ?demo=1, else the copy cached from tane-data), routes by URL hash and
// renders #view: Explore (source content) or Mine (the owner's own). The Data
// sheet lives in data-view.js, the note sheet in note-sheet.js, the owner's
// store and its sync in mine-store.js.
import { $, esc, when, announce, downloadFile } from "./ui.js";
import { get, put, getDevice, setDevice, delDevice } from "./db.js";
import { parseLibrary, buildIndex, plural } from "./library.js";
import { parseHash } from "./router.js";
import { renderExplore } from "./explore-view.js";
import { REPO, LIBRARY_PATH, fetchLibrary, checkAccess, reloadDue, SyncError } from "./sync.js";
import { initDataSheet, openDataSheet, TOKEN_STEPS } from "./data-view.js";
import { renderMine, mineResults } from "./mine-view.js";
import { createMine } from "./mine-store.js";
import { contextFor, replyLinks, isTakeType } from "./notes.js";
import { initNoteSheet, openNewNote, editNote, editIdea } from "./note-sheet.js";
import { buildExport, toMarkdown, exportFileName } from "./export.js";

const view = $("#view");
const TOKEN = "githubToken";

// demo: the demo library is showing (never written to the store).
// record: the cached library record from tane-data ({ id, data, loadedAt, source }).
const state = { demo: false, linked: false, record: null, index: null, lastError: "", loading: false, failed: "", mineQuery: "", mineFilter: "all" };
// The owner's notes and own ideas (memory only in the demo). Set in boot().
let mine = createMine({ demo: true });

function useLibrary(data) {
  const parsed = parseLibrary(data);
  if (!parsed.ok) { state.index = null; return parsed.error; }
  state.index = buildIndex(parsed.library);
  return "";
}

// Fetch library/latest.json, check it, and cache it. Never touches the demo.
async function loadFromRepo(token, gen) {
  const text = await fetchLibrary(token);
  if (gen !== generation) return null;
  const parsed = parseLibrary(text);
  if (!parsed.ok) throw new SyncError(`library/latest.json could not be used: ${parsed.error}`, "invalid");
  const record = { id: "current", data: parsed.library, loadedAt: new Date().toISOString(), source: `${REPO}/${LIBRARY_PATH}` };
  await put("library", record);
  state.record = record;
  state.lastError = "";
  if (!state.demo) state.index = buildIndex(parsed.library);
  return parsed.library;
}

// link/unlink bump `generation`; a reload started before then drops its result.
let generation = 0;
let inflight = null;
const STALE = { ok: false, message: "The link changed while loading; nothing was saved." };

async function doReload(gen) {
  state.loading = true;
  render();
  try {
    const token = await getDevice(TOKEN);
    if (!token) return { ok: false, message: "This device is not linked to tane-data." };
    const lib = await loadFromRepo(token, gen);
    if (!lib) return STALE;
    const n = buildIndex(lib).totals.ideas;
    const message = `Library loaded: ${plural(n, "idea")}.`;
    announce(message);
    return { ok: true, message };
  } catch (err) {
    if (gen !== generation) return STALE;
    state.lastError = failMessage(err);
    return { ok: false, message: state.lastError };
  } finally {
    state.loading = false;
    render();
  }
}

const failMessage = (err) => err instanceof SyncError && err.code === "network" && state.record
  ? `${err.message} Showing the copy loaded ${when(state.record.loadedAt)}.`
  : err?.message || String(err);

const app = {
  state,
  // Link this device: keep the token once GitHub shows it the repo, then load the library.
  async link(token) {
    try { await checkAccess(token); }
    catch (err) { return { ok: false, message: err.message }; }
    await setDevice(TOKEN, token);
    generation++;
    state.linked = true;
    await inflight; // a reload started with the old token finishes (and is dropped) first
    const out = await app.reload();
    if (!state.demo) { await mine.refresh(); mine.sync(); }
    return out.ok ? { ok: true, message: `Linked. ${out.message}` } : { ok: true, message: `Linked, but the library did not load: ${out.message}` };
  },
  // One reload at a time: a second call while one runs gets the same result. Never rejects.
  reload() {
    if (!inflight) inflight = doReload(generation).finally(() => { inflight = null; });
    return inflight;
  },
  async unlink() {
    generation++;
    await delDevice(TOKEN);
    state.linked = false;
    state.lastError = "";
    await mine.refresh();
    render();
  },
  get mine() { return mine; },
  index: () => state.index,
  toast,
};

// ---------- screens ----------

function welcome() {
  if (state.linked) {
    return `
      <h2 class="page-title" tabindex="-1" data-focus>Waiting for your library</h2>
      <div class="card stack">
        <p>This phone is linked to ${esc(REPO)}, but no library has loaded yet.</p>
        ${state.lastError ? `<p class="msg bad">${esc(state.lastError)}</p>` : ""}
        <button class="btn" type="button" data-act="reload"${state.loading ? " disabled" : ""}>Reload</button>
      </div>
      <p><a class="btn ghost" href="?demo=1#explore">Look around with demo ideas</a></p>`;
  }
  return `
    <h2 class="page-title" tabindex="-1" data-focus>Welcome to tane</h2>
    <p class="sub">種, a seed. Explore the ideas from the videos you saved, from big areas down to single ideas, the videos behind them and how they connect.</p>
    <div class="card stack welcome">
      <h3>Two steps to bring in your library</h3>
      <p><b>1. Make a token</b> on GitHub that can read your private repo tane-data:</p>
      ${TOKEN_STEPS.replace("paste it here", "paste it in step 2")}
      <p><b>2. Paste it</b> in the Data sheet. It stays on this phone.</p>
      <button class="btn" type="button" data-act="link">Paste the token</button>
    </div>
    <p><a class="btn ghost" href="?demo=1#explore">Look around with demo ideas</a></p>`;
}

function sourceLine() {
  if (state.demo) return "Demo library: made-up ideas for trying the app.";
  if (!state.record) return "";
  return `From tane-data, loaded ${esc(when(state.record.loadedAt))}${state.loading ? " · reloading…" : ""}.`;
}

// The notes sync, in a line for the Mine tab (HTML).
function syncLine() {
  const st = mine.status;
  if (state.demo) return "Demo: what you write here is kept in memory only and is gone when you leave the demo.";
  if (!st.linked) return "Saved on this phone only. Link tane-data in the Data sheet to sync your notes.";
  if (st.syncing) return "Syncing with tane-data…";
  if (st.error) return `<span class="bad">Not synced: ${esc(st.error)}</span> <button class="link-btn" type="button" data-act="sync">Sync now</button>`;
  return st.syncedAt ? `Synced with tane-data ${esc(when(st.syncedAt))}.${st.pending ? " New changes go out shortly." : ""}` : "Not synced yet.";
}

function render() {
  $("#demo-bar").hidden = !state.demo;
  // A re-render (a background reload or sync) keeps focus on the same link,
  // button or search box.
  const a = document.activeElement;
  const keep = a && view.contains(a) ? (a.id === "mine-q" ? "#mine-q" : a.getAttribute("href") ? `[href="${CSS.escape(a.getAttribute("href"))}"]` : a.dataset.act ? `[data-act="${CSS.escape(a.dataset.act)}"]${a.dataset.id ? `[data-id="${CSS.escape(a.dataset.id)}"]` : ""}` : a.hasAttribute("data-focus") ? "[data-focus]" : null) : null;
  const caret = a?.id === "mine-q" ? a.selectionStart : null;
  // An opened "Claude's take" stays open through a re-render of the same page.
  const opened = new Set([...view.querySelectorAll("details[data-keep-open][open]")].map((d) => d.dataset.keepOpen));
  const route = parseHash(location.hash);
  const api = mine.api(state.index);
  if (state.failed) {
    view.innerHTML = `<h2 class="page-title" tabindex="-1" data-focus>Something went wrong</h2><div class="card"><p>${esc(state.failed)}</p></div>`;
  } else if (route.tab === "mine") {
    view.innerHTML = renderMine(route, state.index, api, { query: state.mineQuery, syncLine: syncLine(), filter: state.mineFilter });
  } else if (!state.index) {
    view.innerHTML = welcome();
  } else {
    view.innerHTML = renderExplore(route, state.index, sourceLine(), api);
  }
  for (const d of view.querySelectorAll("details[data-keep-open]")) if (opened.has(d.dataset.keepOpen)) d.open = true;
  for (const t of document.querySelectorAll(".tabs a")) {
    if (t.dataset.tab === route.tab) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
  }
  $("#note-btn").hidden = !!state.failed;
  document.title = titleFor();
  if (keep) {
    const el = view.querySelector(keep);
    el?.focus({ preventScroll: true });
    if (caret != null && el?.setSelectionRange) el.setSelectionRange(caret, caret);
  }
}

let toastTimer = null;
function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

function exportMine(kind) {
  const exp = buildExport({ notes: mine.api().notes, myIdeas: mine.api().ideas }, state.index);
  if (kind === "md") downloadFile(exportFileName("md"), toMarkdown(exp), "text/markdown");
  else downloadFile(exportFileName("json"), JSON.stringify(exp, null, 2), "application/json");
  toast("Export saved.");
}

function titleFor() {
  const h = view.querySelector("h2")?.textContent?.trim();
  return h && h !== "Areas" ? `${h.length > 50 ? `${h.slice(0, 49)}…` : h} · tane` : "tane";
}

// The "+" button: a note linked to whatever is on screen.
function quickNote() {
  const route = parseHash(location.hash);
  openNewNote(contextFor(route, state.index));
}

// A note button on a page (an idea's video, quote or question; Write a note).
function noteOn(el) {
  const route = parseHash(location.hash);
  const { context } = contextFor(route, state.index);
  if (isTakeType(el.dataset.type)) { openNewNote({ links: replyLinks(state.index, el.dataset.type, el.dataset.id), context }); return; }
  openNewNote({ links: [{ type: el.dataset.type, to: el.dataset.id, kind: el.dataset.type === "myIdea" ? "builds on" : "about" }], context, promptId: el.dataset.prompt });
}

// After navigating, start at the top and move focus to the new heading so a
// screen reader reads the new page.
function navigated() {
  render();
  window.scrollTo(0, 0);
  view.querySelector("[data-focus]")?.focus({ preventScroll: true });
}

view.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act === "link") openDataSheet(true);
  if (act === "reload") { el.disabled = true; app.reload(); }
  if (act === "note" || act === "reply") noteOn(el);
  if (act === "mine-filter") { state.mineFilter = el.dataset.id; render(); }
  if (act === "edit-note") editNote(el.dataset.id);
  if (act === "edit-idea") editIdea(el.dataset.id);
  if (act === "export-md") exportMine("md");
  if (act === "export-json") exportMine("json");
  if (act === "sync") mine.sync();
});
// Search what you wrote: only the results redraw, so the box keeps focus.
view.addEventListener("input", (e) => {
  if (e.target.id !== "mine-q") return;
  state.mineQuery = e.target.value;
  const out = $("#mine-results");
  if (out) out.innerHTML = mineResults(state.index, mine.api(state.index), state.mineQuery, state.mineFilter);
});
$("#data-btn").addEventListener("click", () => openDataSheet());
$("#note-btn").addEventListener("click", quickNote);
// Leaving the app (switching away on the phone): send what is not synced yet.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && mine.status.pending && mine.status.linked && navigator.onLine !== false) mine.sync(); });
// Back online: send what waited for the connection.
window.addEventListener("online", () => { if (mine.status.pending && mine.status.linked) mine.sync(); });
window.addEventListener("hashchange", navigated);

async function boot() {
  initDataSheet(app);
  initNoteSheet(app);
  state.demo = new URLSearchParams(location.search).has("demo");
  mine = createMine({ demo: state.demo, onChange: () => render() });
  try {
    state.linked = !!(await getDevice(TOKEN));
    state.record = (await get("library", "current")) ?? null;
    await mine.load();
  } catch (err) {
    // No IndexedDB (a private window on some browsers): the demo still works.
    if (!state.demo) state.failed = `tane could not open its storage on this device: ${err?.message || err}`;
  }
  if (state.demo) {
    try {
      const res = await fetch("demo/library.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const error = useLibrary(await res.json());
      if (error) state.failed = `The demo library could not be read: ${error}`;
    } catch (err) { state.failed = `The demo library could not be loaded: ${err?.message || err}`; }
  } else if (state.record) {
    const error = useLibrary(state.record.data);
    if (error) state.lastError = `The saved library could not be read (${error}). Tap Reload.`;
  }
  render();
  if (!state.demo && state.linked && reloadDue(state.record?.loadedAt) && navigator.onLine !== false) app.reload();
  if (!state.failed) mine.autoSync();
}

boot();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
