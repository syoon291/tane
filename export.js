// The export for analysis (Mine tab): every note and own idea the owner wrote,
// with the ids and text of what each one links to, as JSON and as Markdown.
// A later computer-side review reads it to see what the owner came up with
// over time; the app itself never analyzes anything. Pure functions.
//
// What the owner wrote and what the videos say stay apart here too: the
// owner's words are `text`; everything from the library sits under `links`
// as `source` (and is quoted in the Markdown).
import { resolveLink, sortNewest, KIND_LABEL } from "./notes.js";

export const EXPORT_ID = "tane-export";
export const EXPORT_VERSION = 1;

function linksOut(rec, ix, mine) {
  return (rec.links || []).map((l) => {
    const r = resolveLink(l, ix, mine);
    return { to: l.to, type: l.type, kind: l.kind, source: r.source, text: r.missing ? null : r.label, missing: r.missing };
  });
}

// stores: { notes, myIdeas } from the owner's store. ix: the library index or null.
export function buildExport(stores, ix, now = new Date()) {
  const myIdeas = stores?.myIdeas ?? [];
  const byId = new Map(myIdeas.map((m) => [m.id, m]));
  const mine = { idea: (id) => byId.get(id) ?? null };
  const promptText = (id) => {
    if (!ix || !id) return null;
    for (const i of ix.activeIdeas()) { const p = i.prompts.find((x) => x.id === id); if (p) return p.text; }
    return null;
  };
  return {
    app: EXPORT_ID,
    v: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    library: ix ? { generatedAt: ix.generatedAt || null } : null,
    myIdeas: sortNewest(myIdeas).map((m) => ({ id: m.id, text: m.text, createdAt: m.createdAt, editedAt: m.editedAt ?? null, fromNote: m.fromNote ?? null, links: linksOut(m, ix, mine) })),
    notes: sortNewest(stores?.notes ?? []).map((n) => ({
      id: n.id, text: n.text, createdAt: n.createdAt, editedAt: n.editedAt ?? null,
      context: n.context ?? null, prompt: n.promptId ? { id: n.promptId, text: promptText(n.promptId) } : null,
      ideaId: n.ideaId ?? null, links: linksOut(n, ix, mine),
    })),
  };
}

export const exportFileName = (ext, now = new Date()) => `tane-mine-${now.toISOString().slice(0, 10)}.${ext}`;

const md = (s) => String(s ?? "").replace(/\r?\n/g, "\n> ");
const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const linkLine = (l) => `- ${KIND_LABEL[l.kind] || l.kind} ${l.source ? "(from the videos)" : "(yours)"} ${l.type} \`${l.to}\`${l.text ? `: ${l.source ? `"${oneLine(l.text)}"` : oneLine(l.text)}` : " (no longer there)"}`;

// The same export as Markdown: the owner's words as quotes under "You ·
// <time>", the linked items under each.
export function toMarkdown(exp) {
  const out = [`# tane: what I wrote`, "", `Exported ${exp.exportedAt}. ${exp.myIdeas.length} own ideas, ${exp.notes.length} notes.`, ""];
  const entry = (r, title) => {
    out.push(`### ${title}`, "", `You · ${r.createdAt}${r.editedAt && r.editedAt !== r.createdAt ? ` (edited ${r.editedAt})` : ""} · \`${r.id}\``, "", `> ${md(r.text)}`, "");
    if (r.prompt?.text) out.push(`Prompt (from the videos): "${r.prompt.text}"`, "");
    if (r.fromNote) out.push(`From note \`${r.fromNote}\``, "");
    if (r.ideaId) out.push(`Made into own idea \`${r.ideaId}\``, "");
    if (r.links.length) out.push("Links:", ...r.links.map(linkLine), "");
    else out.push("Links: none (a free-standing thought)", "");
  };
  out.push("## My own ideas", "");
  if (!exp.myIdeas.length) out.push("None yet.", "");
  exp.myIdeas.forEach((m, i) => entry(m, `Idea ${i + 1}`));
  out.push("## Notes", "");
  if (!exp.notes.length) out.push("None yet.", "");
  exp.notes.forEach((n, i) => entry(n, `Note ${i + 1}`));
  return out.join("\n");
}
