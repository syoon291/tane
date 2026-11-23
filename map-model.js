// The Explore map's model: which bubbles and lines one level of the map shows
// (areas, an area's themes, or a theme's ideas), after the filters, and a
// small deterministic force layout that places them. Pure: no DOM, so it runs
// under `node --test`. map-view.js draws the result as SVG.
//
// Node kinds:
//   area, theme   a bubble sized by how many (filtered) ideas it holds; tap zooms in
//   idea          a dot sized by how many videos are behind it; tap opens the idea page
//   ghost         an idea from another theme that links to one here (drawn faded)
//   mine          one of the owner's own ideas, in the --mine style, joined to
//                 the source items it links to
// Edge kinds: supports | contradicts | extends (library links, summed per pair
// at the area and theme levels) and mine (an own idea to what it grew from).
import { hrefFor } from "./router.js";
import { mineHref } from "./notes.js";

// The map's "Show" filter. Labels are the owner's words.
export const SHOW = { all: "All", written: "I've written about", untouched: "Not yet touched", mine: "My ideas only" };
export const MAP_WIDTH = 360;

// The saved-video folders the themes came from, sorted, without blanks.
export function foldersOf(ix) {
  return [...new Set(ix.themes().map((t) => t.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// Text cut into up to maxLines lines of about max characters, at words; the
// last line ends in "…" when text was left out.
export function wrapLines(text, max = 14, maxLines = 3) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if (`${cur} ${w}`.length <= max) cur += ` ${w}`;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines.map((l) => (l.length > max + 2 ? `${l.slice(0, max)}…` : l));
  const out = lines.slice(0, maxLines);
  const last = out[maxLines - 1];
  out[maxLines - 1] = `${last.length > max - 1 ? last.slice(0, max - 1) : last}…`;
  return out;
}

const n = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const sizeFor = (count, max, lo, hi) => lo + (hi - lo) * Math.sqrt(max ? Math.min(count, max) / max : 0);

// The source items one of the owner's records links to, as ideas, themes and
// areas (a video or quote counts as the ideas it sits behind).
function targetsOf(rec, ix) {
  const out = { areas: new Set(), themes: new Set(), ideas: new Set() };
  const addIdea = (i) => { if (i && i.status === "active") out.ideas.add(i.id); };
  for (const l of rec.links || []) {
    if (l.type === "area" && ix.area(l.to)) out.areas.add(l.to);
    else if (l.type === "theme" && ix.theme(l.to)) out.themes.add(l.to);
    else if (l.type === "idea") addIdea(ix.idea(l.to));
    else if (l.type === "video") ix.ideasOfVideo(l.to).forEach(addIdea);
    else if (l.type === "quote") { const q = ix.quote(l.to); if (q) ix.ideasOfVideo(q.videoId).forEach(addIdea); }
  }
  return out;
}

// One level of the map. level: "areas" | "area" | "theme"; id: the area or
// theme. mine: the owner's content (mine-store.js api) or null.
// Returns { nodes, edges } (no positions; see layout()).
export function mapModel(level, id, ix, mine, { show = "all", folder = "" } = {}) {
  if (!SHOW[show]) show = "all";
  const about = (type, k) => (mine ? mine.about(type, k) : { notes: [], ideas: [] });
  const wroteCache = new Map();
  const wrote = (type, k) => {
    const key = `${type}|${k}`;
    if (!wroteCache.has(key)) { const r = about(type, k); wroteCache.set(key, { all: r.notes.length + r.ideas.length, ideas: r.ideas.length }); }
    return wroteCache.get(key);
  };
  const inFolder = (themeId) => !folder || ix.folderOf(themeId) === folder;
  const passIdea = (i) => {
    if (!inFolder(i.themeId)) return false;
    if (show === "written") return wrote("idea", i.id).all > 0;
    if (show === "untouched") return wrote("idea", i.id).all === 0;
    if (show === "mine") return wrote("idea", i.id).ideas > 0;
    return true;
  };
  // A theme or area the owner wrote about directly still shows under "written" or "mine".
  const direct = (type, k) => (show === "written" ? wrote(type, k).all > 0 : show === "mine" ? wrote(type, k).ideas > 0 : false);
  const passing = (themeId) => ix.ideasOf(themeId).filter(passIdea);

  const nodes = [], edges = [];
  const byId = new Map();
  const add = (node) => { nodes.push(node); byId.set(node.id, node); return node; };
  // Which node at this level stands for an idea (or null when it is off this level).
  let nodeOfIdea;

  if (level === "areas") {
    const rows = ix.areas.map((a) => {
      const themes = ix.themesOf(a.id).filter((t) => inFolder(t.id));
      const count = themes.reduce((s, t) => s + passing(t.id).length, 0);
      const show0 = (show === "all" && !folder) || (themes.length && (direct("area", a.id) || themes.some((t) => direct("theme", t.id))));
      return { a, themes, count, visible: count > 0 || show0 };
    }).filter((r) => r.visible);
    const max = Math.max(1, ...rows.map((r) => r.count));
    for (const { a, themes, count } of rows) {
      add({ id: a.id, kind: "area", label: a.name, sub: n(count, "idea"), count, r: sizeFor(count, max, 36, 66), href: hrefFor("area", a.id), wrote: wrote("area", a.id).all, extra: `${n(themes.length, "theme")}, ${n(count, "idea")}` });
    }
    nodeOfIdea = (i) => { const { area } = ix.parentsOf(i.id); return area && byId.has(area.id) ? area.id : null; };
  } else if (level === "area") {
    const themes = ix.themesOf(id).filter((t) => inFolder(t.id));
    const rows = themes.map((t) => ({ t, count: passing(t.id).length })).filter((r) => r.count > 0 || (show === "all") || direct("theme", r.t.id));
    const max = Math.max(1, ...rows.map((r) => r.count));
    for (const { t, count } of rows) {
      add({ id: t.id, kind: "theme", label: t.name, sub: n(count, "idea"), count, r: sizeFor(count, max, 32, 56), href: hrefFor("theme", t.id), wrote: wrote("theme", t.id).all, extra: `from ${n(ix.themeStats(t.id).videos, "video")}` });
    }
    nodeOfIdea = (i) => (byId.has(i.themeId) ? i.themeId : null);
  } else if (level === "theme") {
    for (const i of passing(id)) {
      const v = ix.ideaCount(i.id);
      add({ id: i.id, kind: "idea", label: i.claim, count: v, r: 9 + Math.min(v, 6) * 1.3, href: hrefFor("idea", i.id), wrote: wrote("idea", i.id).all, extra: `from ${n(v, "video")}` });
    }
    // Ideas elsewhere that link to an idea here join as faded ghosts.
    for (const i of nodes.slice()) {
      for (const l of ix.linksOf(i.id)) {
        const o = ix.idea(l.other);
        if (!o || o.status !== "active" || o.themeId === id || byId.has(o.id) || !passIdea(o)) continue;
        const { theme } = ix.parentsOf(o.id);
        add({ id: o.id, kind: "ghost", label: o.claim, count: 0, r: 7, href: hrefFor("idea", o.id), wrote: wrote("idea", o.id).all, extra: theme ? `in ${theme.name}` : "" });
      }
    }
    nodeOfIdea = (i) => (byId.has(i.id) ? i.id : null);
  } else {
    return { nodes, edges };
  }

  // Library links between what this level shows, one line per pair and kind.
  const sum = new Map();
  for (const i of ix.activeIdeas()) {
    if (!passIdea(i)) continue;
    for (const l of ix.linksOf(i.id)) {
      if (l.dir !== "out") continue;
      const o = ix.idea(l.other);
      if (!o || o.status !== "active" || !passIdea(o)) continue;
      const a = nodeOfIdea(i), b = nodeOfIdea(o);
      if (!a || !b || a === b) continue;
      // At the theme level a line must touch one of the theme's own ideas.
      if (level === "theme" && byId.get(a).kind === "ghost" && byId.get(b).kind === "ghost") continue;
      const [x, y] = a < b ? [a, b] : [b, a];
      const key = `${x}|${y}|${l.kind}`;
      const e = sum.get(key) ?? { from: x, to: y, kind: l.kind, count: 0 };
      e.count++;
      sum.set(key, e);
    }
  }
  edges.push(...sum.values());

  // The owner's own ideas, joined to the items here they link to. One that
  // links to the area or theme on screen (or, on the areas level, to nothing)
  // still shows, on its own.
  if (mine && show !== "untouched") {
    for (const m of mine.ideas || []) {
      const tg = targetsOf(m, ix);
      const to = new Set();
      for (const k of tg.ideas) { const node = nodeOfIdea(ix.idea(k)); if (node) to.add(node); }
      if (level === "areas") {
        for (const k of tg.themes) { const a = ix.theme(k).areaId; if (byId.has(a)) to.add(a); }
        for (const k of tg.areas) if (byId.has(k)) to.add(k);
      } else if (level === "area") {
        for (const k of tg.themes) if (byId.has(k)) to.add(k);
      }
      const here = level === "areas" ? !(m.links || []).some((l) => l.type !== "myIdea") && !folder : level === "area" ? tg.areas.has(id) : tg.themes.has(id);
      if (!to.size && !here) continue;
      add({ id: m.id, kind: "mine", label: m.text, count: 0, r: 11, href: mineHref(m.id), wrote: 0, extra: "your idea" });
      for (const k of to) edges.push({ from: m.id, to: k, kind: "mine", count: 1 });
    }
  }
  return { nodes, edges };
}

// The room a node takes in the layout: its circle, or the label under a dot.
export const roomOf = (node) => (node.kind === "area" || node.kind === "theme" ? node.r : node.kind === "ghost" ? 38 : 44);

// A small force layout: nodes start on a golden-angle spiral (no randomness,
// so the same data always draws the same map), lines pull their ends together,
// a weak pull keeps the map round, and overlaps are pushed apart. x stays in
// [0, width]; y grows downward from 0. Returns { pos: Map(id -> {x, y}), width, height }.
export function layout(nodes, edges, { width = MAP_WIDTH, iterations = 240, pad = 10 } = {}) {
  const pts = nodes.map((node, i) => {
    const ang = i * 2.399963, d = 34 * Math.sqrt(i + 0.3);
    return { id: node.id, x: width / 2 + d * Math.cos(ang), y: d * Math.sin(ang), vx: 0, vy: 0, room: roomOf(node) };
  });
  const at = new Map(pts.map((p, i) => [p.id, i]));
  const links = edges.map((e) => [at.get(e.from), at.get(e.to)]).filter(([a, b]) => a != null && b != null);
  const clampX = (p) => { p.x = Math.min(width - p.room - 2, Math.max(p.room + 2, p.x)); if (2 * p.room + 4 > width) p.x = width / 2; };
  const separate = () => {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const min = a.room + b.room + pad;
        if (d >= min) continue;
        if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push;
        b.x += (dx / d) * push; b.y += (dy / d) * push;
      }
    }
  };
  for (let it = 0; it < iterations; it++) {
    const alpha = 1 - it / iterations;
    for (const [ia, ib] of links) {
      const a = pts[ia], b = pts[ib];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const f = ((d - (a.room + b.room + 24)) / d) * 0.04 * alpha;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const p of pts) {
      p.vx += (width / 2 - p.x) * 0.004 * alpha;
      p.vy += (0 - p.y) * 0.01 * alpha;
      p.vx *= 0.6; p.vy *= 0.6;
      p.x += p.vx; p.y += p.vy;
    }
    separate();
    for (const p of pts) clampX(p);
  }
  for (let k = 0; k < 20; k++) { separate(); for (const p of pts) clampX(p); }
  const minY = pts.length ? Math.min(...pts.map((p) => p.y - p.room)) : 0;
  const shift = pad - minY;
  for (const p of pts) p.y += shift;
  const bottom = pts.length ? Math.max(...pts.map((p) => p.y + p.room)) : 0;
  return { pos: new Map(pts.map((p) => [p.id, { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }])), width, height: Math.ceil(bottom + pad) };
}
