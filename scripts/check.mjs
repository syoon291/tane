// Fast check for a no-build static app: every script parses, the manifest is
// well formed, every file the service worker precaches exists and is
// published by the Pages workflow, the CSP stays tight, the demo library is
// valid and made up, and the color tokens keep their contrast. Run from the
// repo root with Node 20+.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { contrastFailures } from "./contrast.mjs";
import { parseLibrary } from "../library.js";

const fail = (msg) => { console.error(`check failed: ${msg}`); process.exit(1); };

// Every app module at the repo root (sw.js is a classic service worker script).
const MODULES = readdirSync(".").filter((f) => f.endsWith(".js") && f !== "sw.js");
for (const [f, args] of [...MODULES.map((m) => [m, ["--input-type=module"]]), ["sw.js", []]]) {
  try { execFileSync(process.execPath, ["--check", ...args], { input: readFileSync(f), stdio: ["pipe", "pipe", "pipe"] }); }
  catch (e) { fail(`${f} does not parse\n${e.stderr}`); }
}

let manifest;
try { manifest = JSON.parse(readFileSync("manifest.webmanifest", "utf8")); }
catch (e) { fail(`manifest.webmanifest is not valid JSON: ${e.message}`); }
for (const k of ["name", "short_name", "start_url", "display", "icons"]) if (!manifest[k]) fail(`manifest.webmanifest is missing ${k}`);
for (const i of manifest.icons) if (!existsSync(i.src)) fail(`manifest icon ${i.src} does not exist`);

const shellMatch = readFileSync("sw.js", "utf8").match(/const SHELL = (\[[^\]]*\])/);
if (!shellMatch) fail("could not find the SHELL list in sw.js");
const shell = JSON.parse(shellMatch[1]).filter((f) => f !== "./");
for (const f of shell) if (!existsSync(f)) fail(`sw.js precaches ${f}, which does not exist`);
// Every app module is precached (the app breaks offline otherwise), and so is everything it imports or fetches.
for (const m of MODULES) {
  if (!shell.includes(m)) fail(`${m} is an app module, but sw.js does not precache it`);
  const src = readFileSync(m, "utf8");
  for (const [, f] of src.matchAll(/from "\.\/([^"]+)"/g)) if (!shell.includes(f)) fail(`${m} imports ${f}, but sw.js does not precache it`);
  for (const [, f] of src.matchAll(/fetch\("([^":]+)"\)/g)) if (!shell.includes(f)) fail(`${m} fetches ${f}, but sw.js does not precache it`);
}

const html = readFileSync("index.html", "utf8");
for (const [, f] of html.matchAll(/(?:href|src)="([^":#?]+)"/g)) if (f !== "./" && !shell.includes(f)) fail(`index.html loads ${f}, but sw.js does not precache it`);

// The page runs no third-party or inline code and talks only to this site
// and the GitHub API (tane-data).
const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
if (!csp) fail("index.html has no Content-Security-Policy meta");
const directive = (name) => csp.split(";").map((d) => d.trim().split(/\s+/)).find((d) => d[0] === name)?.slice(1).join(" ");
if (directive("script-src") !== "'self'") fail(`CSP script-src must be exactly 'self', found ${directive("script-src")}`);
const CONNECT = "'self' https://api.github.com";
if (directive("connect-src") !== CONNECT) fail(`CSP connect-src must be exactly ${CONNECT}, found ${directive("connect-src")}`);
for (const [, tag] of html.matchAll(/<script\b([^>]*)>/g)) if (!/\bsrc="[^":]+"/.test(tag)) fail("index.html has an inline or remote script");
for (const f of ["index.html", ...MODULES]) {
  const src = readFileSync(f, "utf8");
  if (/\son[a-z]+\s*=\s*["'`]/.test(src)) fail(`${f} has an inline event handler, which the CSP blocks`);
  if (/\sstyle\s*=\s*["'`]/.test(src)) fail(`${f} has an inline style attribute, which the CSP blocks`);
}
// Only sync.js talks to GitHub.
for (const m of MODULES.filter((m) => m !== "sync.js")) if (readFileSync(m, "utf8").includes("api.github.com")) fail(`${m} calls the GitHub API; only sync.js may`);

// The Pages workflow copies an explicit file list into the site: every precached file must be in it.
const wf = readFileSync(".github/workflows/pages.yml", "utf8").match(/cp -R ([^\n]*) _site\//);
if (!wf) fail("could not find the site copy step in .github/workflows/pages.yml");
const staged = wf[1].trim().split(/\s+/);
for (const f of shell) if (!staged.includes(f.split("/")[0])) fail(`sw.js precaches ${f}, but the Pages workflow does not copy it into the site`);

// Public repo: the demo library is valid and made up (demo creators, demo video links only).
const demo = parseLibrary(readFileSync("demo/library.json", "utf8"));
if (!demo.ok) fail(`demo/library.json: ${demo.error}`);
if (demo.skipped) fail(`demo/library.json has ${demo.skipped} malformed items`);
for (const v of demo.library.videos) {
  if (!/^@demo(\.[a-z]+)?$/.test(v.creator)) fail(`demo/library.json: video ${v.id} has a creator that is not a made-up @demo name`);
  if (!/^https:\/\/www\.tiktok\.com\/@demo\/video\/\d+$/.test(v.url)) fail(`demo/library.json: video ${v.id} links somewhere other than a made-up @demo URL`);
}
// No token-shaped strings in anything that ships.
for (const f of [...MODULES, "sw.js", "index.html", "demo/library.json"]) if (/github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,}/.test(readFileSync(f, "utf8"))) fail(`${f} contains something that looks like a GitHub token`);

// Color tokens keep their contrast floors in light and dark (scripts/contrast.mjs).
const low = contrastFailures(readFileSync("styles.css", "utf8"));
if (low.length) fail(`contrast below the floor in styles.css:\n  ${low.join("\n  ")}`);

console.log(`ok: ${MODULES.length} modules parse, manifest valid, ${shell.length} shell files precached and published, CSP tight, demo library valid (${demo.library.ideas.length} ideas), contrast meets its floors`);
