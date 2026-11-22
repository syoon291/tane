// The owner's own content (phase 2): notes and own ideas. Pure functions (no
// DOM, no IndexedDB), unit-tested under `node --test`.
//
// A note never merges into a source item: it only points at one. Its links
// carry the id and the type of what they point at, never a copy of its text,
// so the owner's store holds only what the owner wrote.
//   notes   { id, text, createdAt, editedAt, links: [Link], context, promptId?, ideaId? }
//   myIdeas { id, text, fromNote, createdAt, editedAt, links: [Link] }
//   Link    { to, type: "area" | "theme" | "idea" | "video" | "quote" | "myIdea", kind }
//   context { screen: "explore" | "mine", type?, id? }: where the note was written.
// ideaId on a note: the own idea it was made into. fromNote on an own idea:
// the note it came from (kept when that note is deleted).
import { hrefFor } from "./router.js";

export const KINDS = ["about", "agrees", "disagrees", "builds on"];
export const KIND_LABEL = { about: "About", agrees: "Agrees with", disagrees: "Disagrees with", "builds on": "Builds on" };
export const TYPES = ["area", "theme", "idea", "video", "quote", "myIdea"];
export const TYPE_LABEL = { area: "Area", theme: "Theme", idea: "Idea", video: "Video", quote: "Quote", myIdea: "Your idea" };
const SOURCE_TYPES = new Set(["area", "theme", "idea", "video", "quote"]);
export const isSourceType = (t) => SOURCE_TYPES.has(t);

export const mineHref = (id) => (id == null ? "#mine" : `#mine/idea/${encodeURIComponent(id)}`);

export function newId(prefix, now = Date.now(), rand = Math.random) {
  const r = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().slice(0, 8) : Math.floor(rand() * 2 ** 32).toString(36);
  return `${prefix}-${now.toString(36)}-${r}`;
}

const same = (a, b) => a.type === b.type && a.to === b.to;

// A link list with each target once (the first kind wins) and only known kinds and types.
export function cleanLinks(links) {
  const out = [];
  for (const l of Array.isArray(links) ? links : []) {
    if (!l || typeof l.to !== "string" || !l.to || !TYPES.includes(l.type)) continue;
    if (out.some((o) => same(o, l))) continue;
    out.push({ to: l.to, type: l.type, kind: KINDS.includes(l.kind) ? l.kind : "about" });
  }
  return out;
}

export const addLink = (links, link) => cleanLinks([...links, { kind: "about", ...link }]);
export const removeLink = (links, link) => links.filter((l) => !same(l, link));
export const setKind = (links, link, kind) => links.map((l) => (same(l, link) ? { ...l, kind: KINDS.includes(kind) ? kind : "about" } : l));

// What the "+" button links a new note to: whatever is on screen.
// route: router.js parseHash output. Returns { context, links }.
export function contextFor(route, ix) {
  if (route.tab === "mine") {
    return route.level === "idea" && route.id ? { context: { screen: "mine", type: "myIdea", id: route.id }, links: [{ to: route.id, type: "myIdea", kind: "builds on" }] } : { context: { screen: "mine" }, links: [] };
  }
  const known = ix && route.id && (route.level === "area" ? ix.area(route.id) : route.level === "theme" ? ix.theme(route.id) : route.level === "idea" ? ix.idea(route.id) : null);
  if (!known) return { context: { screen: "explore" }, links: [] };
  return { context: { screen: "explore", type: route.level, id: route.id }, links: [{ to: route.id, type: route.level, kind: "about" }] };
}

// A link's target, for showing: { type, typeLabel, label, href, missing, source }.
// mine: { idea(id) } for own ideas. A target that is gone (a dropped video, an
// own idea deleted) still shows, marked missing, so the note keeps its meaning.
export function resolveLink(link, ix, mine) {
  const base = { type: link.type, typeLabel: TYPE_LABEL[link.type] || "Item", source: isSourceType(link.type), missing: false, href: "" };
  const gone = (label) => ({ ...base, label, missing: true });
  if (link.type === "myIdea") {
    const m = mine?.idea(link.to);
    return m ? { ...base, label: m.text, href: mineHref(m.id) } : gone("An idea of yours you deleted");
  }
  if (!ix) return gone("Not in the library on this device");
  if (link.type === "area") { const a = ix.area(link.to); return a ? { ...base, label: a.name, href: hrefFor("area", a.id) } : gone("An area no longer in the library"); }
  if (link.type === "theme") { const t = ix.theme(link.to); return t ? { ...base, label: t.name, href: hrefFor("theme", t.id) } : gone("A theme no longer in the library"); }
  if (link.type === "idea") { const i = ix.idea(link.to); return i ? { ...base, label: i.claim, href: hrefFor("idea", i.id), retired: i.status === "retired" } : gone("An idea no longer in the library"); }
  const videoHref = (vid) => { const i = ix.ideasOfVideo(vid)[0]; return i ? hrefFor("idea", i.id) : ""; };
  if (link.type === "video") {
    const v = ix.video(link.to);
    return v ? { ...base, label: v.title || (v.creator ? `A video by ${v.creator}` : "A saved video"), href: videoHref(v.id) } : gone("A video no longer in the library");
  }
  const q = ix.quote(link.to);
  return q ? { ...base, label: `“${q.text}”`, href: videoHref(q.videoId) } : gone("A quote no longer in the library");
}

// Does this note or own idea link to the item (type, id)? For an idea, a link
// to one of its videos or quotes counts too.
export function linksTo(rec, type, id, ix) {
  return (rec.links || []).some((l) => {
    if (l.type === type && l.to === id) return true;
    if (type !== "idea" || !ix) return false;
    const vids = ix.idea(id)?.videoIds ?? [];
    if (l.type === "video") return vids.includes(l.to);
    if (l.type === "quote") return vids.includes(ix.quote(l.to)?.videoId);
    return false;
  });
}

const newest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));
export const sortNewest = (list) => [...list].sort(newest);

// The owner's content about one item, newest first: { notes, ideas }.
export function mineAbout(type, id, notes, myIdeas, ix) {
  return {
    notes: sortNewest(notes.filter((n) => linksTo(n, type, id, ix))),
    ideas: sortNewest(myIdeas.filter((m) => linksTo(m, type, id, ix))),
  };
}

const fold = (s) => String(s ?? "").toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

// Search the owner's own content: every word must appear in its text or in the
// name of something it links to.
export function searchMine(query, list, ix, mine) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((r) => {
    const hay = fold([r.text, ...(r.links || []).map((l) => resolveLink(l, ix, mine).label)].join(" "));
    return words.every((w) => hay.includes(w));
  });
}

// What a link can point at, for the "Add a link" search: areas, themes,
// ideas and the owner's own ideas whose name has every word. Up to `max`.
export function linkTargets(query, ix, myIdeas = [], { max = 8, exclude = [] } = {}) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const skip = new Set(exclude.map((l) => `${l.type}|${l.to}`));
  const all = [
    ...(ix ? ix.areas.map((a) => ({ type: "area", id: a.id, label: a.name })) : []),
    ...(ix ? ix.themes().map((t) => ({ type: "theme", id: t.id, label: t.name })) : []),
    ...(ix ? ix.activeIdeas().map((i) => ({ type: "idea", id: i.id, label: i.claim })) : []),
    ...myIdeas.map((m) => ({ type: "myIdea", id: m.id, label: m.text })),
  ];
  const out = [];
  for (const t of all) {
    if (skip.has(`${t.type}|${t.id}`)) continue;
    const hay = fold(t.label);
    if (words.every((w) => hay.includes(w))) out.push({ ...t, typeLabel: TYPE_LABEL[t.type] });
    if (out.length >= max) break;
  }
  return out;
}

// A new note (not yet stamped: db.js stamps editedAt on save).
export function makeNote({ text, links = [], context = { screen: "explore" }, promptId } = {}, now = new Date()) {
  const note = { id: newId("note", now.getTime()), text: String(text ?? "").trim(), createdAt: now.toISOString(), links: cleanLinks(links), context };
  if (promptId) note.promptId = promptId;
  return note;
}

// Make a note into an own idea. The idea starts with the note's words and
// links and keeps fromNote; the note keeps ideaId. Returns { idea, note }.
export function promote(note, now = new Date()) {
  const idea = { id: newId("mine", now.getTime()), text: note.text, fromNote: note.id, createdAt: now.toISOString(), links: cleanLinks(note.links) };
  return { idea, note: { ...note, ideaId: idea.id } };
}

// "You · 21 Nov 2026": the owner's mark on everything they wrote.
export function youLabel(iso, fmt) {
  const d = fmt(iso);
  return d ? `You · ${d}` : "You";
}
