// The Explore map, drawn as hand-written SVG from map-model.js: bubbles for
// areas, then themes, then dots for ideas, lines for the links between them,
// and the owner's own ideas in the --mine style. Each bubble is a real link,
// so it works with the keyboard and a screen reader; the Map | List toggle
// above it switches to the plain list of the same level. Returns HTML strings
// only (no DOM), so it renders under `node --test`.
import { esc } from "./ui.js";
import { hrefFor } from "./router.js";
import { SHOW, MAP_WIDTH, foldersOf, mapModel, layout, wrapLines } from "./map-model.js";

const KIND_TITLE = { supports: "Supports", contradicts: "Contradicts", extends: "Builds on" };

// The view toggle and a Back link (one level up), above every map level.
export function mapBar(view, back = null) {
  const btn = (v, label) => `<button class="seg-btn" type="button" data-act="map-view" data-id="${v}" aria-pressed="${view === v}">${label}</button>`;
  return `<div class="map-bar">
    ${back ? `<a class="back-link" href="${esc(back.href)}"><span aria-hidden="true">‹ </span>Back<span class="visually-hidden"> to ${esc(back.label)}</span></a>` : "<span></span>"}
    <div class="seg" role="group" aria-label="Show as">${btn("map", "Map")}${btn("list", "List")}</div>
  </div>`;
}

// The filters: what to show, and which saved-video folder.
export function mapFilters(ix, { show = "all", folder = "" } = {}) {
  const chips = Object.entries(SHOW).map(([k, label]) => `<button class="chip${k === "mine" ? " chip-mine" : ""}" type="button" data-act="map-show" data-id="${k}" aria-pressed="${show === k}">${esc(label)}</button>`).join("");
  const folders = foldersOf(ix);
  const pick = folders.length > 1 ? `<label class="folder-pick"><span>Folder</span>
      <select id="map-folder"><option value="">All folders</option>${folders.map((f) => `<option value="${esc(f)}"${f === folder ? " selected" : ""}>${esc(f)}</option>`).join("")}</select>
    </label>` : "";
  return `<div class="map-filters" role="group" aria-label="Filter the map">${chips}${pick}</div>`;
}

const tspans = (lines, x, y0, lh) => lines.map((l, k) => `<tspan x="${x}" y="${(y0 + k * lh).toFixed(1)}">${esc(l)}</tspan>`).join("");

function nodeSvg(node, p) {
  const { x, y } = p;
  const wroteMark = node.wrote ? `<circle class="wrote-mark" cx="${(x + node.r * 0.72).toFixed(1)}" cy="${(y - node.r * 0.72).toFixed(1)}" r="5.5"/>` : "";
  const aria = [node.kind === "mine" ? `Your idea: ${node.label}` : node.label, node.extra, node.wrote ? `you wrote ${node.wrote === 1 ? "once" : `${node.wrote} times`} about it` : "", node.kind === "ghost" ? "from another theme" : ""].filter(Boolean).join(", ");
  let shape, text;
  if (node.kind === "area" || node.kind === "theme") {
    const per = Math.max(8, Math.floor((node.r * 1.7) / 7.6));
    const lines = wrapLines(node.label, per, node.r > 44 ? 3 : 2);
    const lh = 15, total = lines.length * lh + 14;
    const y0 = y - total / 2 + 12;
    shape = `<circle class="bubble" cx="${x}" cy="${y}" r="${node.r.toFixed(1)}"/>`;
    text = `<text class="bubble-label" text-anchor="middle">${tspans(lines, x, y0, lh)}</text><text class="bubble-sub" text-anchor="middle" x="${x}" y="${(y0 + lines.length * lh + 1).toFixed(1)}">${esc(node.sub)}</text>`;
  } else if (node.kind === "mine") {
    const s = node.r;
    shape = `<rect class="mine-node" x="${(x - s).toFixed(1)}" y="${(y - s).toFixed(1)}" width="${2 * s}" height="${2 * s}" rx="5" transform="rotate(45 ${x} ${y})"/>`;
    text = `<text class="dot-label mine-label" text-anchor="middle">${tspans(wrapLines(node.label, 16, 2), x, y + s + 15, 13)}</text>`;
  } else {
    shape = `<circle class="${node.kind === "ghost" ? "ghost" : "dot"}" cx="${x}" cy="${y}" r="${node.r.toFixed(1)}"/>`;
    text = `<text class="dot-label${node.kind === "ghost" ? " ghost-label" : ""}" text-anchor="middle">${tspans(wrapLines(node.label, node.kind === "ghost" ? 14 : 16, 2), x, y + node.r + 14, 13)}</text>`;
  }
  const zoom = node.kind === "area" || node.kind === "theme" ? " data-zoom" : "";
  return `<a class="node node-${node.kind}" href="${esc(node.href)}"${zoom} aria-label="${esc(aria)}"><circle class="hit" cx="${x}" cy="${y}" r="${Math.max(node.r, 22).toFixed(1)}"/>${shape}${wroteMark}${text}</a>`;
}

function edgesSvg(edges, pos) {
  // Lines between the same pair are spread side by side, one per kind.
  const per = new Map();
  for (const e of edges) { const k = `${e.from}|${e.to}`; per.set(k, (per.get(k) ?? 0) + 1); }
  const seen = new Map();
  return edges.map((e) => {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) return "";
    const k = `${e.from}|${e.to}`, total = per.get(k), nth = seen.get(k) ?? 0;
    seen.set(k, nth + 1);
    const off = (nth - (total - 1) / 2) * 5;
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ox = (-(b.y - a.y) / d) * off, oy = ((b.x - a.x) / d) * off;
    const w = e.kind === "mine" ? 1.8 : 1.6 + Math.min(e.count, 4) * 0.7;
    return `<line class="edge edge-${e.kind}" x1="${(a.x + ox).toFixed(1)}" y1="${(a.y + oy).toFixed(1)}" x2="${(b.x + ox).toFixed(1)}" y2="${(b.y + oy).toFixed(1)}" stroke-width="${w.toFixed(1)}"/>`;
  }).join("");
}

function legend(model) {
  const kinds = new Set(model.edges.map((e) => e.kind));
  const items = Object.entries(KIND_TITLE).filter(([k]) => kinds.has(k)).map(([k, t]) => `<li><span class="key key-${k}" aria-hidden="true"></span>${t}</li>`);
  if (model.nodes.some((x) => x.kind === "mine")) items.push(`<li><span class="key key-mine" aria-hidden="true"></span>Your idea</li>`);
  if (model.nodes.some((x) => x.wrote)) items.push(`<li><span class="key key-wrote" aria-hidden="true"></span>You wrote about it</li>`);
  if (model.nodes.some((x) => x.kind === "ghost")) items.push(`<li><span class="key key-ghost" aria-hidden="true"></span>From another theme</li>`);
  return items.length ? `<ul class="map-legend" aria-label="Key">${items.join("")}</ul>` : "";
}

// The map for one level (with its filters, the SVG and the key).
// level: "areas" | "area" | "theme"; name: what the map is of, for screen readers.
export function mapSection(level, id, ix, mine, filter = {}, name = "areas") {
  const model = mapModel(level, id, ix, mine, filter);
  const filters = mapFilters(ix, filter);
  const filtered = (filter.show && filter.show !== "all") || filter.folder;
  if (!model.nodes.length) {
    return `${filters}<div class="card empty map-empty"><p>${filtered ? "Nothing here matches these filters." : "Nothing to show here yet."}</p>${filtered ? `<button class="btn ghost" type="button" data-act="map-reset">Show everything</button>` : ""}</div>`;
  }
  const L = layout(model.nodes, model.edges);
  const tap = level === "theme" ? "Tap an idea to open it." : level === "area" ? "Tap a theme to zoom in." : "Tap an area to zoom in.";
  return `${filters}
    <div class="map" data-level="${level}">
      <svg class="map-svg" viewBox="0 0 ${MAP_WIDTH} ${L.height}" role="group" aria-label="Map of ${esc(name)}. ${tap}">
        <g class="edges" aria-hidden="true">${edgesSvg(model.edges, L.pos)}</g>
        <g class="nodes">${model.nodes.map((node) => nodeSvg(node, L.pos.get(node.id))).join("")}</g>
      </svg>
    </div>
    ${legend(model)}`;
}

// Back one level from an Explore map level, or null on the areas.
export function backFor(level, id, ix) {
  if (level === "area") return { href: hrefFor(), label: "Areas" };
  if (level === "theme") { const t = ix.theme(id); const a = t && ix.area(t.areaId); return a ? { href: hrefFor("area", a.id), label: a.name } : { href: hrefFor(), label: "Areas" }; }
  return null;
}
