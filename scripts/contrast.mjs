// Contrast floors for the color tokens in styles.css, checked by
// scripts/check.mjs (CI) so later UI work cannot quietly drop below them.
// Ratios are WCAG 2 contrast ratios, checked in light and dark.

export function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb color: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// The custom properties of the plain :root rule and of the one inside
// @media (prefers-color-scheme: dark). Assumes the flat layout styles.css uses.
export function tokenBlocks(css) {
  const blocks = { light: {}, dark: {} };
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, media, body] of src.matchAll(/(@media[^{]*\{\s*)?:root\s*\{([^}]*)\}/g)) {
    const dark = !!media && /prefers-color-scheme:\s*dark/.test(media);
    if (media && !dark) continue;
    for (const [, k, v] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) blocks[dark ? "dark" : "light"][k] = v.trim();
  }
  return { light: blocks.light, dark: { ...blocks.light, ...blocks.dark } };
}

const SURFACES = ["bg", "surface", "surface-2"];
const COLORED = ["accent", "supports", "contradicts", "extends", "mine"];
const FLOORS = [
  ...["ink", "muted"].map((t) => [t, SURFACES, 7]),
  ...COLORED.map((t) => [t, SURFACES, 4.5]),
  ["accent-ink", ["accent"], 4.5],
  ["ink", ["mine-soft", "demo-soft"], 7],
  ["mine", ["mine-soft"], 4.5],
  ["mine-ink", ["mine"], 4.5],
  ["muted", ["mine-soft"], 4.5],
  ["line", ["bg", "surface"], 1.25],
  ["surface", ["bg"], 1.03],
];

// Returns a list of failures, empty when both themes meet their floors.
export function contrastFailures(css) {
  const out = [];
  for (const [theme, t] of Object.entries(tokenBlocks(css))) {
    for (const [fg, bgs, min] of FLOORS) {
      for (const bg of bgs) {
        if (!t[fg] || !t[bg]) { out.push(`${theme}: --${t[fg] ? bg : fg} is not defined`); continue; }
        let r;
        try { r = ratio(t[fg], t[bg]); } catch (e) { out.push(`${theme}: --${fg} on --${bg}: ${e.message}`); continue; }
        if (r < min) out.push(`${theme}: --${fg} ${t[fg]} on --${bg} ${t[bg]} is ${r.toFixed(2)}:1, needs ${min}:1`);
      }
    }
  }
  return out;
}
