import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ratio, tokenBlocks, contrastFailures } from "../scripts/contrast.mjs";

test("contrast ratio matches WCAG for black on white", () => {
  assert.equal(Math.round(ratio("#000000", "#ffffff")), 21);
});

test("tokenBlocks reads light and dark", () => {
  const t = tokenBlocks(":root { --ink: #000000; --bg: #ffffff; } @media (prefers-color-scheme: dark) { :root { --ink: #ffffff; } }");
  assert.equal(t.light.ink, "#000000");
  assert.equal(t.dark.ink, "#ffffff");
  assert.equal(t.dark.bg, "#ffffff");
});

test("contrastFailures flags a weak token", () => {
  assert.ok(contrastFailures(":root { --ink: #eeeeee; --bg: #ffffff; }").some((f) => f.includes("--ink")));
});

test("the fast check passes on the repo", () => {
  const out = execFileSync(process.execPath, ["scripts/check.mjs"], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" });
  assert.match(out, /^ok:/);
});
