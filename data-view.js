// The Data sheet (header button): the link to tane-data (paste the token,
// when the library was last loaded, Reload, unlink), the demo library, and
// the JSON backup of the owner's own data.
import { $, esc, when, closeBtn, announce, downloadFile } from "./ui.js";
import { REPO, LIBRARY_PATH, APP_PATH, looksLikeToken } from "./sync.js";
import { buildBackup, backupFileName, parseBackup, countRecords, OWNER_STORES, FILE_STORES } from "./backup.js";
import { dump, replaceAll, setDevice } from "./db.js";
import { plural } from "./library.js";

const dialog = () => $("#data-dialog");
const sheet = () => $("#data-sheet");
const busy = new Set();
let app;

// The exact token settings, shown on the welcome card and in the sheet.
export const TOKEN_STEPS = `
  <ol class="steps">
    <li>On GitHub, open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Settings › Developer settings › Fine-grained tokens › Generate new token</a>.</li>
    <li>Name it <b>tane</b>. Resource owner: <b>syoon291</b>. Expiration: your choice (a year is fine; make a new one when it runs out).</li>
    <li>Repository access: <b>Only select repositories</b>, then pick <b>tane-data</b>.</li>
    <li>Permissions › Repository permissions › <b>Contents: Read and write</b>. (Metadata: read-only is added by itself.) Nothing else.</li>
    <li>Generate the token, copy it (it starts with <code>github_pat_</code>) and paste it here.</li>
  </ol>`;

export function initDataSheet(appApi) {
  app = appApi;
  const s = sheet();
  s.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    if (el.dataset.act === "close") { dialog().close(); return; }
    once(el.dataset.act, () => onAct(el.dataset.act));
  });
  s.addEventListener("submit", (e) => {
    e.preventDefault();
    once("link", () => onLink(e.target));
  });
  dialog().addEventListener("click", (e) => { if (e.target === dialog()) dialog().close(); });
  $("#import-file").addEventListener("change", onImportFile);
}

// One tap = one action: a second tap while the first is still running is dropped.
function once(key, run) {
  if (busy.has(key)) return;
  busy.add(key);
  Promise.resolve().then(run).catch((err) => say(err?.message || String(err), "bad")).finally(() => busy.delete(key));
}

export async function openDataSheet(focusToken = false) {
  await renderSheet();
  if (!dialog().open) dialog().showModal();
  if (focusToken) $("#token-input")?.focus();
}

function say(text, tone = "") {
  const m = $("#data-msg");
  if (!m) return;
  m.textContent = text;
  m.className = `msg ${tone}`;
}

function librarySection(st) {
  if (st.demo) {
    return `<section class="sheet-sec" aria-labelledby="lib-h">
      <h3 id="lib-h">Library</h3>
      <p>You are looking at the <b>demo library</b>: made-up ideas for trying the app. Your own library is not touched.</p>
      <a class="btn" href="./#explore">Leave the demo</a>
    </section>`;
  }
  if (!st.linked) {
    return `<section class="sheet-sec" aria-labelledby="lib-h">
      <h3 id="lib-h">Link tane-data</h3>
      <p class="hint">Your library comes from your private GitHub repo ${esc(REPO)} (file ${esc(LIBRARY_PATH)}). Make a token that can reach only that repo:</p>
      ${TOKEN_STEPS}
      <form class="token-form">
        <label for="token-input">Token</label>
        <input id="token-input" name="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…" required>
        <button class="btn" type="submit">Link</button>
      </form>
      <p class="hint">The token stays on this device. It is never part of a backup.</p>
    </section>`;
  }
  const rec = st.record;
  const facts = rec ? `<dl class="facts">
      <div><dt>Last loaded</dt><dd>${esc(when(rec.loadedAt))}</dd></div>
      ${rec.data.generatedAt ? `<div><dt>Exported</dt><dd>${esc(when(rec.data.generatedAt))}</dd></div>` : ""}
      <div><dt>Ideas</dt><dd>${st.index ? esc(plural(st.index.totals.ideas, "idea")) : ""}</dd></div>
    </dl>` : `<p>No library loaded yet.</p>`;
  return `<section class="sheet-sec" aria-labelledby="lib-h">
    <h3 id="lib-h">Library</h3>
    <p class="hint">Linked to ${esc(REPO)}. The library reloads by itself once a day when the phone is online, and works offline from the last copy.</p>
    ${facts}
    ${st.lastError ? `<p class="msg bad">${esc(st.lastError)}</p>` : ""}
    <button class="btn" type="button" data-act="reload">Reload</button>
    <button class="link-btn" type="button" data-act="unlink">Unlink this device</button>
  </section>`;
}

// Notes sync: what the owner writes goes to tane-data app/latest.json.
function notesSection(st) {
  if (st.demo || !st.linked) return "";
  const s = app.mine.status;
  return `<section class="sheet-sec" aria-labelledby="notes-sync-h">
    <h3 id="notes-sync-h">Your notes</h3>
    <p class="hint">What you write syncs to ${esc(REPO)} (file ${esc(APP_PATH)}) a few seconds after each change and when you open the app. Notes from another phone are merged in: the newer edit of a note wins, and deletes carry over.</p>
    <dl class="facts"><div><dt>Last synced</dt><dd>${s.syncedAt ? esc(when(s.syncedAt)) : "not yet"}</dd></div></dl>
    ${s.error ? `<p class="msg bad">${esc(s.error)}</p>` : ""}
    <button class="btn" type="button" data-act="sync-notes">Sync now</button>
  </section>`;
}

async function renderSheet() {
  const st = app.state;
  let counts = {};
  try { counts = countRecords(await dump(OWNER_STORES)); } catch {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  sheet().innerHTML = `
    <div class="sheet-head"><h2 id="data-title">Data</h2>${closeBtn}</div>
    <p id="data-msg" class="msg" role="status" aria-live="polite"></p>
    ${librarySection(st)}
    ${notesSection(st)}
    <section class="sheet-sec" aria-labelledby="backup-h">
      <h3 id="backup-h">Backup</h3>
      <p class="hint">A JSON file of what you write in tane (${total ? esc(plural(total, "record")) : "nothing yet"}). The library is not in it (it reloads from tane-data), and neither is the token.${st.demo ? " Demo notes are never in it." : ""}</p>
      <button class="btn ghost" type="button" data-act="export">Export backup</button>
      ${st.demo ? "" : `<button class="btn ghost" type="button" data-act="import">Import backup</button>`}
    </section>`;
}

async function onLink(form) {
  const token = String(new FormData(form).get("token") || "").trim();
  if (!looksLikeToken(token)) { say("That does not look like a fine-grained GitHub token (github_pat_…). Classic ghp_ tokens are not accepted.", "bad"); return; }
  say("Checking the token…");
  const out = await app.link(token);
  await renderSheet();
  say(out.message, out.ok ? "good" : "bad");
  if (!out.ok) $("#token-input")?.focus();
}

async function onAct(act) {
  if (act === "reload") {
    say("Loading the library…");
    const out = await app.reload();
    await renderSheet();
    say(out.message, out.ok ? "good" : "bad");
  } else if (act === "unlink") {
    if (!confirm("Unlink this device from tane-data? The token is removed from this phone. The last loaded library stays until you link again.")) return;
    await app.unlink();
    await renderSheet();
    say("Unlinked. The token is gone from this device.", "good");
  } else if (act === "sync-notes") {
    say("Syncing your notes…");
    const out = await app.mine.sync();
    await renderSheet();
    say(out.message, out.ok ? "good" : "bad");
  } else if (act === "export") {
    const file = buildBackup(await dump(FILE_STORES));
    downloadFile(backupFileName(), JSON.stringify(file, null, 2), "application/json");
    say("Backup saved.", "good");
  } else if (act === "import") {
    $("#import-file").click();
  }
}

async function onImportFile(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  let text;
  try { text = await file.text(); }
  catch (err) { say(`That file could not be read: ${err?.message || err}`, "bad"); return; }
  const r = parseBackup(text);
  if (!r.ok) { say(r.error, "bad"); return; }
  const c = countRecords(r.backup.stores);
  const summary = OWNER_STORES.filter((k) => k in r.backup.stores).map((k) => `${k}: ${c[k]}`).join(", ");
  // Linked: the next sync merges with tane-data, so notes only it has come back and its newer edits and deletes win.
  const merges = app.mine?.status?.linked ? " The next sync merges it with tane-data: notes only tane-data has come back, and its newer edits and deletes win." : "";
  if (!confirm(`Replace what you wrote on this device with this backup (${summary})? The library and the token are not touched.${merges}`)) return;
  const stores = Object.fromEntries(FILE_STORES.filter((k) => k in r.backup.stores).map((k) => [k, r.backup.stores[k]]));
  try { await replaceAll(stores); }
  catch (err) { say(`Import failed, nothing changed: ${err?.message || err}`, "bad"); return; }
  // Restored notes have not reached tane-data: keep them pending until a sync does.
  try { await setDevice("notesPending", true); } catch {}
  await app.mine.refresh();
  app.mine.scheduleSync();
  await renderSheet();
  say("Backup imported.", "good");
  announce("Backup imported.");
}
