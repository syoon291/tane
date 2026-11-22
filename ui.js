// Small shared UI helpers: escaping, dates, and screen reader announcements.

export const $ = (sel, root = document) => root.querySelector(sel);

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// "21 Nov 2026, 14:02" in the phone's locale, or "" for a missing or bad time.
export function when(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// "21 Nov 2026" in the phone's locale, or "" for a missing or bad time.
export function day(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Save `text` as a file on the device (a download; the iOS share sheet on a phone).
export function downloadFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Tell screen readers what just changed, through the one polite live region
// in index.html (#announcer). Emptying it first makes a repeated message be read again.
let announceTimer = null;
export function announce(text) {
  const el = document.getElementById("announcer");
  if (!el) return;
  clearTimeout(announceTimer);
  el.textContent = "";
  announceTimer = setTimeout(() => { el.textContent = text; }, 150);
}

export const closeBtn = `<button type="button" class="icon-btn" data-act="close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
