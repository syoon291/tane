// Hash routes. Each screen has its own URL hash, so the browser's back
// button (and the iOS back swipe) moves up a level through history on its own.
//   #explore                 the areas
//   #explore/area/<id>       an area's themes
//   #explore/theme/<id>      a theme's ideas
//   #explore/idea/<id>       an idea
// Pure functions, unit-tested under `node --test`.

// The tabs this version shows. Today and Mine join in later phases: add the
// name here and a renderer in app.js. An unknown or not-yet-built tab opens Explore.
export const TABS = ["explore"];
export const LEVELS = ["area", "theme", "idea"];
const HOME = { tab: "explore", level: "areas", id: null };

export function parseHash(hash = "") {
  const parts = String(hash).replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!parts.length || !TABS.includes(parts[0])) return { ...HOME };
  const [tab, level, ...rest] = parts;
  if (!LEVELS.includes(level) || !rest.length) return { tab, level: "areas", id: null };
  let id;
  try { id = decodeURIComponent(rest.join("/")); } catch { return { tab, level: "areas", id: null }; }
  return { tab, level, id };
}

export function hrefFor(level = "areas", id = null) {
  if (level === "areas" || !LEVELS.includes(level) || id == null) return "#explore";
  return `#explore/${level}/${encodeURIComponent(id)}`;
}
