// The link to the owner's private GitHub repo tane-data, through the GitHub
// Contents API. It reads library/latest.json (written by furikaeri's export,
// never written here) and reads and writes app/latest.json (the owner's
// notes, with genki's merging sync: mergeSync here, the merge in merge.js).
// Pure functions with fetch passed in, so they run under `node --test` with a
// mocked fetch as well as in the browser.
//
// The token is passed in by the caller and only ever goes into the
// Authorization header: it is never put in a message, a URL or a log.

export const REPO = "syoon291/tane-data";
export const LIBRARY_PATH = "library/latest.json";
export const APP_PATH = "app/latest.json";
export const PATHS = [LIBRARY_PATH, APP_PATH];
const API = "https://api.github.com";
const REPO_URL = `${API}/repos/${REPO}`;
const fileUrl = (path) => `${REPO_URL}/contents/${path}`;
const ALLOWED = new Set([REPO_URL, ...PATHS.map(fileUrl)]);
const TIMEOUT_MS = 30000;
const MAX_TRIES = 3;

// code: "network" | "token" | "forbidden" | "repo" | "file" | "github" | "refused"
export class SyncError extends Error {
  constructor(message, code, status = 0) {
    super(message);
    this.name = "SyncError";
    this.code = code;
    this.status = status;
  }
}

function headers(token, accept = "application/vnd.github+json") {
  return { Accept: accept, Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
}

async function call(fetchFn, url, init) {
  // Hard guard: this module may only ever touch the repo itself and its known files.
  if (!ALLOWED.has(url)) throw new SyncError("Refusing to touch anything but tane-data's known files.", "refused");
  const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  // redirect "error": a redirect (a renamed repo) must not take the token past the allowlist.
  try { return await fetchFn(url, { cache: "no-store", redirect: "error", signal, ...init }); }
  catch { throw new SyncError("Could not reach GitHub. Check the connection and try again.", "network"); }
}

const REPO_MISSING = "The token cannot see syoon291/tane-data. Either the repo does not exist yet, or the token was made without access to it (Repository access: Only select repositories, tane-data).";

async function failure(res, what) {
  let detail = "";
  try { detail = (await res.json())?.message || ""; } catch {}
  if (res.status === 401) return new SyncError("GitHub did not accept the token. It may be mistyped, expired or revoked: make a new one and paste it again.", "token", 401);
  if (res.status === 403) return new SyncError(`GitHub refused to ${what}${detail ? ` (${detail})` : ""}. The token needs Contents access on tane-data.`, "forbidden", 403);
  if (res.status === 404) return new SyncError(REPO_MISSING, "repo", 404);
  return new SyncError(`GitHub could not ${what} (${res.status}${detail ? `: ${detail}` : ""}). Try again later.`, "github", res.status);
}

// Check the token reaches tane-data. Returns { private, canWrite }.
export async function checkAccess(token, fetchFn = fetch) {
  const res = await call(fetchFn, REPO_URL, { headers: headers(token) });
  if (!res.ok) throw await failure(res, "show tane-data");
  const repo = await res.json().catch(() => null);
  return { private: repo?.private === true, canWrite: repo?.permissions ? repo.permissions.push !== false : null };
}

// A file's text, or null when the repo is visible but the file is not there yet.
// The raw media type works for files over 1 MB, where the JSON answer has no content.
export async function readFile(token, path, fetchFn = fetch) {
  const res = await call(fetchFn, fileUrl(path), { headers: headers(token, "application/vnd.github.raw+json") });
  if (res.status === 404) {
    // 404 means "no file" only when the repo itself is visible.
    await checkAccess(token, fetchFn);
    return null;
  }
  if (!res.ok) throw await failure(res, `read ${path}`);
  return res.text();
}

// library/latest.json's text. A missing file is an error that reads well:
// the repo exists but furikaeri has not exported to it yet.
export async function fetchLibrary(token, fetchFn = fetch) {
  const text = await readFile(token, LIBRARY_PATH, fetchFn);
  if (text === null) throw new SyncError("tane-data has no library yet (library/latest.json). It appears after the next export from furikaeri on the computer; then tap Reload.", "file", 404);
  return text;
}

// UTF-8 text to base64, in chunks so a large file does not overflow the call stack.
export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// app/latest.json's text and sha, or null when it is not there yet.
// The sha comes from the object media type (it answers for files over 1 MB too,
// with empty content); the text from the raw media type.
export async function fetchAppFile(token, fetchFn = fetch) {
  const res = await call(fetchFn, fileUrl(APP_PATH), { headers: headers(token, "application/vnd.github.object+json") });
  if (res.status === 404) {
    await checkAccess(token, fetchFn);
    return null;
  }
  if (!res.ok) throw await failure(res, `read ${APP_PATH}`);
  const meta = await res.json().catch(() => null);
  if (typeof meta?.sha !== "string") throw new SyncError(`GitHub sent an unexpected answer for ${APP_PATH}.`, "github");
  const text = await readFile(token, APP_PATH, fetchFn);
  if (text === null) return null;
  return { sha: meta.sha, text };
}

// One PUT of `text` to app/latest.json over version `sha` (null for a new file).
// Returns { sha } on success, or { conflict: true } when the file moved on
// since (GitHub answers 409, or 422 to a write without a sha when the file exists).
async function putOnce(token, text, sha, fetchFn, message) {
  const body = { message, content: toBase64(text) };
  if (sha) body.sha = sha;
  const res = await call(fetchFn, fileUrl(APP_PATH), { method: "PUT", headers: { ...headers(token), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) {
    const out = await res.json().catch(() => null);
    const next = out?.content?.sha;
    if (typeof next !== "string") throw new SyncError("GitHub saved the notes but sent an unexpected answer.", "github");
    return { sha: next };
  }
  // 422 means "a sha was needed" only when none was sent; otherwise it is a real refusal.
  if (res.status === 409 || (res.status === 422 && !sha)) return { conflict: true };
  throw await failure(res, `save ${APP_PATH}`);
}

// The merging sync: fetch app/latest.json, let `build(remote)` turn it
// ({ sha, text } or null when there is no file yet) into the text to write,
// and PUT that over exactly the version it was built from. If another write
// landed in between (a conflict), fetch and build again, up to three times, so
// nothing written elsewhere is ever overwritten unmerged. Returns { sha, remote }.
export async function mergeSync(token, build, { fetchFn = fetch, message = "tane sync" } = {}) {
  // The owner's notes go only to a private repo: refuse to write if tane-data is (or became) public.
  const access = await checkAccess(token, fetchFn);
  if (access.private !== true) throw new SyncError(`${REPO} is not private, so your notes were not sent. Make the repo private on GitHub, then sync again.`, "public");
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const remote = await fetchAppFile(token, fetchFn);
    const text = await build(remote);
    const out = await putOnce(token, text, remote?.sha ?? null, fetchFn, message);
    if (!out.conflict) return { sha: out.sha, remote };
  }
  throw new SyncError("GitHub kept reporting a conflict. Try again in a minute.", "github");
}

// The library reloads by itself once a local day: due when the last load was on an earlier day.
export function reloadDue(lastLoadedAt, now = new Date()) {
  if (!lastLoadedAt) return true;
  const last = new Date(lastLoadedAt);
  if (Number.isNaN(last.getTime())) return true;
  const day = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  return day(last) !== day(now) && last < now;
}

// A fine-grained token looks like github_pat_... Classic tokens (ghp_...) are
// refused: they cannot be limited to tane-data. Only a sanity check on what
// was pasted: GitHub decides if it works.
export function looksLikeToken(s) {
  return /^github_pat_[A-Za-z0-9_]{20,}$/.test(String(s));
}
