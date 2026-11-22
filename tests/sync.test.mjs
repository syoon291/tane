import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchLibrary, checkAccess, readFile, reloadDue, looksLikeToken, SyncError, REPO, mergeSync, PATHS } from "../sync.js";

const TOKEN = "github_pat_" + "a".repeat(30);
const REPO_URL = `https://api.github.com/repos/${REPO}`;
const FILE_URL = `${REPO_URL}/contents/library/latest.json`;

// A fake GitHub: routes maps a URL to { status, body }.
function fakeFetch(routes, seen = []) {
  return async (url, init) => {
    seen.push({ url, init });
    const r = routes[url];
    if (r === "offline") throw new TypeError("Failed to fetch");
    if (!r) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  };
}

test("fetches the library's raw text with the token only in the header", async () => {
  const seen = [];
  const text = await fetchLibrary(TOKEN, fakeFetch({ [FILE_URL]: { body: '{"schema":"tane-library"}' } }, seen));
  assert.equal(text, '{"schema":"tane-library"}');
  assert.equal(seen[0].url, FILE_URL);
  assert.equal(seen[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(seen[0].init.headers.Accept, "application/vnd.github.raw+json");
  assert.equal(seen[0].init.cache, "no-store");
  assert.ok(!seen[0].url.includes(TOKEN));
});

const failsWith = async (routes, code, pattern) => {
  await assert.rejects(fetchLibrary(TOKEN, fakeFetch(routes)), (err) => {
    assert.ok(err instanceof SyncError);
    assert.equal(err.code, code);
    assert.match(err.message, pattern);
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });
};

test("a missing file in a visible repo reads as 'no library yet'", () =>
  failsWith({ [REPO_URL]: { body: { private: true } } }, "file", /no library yet/));

test("a repo the token cannot see (or that does not exist yet) says so", () =>
  failsWith({}, "repo", /does not exist yet, or the token was made without access/));

test("a bad token says so", () =>
  failsWith({ [FILE_URL]: { status: 401, body: { message: "Bad credentials" } } }, "token", /did not accept the token/));

test("a refused token says what it needs", () =>
  failsWith({ [FILE_URL]: { status: 403, body: { message: "Resource not accessible" } } }, "forbidden", /needs Contents access/));

test("offline is a network error", () =>
  failsWith({ [FILE_URL]: "offline" }, "network", /Could not reach GitHub/));

test("checkAccess reports private and write access", async () => {
  assert.deepEqual(await checkAccess(TOKEN, fakeFetch({ [REPO_URL]: { body: { private: true, permissions: { push: true } } } })), { private: true, canWrite: true });
});

test("refuses any path it does not know", async () => {
  await assert.rejects(readFile(TOKEN, "history/secret.json", fakeFetch({})), (err) => err.code === "refused");
});

test("reloadDue: once a local day", () => {
  const now = new Date(2026, 10, 21, 9, 0);
  assert.equal(reloadDue(null, now), true);
  assert.equal(reloadDue("garbage", now), true);
  assert.equal(reloadDue(new Date(2026, 10, 21, 7, 0).toISOString(), now), false);
  assert.equal(reloadDue(new Date(2026, 10, 20, 23, 0).toISOString(), now), true);
});

test("looksLikeToken accepts only fine-grained tokens", () => {
  assert.equal(looksLikeToken(TOKEN), true);
  assert.equal(looksLikeToken("ghp_" + "a".repeat(36)), false);
  assert.equal(looksLikeToken("github_pat_short"), false);
});

test("notes sync: reads app/latest.json, PUTs the built text over its sha, and retries on a conflict", async () => {
  const APP_URL = `${REPO_URL}/contents/app/latest.json`;
  const seen = [];
  let puts = 0, version = 1;
  const fetchFn = async (url, init = {}) => {
    seen.push({ url, init });
    if (url === APP_URL && init.method === "PUT") {
      puts++;
      const body = JSON.parse(init.body);
      if (puts === 1) { version = 2; return new Response("{}", { status: 409 }); }
      assert.equal(body.sha, "sha-2");
      assert.equal(Buffer.from(body.content, "base64").toString("utf8"), "built from v2 ✓");
      return new Response(JSON.stringify({ content: { sha: "sha-3" } }), { status: 200 });
    }
    if (url === APP_URL && init.headers.Accept === "application/vnd.github.raw+json") return new Response(`v${version}`, { status: 200 });
    if (url === APP_URL) return new Response(JSON.stringify({ sha: `sha-${version}` }), { status: 200 });
    if (url === REPO_URL) return new Response(JSON.stringify({ private: true }), { status: 200 });
    return new Response("{}", { status: 404 });
  };
  const out = await mergeSync(TOKEN, (remote) => `built from ${remote.text} ✓`, { fetchFn });
  assert.equal(out.sha, "sha-3");
  assert.equal(puts, 2);
  assert.ok(seen.every((s) => !s.url.includes(TOKEN)));
});

test("notes sync: no file yet writes a new one without a sha", async () => {
  const APP_URL = `${REPO_URL}/contents/app/latest.json`;
  let body;
  const fetchFn = async (url, init = {}) => {
    if (url === APP_URL && init.method === "PUT") { body = JSON.parse(init.body); return new Response(JSON.stringify({ content: { sha: "s1" } }), { status: 201 }); }
    if (url === REPO_URL) return new Response(JSON.stringify({ private: true }), { status: 200 });
    return new Response("{}", { status: 404 });
  };
  const out = await mergeSync(TOKEN, (remote) => { assert.equal(remote, null); return "{}"; }, { fetchFn });
  assert.equal(out.sha, "s1");
  assert.equal(body.sha, undefined);
  assert.match(body.message, /^tane sync/);
  assert.equal(PATHS.includes("app/latest.json"), true);
});

test("notes sync refuses to write when tane-data is not private", async () => {
  let puts = 0;
  const fetchFn = async (url, init = {}) => {
    if (init.method === "PUT") puts++;
    if (url === REPO_URL) return new Response(JSON.stringify({ private: false }), { status: 200 });
    return new Response("{}", { status: 404 });
  };
  await assert.rejects(mergeSync(TOKEN, () => "{}", { fetchFn }), (e) => e instanceof SyncError && e.code === "public");
  assert.equal(puts, 0);
});
