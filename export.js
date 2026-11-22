// The export for analysis (Mine tab): every note and own idea the owner wrote,
// with the ids and text of what each one links to, as JSON and as Markdown.
// A later computer-side review reads it to see what the owner came up with
// over time; the app itself never analyzes anything. Pure functions.
//
// What the owner wrote and what the videos say stay apart here too: the
// owner's words are `text`; everything from the library sits under `links`
// as `source` (and is quoted in the Markdown). A reply to Claude's take
// carries that take under `replyTo`, Claude's words kept apart from the owner's.
import { resolveLink, sortNewest, KIND_LABEL, replyLink } from "./notes.js";

export const EXPORT_ID = "tane-export";
export const EXPORT_VERSION = 1;

function linksOut(rec, ix, mine) {
  return (rec.links || []).map((l) => {
    const r = resolveLink(l, ix, mine);
    return { to: l.to, type: l.type, kind: l.kind, source: r.source, claude: r.claude, text: r.missing ? null : r.label, missing: r.missing };
  });
}

// The take a reply answers, with Claude's words, or null (not a reply).
// missing: the take is no longer in the library (or no library is loaded).
function replyOut(rec, ix) {
  const l = replyLink(rec);
  if (!l) return null;
  const t = !ix ? null : l.type === "perspective" ? ix.perspective(l.to) : ix.discussion(l.to);
  if (!t) return { type: l.type, id: l.to, missing: true };
  const on = l.type === "perspective" ? { type: t.type, id: t.target, text: resolveLink({ type: t.type, to: t.target }, ix).label } : null;
  return {
    type: l.type, id: l.to, missing: false, on,
    title: l.type === "discussion" ? t.title : null,
    sides: l.type === "discussion" ? t.sides.map((s) => ({ id: s, text: ix.idea(s)?.claim ?? null })) : null,
    verdict: t.verdict || null, take: t.take, better: t.better || null, question: t.question || null,
  };
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
    myIdeas: sortNewest(myIdeas).map((m) => ({ id: m.id, text: m.text, createdAt: m.createdAt, editedAt: m.editedAt ?? null, fromNote: m.fromNote ?? null, links: linksOut(m, ix, mine), replyTo: replyOut(m, ix) })),
    notes: sortNewest(stores?.notes ?? []).map((n) => ({
      id: n.id, text: n.text, createdAt: n.createdAt, editedAt: n.editedAt ?? null,
      context: n.context ?? null, prompt: n.promptId ? { id: n.promptId, text: promptText(n.promptId) } : null,
      ideaId: n.ideaId ?? null, links: linksOut(n, ix, mine), replyTo: replyOut(n, ix),
    })),
  };
}

export const exportFileName = (ext, now = new Date()) => `tane-mine-${now.toISOString().slice(0, 10)}.${ext}`;

const md = (s) => String(s ?? "").replace(/\r?\n/g, "\n> ");
const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const linkLine = (l) => `- ${KIND_LABEL[l.kind] || l.kind} ${l.claude ? "(Claude's)" : l.source ? "(from the videos)" : "(yours)"} ${l.type} \`${l.to}\`${l.text ? `: ${l.source ? `"${oneLine(l.text)}"` : oneLine(l.text)}` : " (no longer there)"}`;

// The same export as Markdown: the owner's words as quotes under "You ·
// <time>", the linked items under each.
export function toMarkdown(exp) {
  const out = [`# tane: what I wrote`, "", `Exported ${exp.exportedAt}. ${exp.myIdeas.length} own ideas, ${exp.notes.length} notes.`, ""];
  const entry = (r, title) => {
    out.push(`### ${title}`, "", `You · ${r.createdAt}${r.editedAt && r.editedAt !== r.createdAt ? ` (edited ${r.editedAt})` : ""} · \`${r.id}\``, "", `> ${md(r.text)}`, "");
    if (r.prompt?.text) out.push(`Prompt (from the videos): "${r.prompt.text}"`, "");
    const t = r.replyTo;
    if (t?.missing) out.push(`Replying to Claude's ${t.type === "discussion" ? "discussion" : "take"} \`${t.id}\` (no longer in the library)`, "");
    else if (t) {
      out.push(t.type === "discussion" ? `Replying to Claude's discussion "${oneLine(t.title)}" \`${t.id}\`` : `Replying to Claude's take on ${t.on.type} "${oneLine(t.on.text)}" \`${t.id}\``, "");
      if (t.sides) out.push(...t.sides.map((s) => `- Side (from the videos): "${oneLine(s.text)}" \`${s.id}\``), "");
      out.push(`Claude${t.verdict ? ` (${t.verdict})` : ""}: "${oneLine(t.take)}"`);
      if (t.better) out.push(`Claude's better version: "${oneLine(t.better)}"`);
      if (t.question) out.push(`Claude asked: "${oneLine(t.question)}"`);
      out.push("");
    }
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
