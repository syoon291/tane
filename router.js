// Hash routes. Each screen has its own URL hash, so the browser's back
// button (and the iOS back swipe) moves up a level through history on its own.
//   #explore                 the areas
//   #explore/area/<id>       an area's themes
//   #explore/theme/<id>      a theme's ideas
//   #explore/idea/<id>       an idea
//   #explore/discussions     Claude's discussions (tensions between ideas)
//   #explore/discussion/<id> one discussion
//   #mine                    everything the owner wrote
//   #mine/idea/<id>          one of the owner's own ideas
// Pure functions, unit-tested under `node --test`.

// The tabs this version shows. Today joins in a later phase: add the name
// here and a renderer in app.js. An unknown or not-yet-built tab opens Explore.
export const TABS = ["explore", "mine"];
export const LEVELS = ["area", "theme", "idea", "discussion"];
const TAB_LEVELS = { explore: LEVELS, mine: ["idea"] };
// Levels that are a list with no id.
const TAB_LISTS = { explore: ["discussions"], mine: [] };
const TAB_HOME = { explore: "areas", mine: "home" };
const HOME = { tab: "explore", level: "areas", id: null };

export function parseHash(hash = "") {
  const parts = String(hash).replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!parts.length || !TABS.includes(parts[0])) return { ...HOME };
  const [tab, level, ...rest] = parts;
  const home = { tab, level: TAB_HOME[tab], id: null };
  if (TAB_LISTS[tab].includes(level)) return { tab, level, id: null };
  if (!TAB_LEVELS[tab].includes(level) || !rest.length) return home;
  let id;
  try { id = decodeURIComponent(rest.join("/")); } catch { return home; }
  return { tab, level, id };
}

export function hrefFor(level = "areas", id = null) {
  if (level === "discussions") return "#explore/discussions";
  if (level === "areas" || !LEVELS.includes(level) || id == null) return "#explore";
  return `#explore/${level}/${encodeURIComponent(id)}`;
}
