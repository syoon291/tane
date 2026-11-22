// The owner's notes and own ideas on this device, and their sync to tane-data
// app/latest.json (genki's merging sync: sync.js mergeSync, merge.js).
//
// In demo mode nothing here touches IndexedDB or GitHub: notes written while
// the made-up demo library shows live in memory and are gone on leaving it,
// so demo links never reach the owner's real notes.
//
// Device keys (tane-device, never synced): notesSha (the app/latest.json
// version this device last wrote), notesSyncedAt, notesSyncError, notesPending
// (something written here has not reached tane-data yet).
import { getAll, putMine, delMine, dump, applyChanges, getDevice, setDevice, delDevice, KEY_PATHS } from "./db.js";
import { mergeStores, diffStores } from "./merge.js";
import { buildBackup, parseBackup, FILE_STORES } from "./backup.js";
import { mergeSync, reloadDue } from "./sync.js";
import { mineAbout, promote as promoteNote } from "./notes.js";

const TOKEN = "githubToken";
const SYNC_DELAY_MS = 2500;

export function createMine({ demo = false, onChange = () => {}, online = () => navigator.onLine !== false } = {}) {
  const data = { notes: [], ideas: [] };
  const status = { syncing: false, syncedAt: null, error: "", linked: false, pending: false };
  let timer = null, running = null, again = false;

  async function load() {
    if (demo) return;
    [data.notes, data.ideas] = await Promise.all([getAll("notes"), getAll("myIdeas")]);
    status.syncedAt = await getDevice("notesSyncedAt", null);
    status.error = await getDevice("notesSyncError", "");
    status.linked = !!(await getDevice(TOKEN, null));
    status.pending = !!(await getDevice("notesPending", false));
  }

  // The read side the views use.
  function api(ix) {
    return {
      demo,
      notes: data.notes,
      ideas: data.ideas,
      note: (id) => data.notes.find((n) => n.id === id) ?? null,
      idea: (id) => data.ideas.find((m) => m.id === id) ?? null,
      about: (type, id) => { const r = mineAbout(type, id, data.notes, data.ideas, ix); return { notes: r.notes, ideas: r.ideas }; },
    };
  }

  // Memory writes for the demo, stamped like db.js does.
  function memWrite(writes, dels, at) {
    const list = (store) => (store === "notes" ? data.notes : data.ideas);
    for (const { store, key } of dels) { const l = list(store); const i = l.findIndex((r) => r.id === key); if (i >= 0) l.splice(i, 1); }
    for (const { store, record } of writes) {
      const l = list(store); const r = { ...record, editedAt: at }; const i = l.findIndex((x) => x.id === r.id);
      if (i >= 0) l[i] = r; else l.push(r);
    }
  }

  async function write(writes, dels = []) {
    const at = new Date().toISOString();
    if (demo) memWrite(writes, dels, at);
    else {
      if (dels.length) await delMine(dels, writes, at); else await putMine(writes, at);
      if (running) again = true;
      await setDevice("notesPending", true);
      await load();
    }
    onChange();
    scheduleSync();
  }

  const saveNote = (note) => write([{ store: "notes", record: note }]);
  const saveIdea = (idea) => write([{ store: "myIdeas", record: idea }]);
  async function promote(note) {
    const { idea, note: updated } = promoteNote(note);
    await write([{ store: "notes", record: updated }, { store: "myIdeas", record: idea }]);
    return idea;
  }
  // Deleting a note leaves its own idea (which keeps fromNote); deleting an
  // idea clears ideaId on the note it came from.
  function deleteNote(id) { return write([], [{ store: "notes", key: id }]); }
  function deleteIdea(id) {
    const idea = data.ideas.find((m) => m.id === id);
    const from = idea?.fromNote ? data.notes.find((n) => n.id === idea.fromNote && n.ideaId === id) : null;
    const writes = from ? [{ store: "notes", record: (({ ideaId, ...rest }) => rest)(from) }] : [];
    return write(writes, [{ store: "myIdeas", key: id }]);
  }

  // ---------- sync ----------

  function scheduleSync() {
    if (demo || !status.linked || !online()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { sync().catch(() => {}); }, SYNC_DELAY_MS);
  }

  // One sync at a time; a write during a sync runs one more after it.
  function sync() {
    if (demo) return Promise.resolve({ ok: false, message: "The demo is never synced." });
    if (running) { again = true; return running; }
    running = (async () => {
      try { return await syncOnce(); }
      finally {
        running = null;
        if (again) { again = false; scheduleSync(); }
      }
    })();
    return running;
  }

  async function syncOnce() {
    let token;
    try { token = await getDevice(TOKEN, null); }
    catch (e) { status.error = `This device's settings could not be read: ${e?.message || e}`; onChange(); return { ok: false, message: status.error }; }
    status.linked = !!token;
    if (!token) return { ok: false, message: "Link tane-data in the Data sheet to sync your notes." };
    status.syncing = true;
    onChange();
    try {
      const now = new Date();
      const local = await dump(FILE_STORES);
      let merged = local;
      const { sha } = await mergeSync(token, (remote) => {
        merged = local;
        if (remote) {
          const parsed = parseBackup(remote.text);
          // Never write over a copy this app cannot read (corrupt, or from a newer tane).
          if (!parsed.ok) throw new Error(`The notes in tane-data (app/latest.json) cannot be used: ${parsed.error} Nothing was changed.`);
          merged = mergeStores(local, parsed.backup.stores, KEY_PATHS);
        }
        return JSON.stringify(buildBackup(merged, now), null, 2);
      }, { message: `tane sync ${now.toISOString()}` });
      await setDevice("notesSha", sha);
      let applied, skipped;
      try { ({ applied, skipped } = await applyChanges(diffStores(local, merged, KEY_PATHS))); }
      catch (e) { throw new Error(`Saved to tane-data, but this phone could not be updated: ${e.message} Sync again to finish.`); }
      // A record edited while syncing was left as it is; the next sync sends it.
      if (!skipped) {
        await setDevice("notesSyncedAt", now.toISOString());
        status.syncedAt = now.toISOString();
        // Only what was dumped went out: a write after the dump keeps it pending.
        if (!again) await delDevice("notesPending");
      } else again = true;
      await delDevice("notesSyncError");
      status.error = "";
      await load();
      return { ok: true, applied, message: `Notes synced.${applied ? ` ${applied} ${applied === 1 ? "record" : "records"} came from tane-data.` : ""}` };
    } catch (e) {
      status.error = e?.message || String(e);
      try { await setDevice("notesSyncError", status.error); } catch {}
      return { ok: false, message: status.error };
    } finally {
      status.syncing = false;
      onChange();
    }
  }

  // On open: a linked phone syncs once a local day, and whenever something
  // written here has not gone out yet (a failed or skipped sync).
  async function autoSync() {
    if (demo || !status.linked || !online()) return;
    if (status.pending || status.error || reloadDue(status.syncedAt)) await sync();
  }

  // After a link, unlink, or a backup import.
  async function refresh() { await load(); onChange(); }

  return { load, api, saveNote, saveIdea, promote, deleteNote, deleteIdea, sync, autoSync, refresh, status, scheduleSync };
}
