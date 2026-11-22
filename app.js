// App shell: boots the store, picks the library to show (the demo with
// ?demo=1, else the copy cached from tane-data), routes by URL hash and
// renders #view. The Data sheet lives in data-view.js.
import { $, esc, when, announce } from "./ui.js";
import { get, put, getDevice, setDevice, delDevice } from "./db.js";
import { parseLibrary, buildIndex, plural } from "./library.js";
import { parseHash } from "./router.js";
import { renderExplore } from "./explore-view.js";
import { REPO, LIBRARY_PATH, fetchLibrary, checkAccess, reloadDue, SyncError } from "./sync.js";
import { initDataSheet, openDataSheet, TOKEN_STEPS } from "./data-view.js";

const view = $("#view");
const TOKEN = "githubToken";

// demo: the demo library is showing (never written to the store).
// record: the cached library record from tane-data ({ id, data, loadedAt, source }).
const state = { demo: false, linked: false, record: null, index: null, lastError: "", loading: false, failed: "" };

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
    render();
  },
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

function render() {
  $("#demo-bar").hidden = !state.demo;
  // A re-render (a background reload) keeps focus on the same link or button.
  const a = document.activeElement;
  const keep = a && view.contains(a) ? (a.getAttribute("href") ? `[href="${CSS.escape(a.getAttribute("href"))}"]` : a.dataset.act ? `[data-act="${CSS.escape(a.dataset.act)}"]` : a.hasAttribute("data-focus") ? "[data-focus]" : null) : null;
  const route = parseHash(location.hash);
  if (state.failed) {
    view.innerHTML = `<h2 class="page-title" tabindex="-1" data-focus>Something went wrong</h2><div class="card"><p>${esc(state.failed)}</p></div>`;
  } else if (!state.index) {
    view.innerHTML = welcome();
  } else {
    view.innerHTML = renderExplore(route, state.index, sourceLine());
  }
  document.title = titleFor();
  if (keep) view.querySelector(keep)?.focus({ preventScroll: true });
}

function titleFor() {
  const h = view.querySelector("h2")?.textContent?.trim();
  return h && h !== "Areas" ? `${h.length > 50 ? `${h.slice(0, 49)}…` : h} · tane` : "tane";
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
  if (el.dataset.act === "link") openDataSheet(true);
  if (el.dataset.act === "reload") { el.disabled = true; app.reload(); }
});
$("#data-btn").addEventListener("click", () => openDataSheet());
window.addEventListener("hashchange", navigated);

async function boot() {
  initDataSheet(app);
  state.demo = new URLSearchParams(location.search).has("demo");
  try {
    state.linked = !!(await getDevice(TOKEN));
    state.record = (await get("library", "current")) ?? null;
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
}

boot();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
