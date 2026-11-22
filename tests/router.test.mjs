import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHash, hrefFor } from "../router.js";

const home = { tab: "explore", level: "areas", id: null };

test("empty and unknown hashes open the areas", () => {
  for (const h of ["", "#", "#explore", "#/explore", "#today", "#nonsense/idea/1"]) assert.deepEqual(parseHash(h), home, h);
});

test("levels parse with their id", () => {
  assert.deepEqual(parseHash("#explore/area/area-1"), { tab: "explore", level: "area", id: "area-1" });
  assert.deepEqual(parseHash("#explore/theme/theme-2"), { tab: "explore", level: "theme", id: "theme-2" });
  assert.deepEqual(parseHash("#explore/idea/idea-3f9a1c"), { tab: "explore", level: "idea", id: "idea-3f9a1c" });
});

test("a level without an id, or a bad one, opens the areas", () => {
  assert.deepEqual(parseHash("#explore/idea"), home);
  assert.deepEqual(parseHash("#explore/video/v1"), home);
  assert.deepEqual(parseHash("#explore/idea/%E0%A4%A"), home);
});

test("hrefFor round-trips through parseHash, odd ids included", () => {
  for (const id of ["idea-1", "a b/c#d", "種"]) assert.deepEqual(parseHash(hrefFor("idea", id)), { tab: "explore", level: "idea", id });
  assert.equal(hrefFor(), "#explore");
  assert.equal(hrefFor("area", null), "#explore");
});

test("the Mine tab: its home and an own idea", () => {
  for (const h of ["#mine", "#mine/x", "#mine/idea"]) assert.deepEqual(parseHash(h), { tab: "mine", level: "home", id: null }, h);
  assert.deepEqual(parseHash("#mine/idea/mine-abc%20d"), { tab: "mine", level: "idea", id: "mine-abc d" });
});
