// Draws the app icon (a seed, 種, with one leaf) as icons/icon.svg and the
// PNG sizes the manifest and iOS need, with no dependencies: the shapes are
// rasterized here with 4x4 supersampling and written as PNG through zlib.
// Run after changing the mark: node scripts/icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BG = [0x3b, 0x66, 0x33], FG = [0xf5, 0xef, 0xdf];
// Geometry on a 512 canvas (keep in step with the SVG below and the header mark in index.html).
const SEED = { cx: 236, cy: 320, rx: 88, ry: 118, deg: 28 };
const LEAF = { p1: [296, 190], p2: [400, 104], r: 86 };
const STEM = { a: [291, 226], b: [297, 188], w: 18 };

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#${hex(BG)}"/><g fill="#${hex(FG)}"><ellipse cx="${SEED.cx}" cy="${SEED.cy}" rx="${SEED.rx}" ry="${SEED.ry}" transform="rotate(${SEED.deg} ${SEED.cx} ${SEED.cy})"/><path d="M${LEAF.p1} A${LEAF.r} ${LEAF.r} 0 0 1 ${LEAF.p2} A${LEAF.r} ${LEAF.r} 0 0 1 ${LEAF.p1} Z"/></g><path d="M${STEM.a} L${STEM.b}" stroke="#${hex(FG)}" stroke-width="${STEM.w}" stroke-linecap="round"/></svg>\n`;
function hex(c) { return c.map((v) => v.toString(16).padStart(2, "0")).join(""); }

// The two circles whose overlap is the leaf (the arcs of the SVG path).
const [x1, y1] = LEAF.p1, [x2, y2] = LEAF.p2;
const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, half = Math.hypot(x2 - x1, y2 - y1) / 2;
const d = Math.sqrt(LEAF.r ** 2 - half ** 2), nx = (y2 - y1) / (2 * half), ny = -(x2 - x1) / (2 * half);
const circles = [[mx + d * nx, my + d * ny], [mx - d * nx, my - d * ny]];
const th = (SEED.deg * Math.PI) / 180;

function inside(x, y) {
  const dx = x - SEED.cx, dy = y - SEED.cy;
  const u = dx * Math.cos(th) + dy * Math.sin(th), v = -dx * Math.sin(th) + dy * Math.cos(th);
  if ((u / SEED.rx) ** 2 + (v / SEED.ry) ** 2 <= 1) return true;
  if (circles.every(([cx, cy]) => (x - cx) ** 2 + (y - cy) ** 2 <= LEAF.r ** 2)) return true;
  const [ax, ay] = STEM.a, [bx, by] = STEM.b;
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) <= STEM.w / 2;
}

// Full-bleed square PNGs: iOS and maskable icons round the corners themselves.
function png(size) {
  const S = 4, scale = 512 / size, rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let px = 0; px < size; px++) {
      let hit = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) if (inside((px + (sx + 0.5) / S) * scale, (py + (sy + 0.5) / S) * scale)) hit++;
      const a = hit / (S * S);
      for (let c = 0; c < 3; c++) row[1 + px * 3 + c] = Math.round(BG[c] + (FG[c] - BG[c]) * a);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

writeFileSync("icons/icon.svg", svg);
for (const size of [180, 192, 512]) writeFileSync(`icons/icon-${size}.png`, png(size));
console.log("wrote icons/icon.svg and icons/icon-{180,192,512}.png");
