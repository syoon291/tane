// The link to the owner's private GitHub repo tane-data, through the GitHub
// Contents API. Phase 1 only reads library/latest.json (written by furikaeri's
// export). Phase 2 adds app/latest.json (the owner's notes, read and written
// with genki's merging sync): add it to PATHS and build on readFile.
// Pure functions with fetch passed in, so they run under `node --test` with a
// mocked fetch as well as in the browser.
//
// The token is passed in by the caller and only ever goes into the
// Authorization header: it is never put in a message, a URL or a log.

export const REPO = "syoon291/tane-data";
export const LIBRARY_PATH = "library/latest.json";
export const PATHS = [LIBRARY_PATH];
const API = "https://api.github.com";
const REPO_URL = `${API}/repos/${REPO}`;
const fileUrl = (path) => `${REPO_URL}/contents/${path}`;
const ALLOWED = new Set([REPO_URL, ...PATHS.map(fileUrl)]);
const TIMEOUT_MS = 30000;

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
  try { return await fetchFn(url, { cache: "no-store", signal, ...init }); }
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
