// The source library: ideas extracted from saved videos, written by
// furikaeri's export to library/latest.json in tane-data. The app only reads
// it. parseLibrary checks and normalizes a file; buildIndex joins its flat
// arrays by id for the Explore screens. Pure functions (no DOM, no
// IndexedDB), so they run under `node --test` as well as in the browser.
//
// Shape (schema "tane-library", v 1). Arrays are flat, joined by stable ids,
// and array order is display order. Unknown extra fields are ignored.
//   areas   [{ id, name, summary }]
//   themes  [{ id, areaId, name, summary, folder? }]
//   ideas   [{ id, themeId, claim, detail?, videoIds, prompts: [{ id, text }], status: "active" | "retired" }]
//   videos  [{ id, title, creator, url, summary, keyIdeas: [string], quotes: [{ id, text }] }]
//   links   [{ from, to, kind: "supports" | "contradicts" | "extends", why }]
//   threads [{ id, title?, question, ideaIds }]
//   core    [{ id, belief, ideaIds }]

export const SCHEMA = "tane-library";
export const VERSION = 1;
export const LINK_KINDS = ["supports", "contradicts", "extends"];

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const id = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const ids = (v) => (Array.isArray(v) ? v.map(id).filter(Boolean) : []);
// Only plain https links are ever turned into an href (never javascript: or data:).
const httpsUrl = (v) => {
  const s = str(v);
  if (!/^https:\/\//i.test(s)) return "";
  try { return new URL(s).protocol === "https:" ? s : ""; } catch { return ""; }
};

// Keeps the first item per id; an item without an id (or not an object) is skipped and counted.
function cleanList(list, make, counter) {
  const out = [], seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const item = isObj(raw) ? make(raw) : null;
    if (!item || (item.id !== undefined && (!item.id || seen.has(item.id)))) { counter.skipped++; continue; }
    if (item.id !== undefined) seen.add(item.id);
    out.push(item);
  }
  return out;
}

// Returns { ok: true, library, skipped } or { ok: false, error } with a message fit to show.
// `input` is the file's text or an already parsed value.
export function parseLibrary(input) {
  let data = input;
  if (typeof input === "string") {
    try { data = JSON.parse(input); }
    catch { return { ok: false, error: "The library file is not valid JSON." }; }
  }
  if (!isObj(data)) return { ok: false, error: "The library file is not a tane library." };
  if (data.schema !== SCHEMA) return { ok: false, error: `The library file is not a tane library (schema is ${JSON.stringify(data.schema ?? null)}, expected "${SCHEMA}").` };
  if (!Number.isInteger(data.v)) return { ok: false, error: "The library file has no valid version (v)." };
  if (data.v > VERSION) return { ok: false, error: `The library file is version ${data.v}, newer than this app reads (${VERSION}). Update the app: reload it while online.` };
  if (data.v !== VERSION) return { ok: false, error: `The library file is version ${data.v}; this app reads version ${VERSION}.` };
  for (const k of ["areas", "themes", "ideas", "videos"]) {
    if (!Array.isArray(data[k])) return { ok: false, error: `The library file has no "${k}" list.` };
  }
  for (const k of ["links", "threads", "core"]) {
    if (data[k] !== undefined && !Array.isArray(data[k])) return { ok: false, error: `The library file's "${k}" is not a list.` };
  }

  const c = { skipped: 0 };
  const library = {
    schema: SCHEMA,
    v: VERSION,
    generatedAt: str(data.generatedAt),
    areas: cleanList(data.areas, (a) => ({ id: id(a.id), name: str(a.name) || "Untitled area", summary: str(a.summary) }), c),
    themes: cleanList(data.themes, (t) => ({ id: id(t.id), areaId: id(t.areaId), name: str(t.name) || "Untitled theme", summary: str(t.summary), folder: str(t.folder) }), c),
    ideas: cleanList(data.ideas, (i) => {
      const claim = str(i.claim);
      if (!claim) return null;
      return {
        id: id(i.id), themeId: id(i.themeId), claim, detail: str(i.detail),
        videoIds: ids(i.videoIds),
        prompts: cleanList(i.prompts, (p) => (str(p.text) ? { id: id(p.id), text: str(p.text) } : null), c),
        status: i.status === "retired" ? "retired" : "active",
      };
    }, c),
    videos: cleanList(data.videos, (v) => ({
      id: id(v.id), title: str(v.title), creator: str(v.creator), url: httpsUrl(v.url), summary: str(v.summary),
      keyIdeas: Array.isArray(v.keyIdeas) ? v.keyIdeas.map(str).filter(Boolean) : [],
      quotes: cleanList(v.quotes, (q) => (str(q.text) ? { id: id(q.id), text: str(q.text) } : null), c),
    }), c),
    links: cleanList(data.links, (l) => (LINK_KINDS.includes(l.kind) && id(l.from) && id(l.to) && id(l.from) !== id(l.to)
      ? { from: id(l.from), to: id(l.to), kind: l.kind, why: str(l.why) } : null), c),
    threads: cleanList(data.threads, (t) => (str(t.question) ? { id: id(t.id), title: str(t.title), question: str(t.question), ideaIds: ids(t.ideaIds) } : null), c),
    core: cleanList(data.core, (b) => (str(b.belief) ? { id: id(b.id), belief: str(b.belief), ideaIds: ids(b.ideaIds) } : null), c),
  };
  return { ok: true, library, skipped: c.skipped };
}

const push = (map, key, value) => { const l = map.get(key); if (l) l.push(value); else map.set(key, [value]); };

// Joins a parsed library by id. Dangling references (a theme's area, an
// idea's videos, a link's ends, a thread's ideas) are dropped, never fatal.
// Retired ideas are left out of every list but still open by id.
export function buildIndex(library) {
  const area = new Map(library.areas.map((a) => [a.id, a]));
  const theme = new Map(), idea = new Map(), video = new Map(library.videos.map((v) => [v.id, v]));
  const themesByArea = new Map(), ideasByTheme = new Map();
  for (const t of library.themes) {
    if (!area.has(t.areaId)) continue;
    theme.set(t.id, t);
    push(themesByArea, t.areaId, t);
  }
  for (const i of library.ideas) {
    // An idea keeps only the videos that exist, in order, without repeats.
    const full = { ...i, videoIds: [...new Set(i.videoIds.filter((v) => video.has(v)))] };
    // A retired idea may point to a theme that is gone: it still opens by id.
    if (full.status !== "retired" && !theme.has(full.themeId)) continue;
    idea.set(full.id, full);
    if (full.status === "active") push(ideasByTheme, full.themeId, full);
  }

  const linksByIdea = new Map();
  const linkSeen = new Set();
  for (const l of library.links) {
    if (!idea.has(l.from) || !idea.has(l.to)) continue;
    const key = `${l.from}|${l.to}|${l.kind}`;
    if (linkSeen.has(key)) continue;
    linkSeen.add(key);
    push(linksByIdea, l.from, { kind: l.kind, other: l.to, dir: "out", why: l.why });
    push(linksByIdea, l.to, { kind: l.kind, other: l.from, dir: "in", why: l.why });
  }

  const keepIdeas = (list) => list.map((x) => ({ ...x, ideaIds: [...new Set(x.ideaIds.filter((i) => idea.has(i)))] })).filter((x) => x.ideaIds.length);
  const threads = keepIdeas(library.threads), core = keepIdeas(library.core);
  const threadsByIdea = new Map(), coreByIdea = new Map();
  for (const t of threads) for (const i of t.ideaIds) push(threadsByIdea, i, t);
  for (const b of core) for (const i of b.ideaIds) push(coreByIdea, i, b);

  // Counts of active ideas and distinct videos behind them.
  const themeStats = new Map(), areaStats = new Map();
  for (const t of theme.values()) {
    const list = ideasByTheme.get(t.id) ?? [];
    themeStats.set(t.id, { ideas: list.length, videos: new Set(list.flatMap((i) => i.videoIds)).size });
  }
  const areas = library.areas;
  for (const a of areas) {
    const ts = themesByArea.get(a.id) ?? [];
    const list = ts.flatMap((t) => ideasByTheme.get(t.id) ?? []);
    areaStats.set(a.id, { themes: ts.length, ideas: list.length, videos: new Set(list.flatMap((i) => i.videoIds)).size });
  }
  const active = [...idea.values()].filter((i) => i.status === "active");
  // Quotes by id (with their video), and the ideas each video sits behind, so
  // a note linked to a video or a quote can open the idea page that shows it.
  const quote = new Map(), ideasByVideo = new Map();
  for (const v of library.videos) for (const q of v.quotes) if (q.id && !quote.has(q.id)) quote.set(q.id, { ...q, videoId: v.id });
  for (const i of idea.values()) for (const v of i.videoIds) push(ideasByVideo, v, i);

  return {
    generatedAt: library.generatedAt,
    areas,
    area: (k) => area.get(k) ?? null,
    theme: (k) => theme.get(k) ?? null,
    idea: (k) => idea.get(k) ?? null,
    video: (k) => video.get(k) ?? null,
    quote: (k) => quote.get(k) ?? null,
    ideasOfVideo: (videoId) => ideasByVideo.get(videoId) ?? [],
    activeIdeas: () => active,
    themes: () => [...theme.values()],
    themesOf: (areaId) => themesByArea.get(areaId) ?? [],
    ideasOf: (themeId) => ideasByTheme.get(themeId) ?? [],
    videosOf: (ideaId) => (idea.get(ideaId)?.videoIds ?? []).map((v) => video.get(v)),
    linksOf: (ideaId) => linksByIdea.get(ideaId) ?? [],
    threadsOf: (ideaId) => threadsByIdea.get(ideaId) ?? [],
    coreOf: (ideaId) => coreByIdea.get(ideaId) ?? [],
    // The saved-video folder a theme came from (for later filters).
    folderOf: (themeId) => theme.get(themeId)?.folder || "",
    ideaCount: (ideaId) => idea.get(ideaId)?.videoIds.length ?? 0,
    themeStats: (k) => themeStats.get(k) ?? { ideas: 0, videos: 0 },
    areaStats: (k) => areaStats.get(k) ?? { themes: 0, ideas: 0, videos: 0 },
    // The theme and area an idea sits under, or nulls when its theme is gone (retired ideas).
    parentsOf: (ideaId) => {
      const t = theme.get(idea.get(ideaId)?.themeId) ?? null;
      return { theme: t, area: t ? area.get(t.areaId) ?? null : null };
    },
    totals: { areas: areas.length, themes: theme.size, ideas: active.length, videos: new Set(active.flatMap((i) => i.videoIds)).size, threads: threads.length, core: core.length },
  };
}

// "1 idea", "3 ideas".
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
