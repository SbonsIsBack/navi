// Genera le icone PWA (PNG) disegnando un tachimetro stilizzato pixel-per-pixel.
// Nessuna dipendenza esterna: encoder PNG minimale basato su zlib di Node.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// ---------- Encoder PNG ----------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // Ogni scanline è prefissata dal filter byte 0 (nessun filtro).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Disegno ----------

const BG = [11, 18, 32]; // #0b1220
const RING = [46, 230, 166]; // #2ee6a6
const NEEDLE = [232, 240, 255]; // #e8f0ff

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// Copertura del pixel per un anello (gauge aperto in basso: 45°..135° esclusi).
function ringCoverage(dx, dy, rOuter, thickness) {
  const d = Math.hypot(dx, dy);
  const rInner = rOuter - thickness;
  const radial =
    smoothstep(rInner - 1, rInner + 1, d) * (1 - smoothstep(rOuter - 1, rOuter + 1, d));
  if (radial <= 0) return 0;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI; // 0=destra, 90=basso (coordinate schermo)
  if (deg < 0) deg += 360;
  const inGap = deg > 50 && deg < 130;
  return inGap ? 0 : radial;
}

// Copertura del pixel per la lancetta (segmento centro→angolo -45°).
function needleCoverage(dx, dy, length, halfWidth) {
  const angle = (-45 * Math.PI) / 180;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const t = Math.min(length, Math.max(0, dx * ux + dy * uy));
  const dist = Math.hypot(dx - t * ux, dy - t * uy);
  return 1 - smoothstep(halfWidth - 1, halfWidth + 1, dist);
}

function drawIcon(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = size / 2;
  // Nella zona sicura maskable (cerchio centrale 80%) il disegno va ridotto.
  const scale = maskable ? 0.7 : 0.92;
  const rOuter = 0.42 * size * scale;
  const thickness = 0.09 * size * scale;
  const needleLen = 0.3 * size * scale;
  const hubR = 0.07 * size * scale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      let [r, g, b] = BG;
      const ring = ringCoverage(dx, dy, rOuter, thickness);
      const hub = 1 - smoothstep(hubR - 1, hubR + 1, Math.hypot(dx, dy));
      const needle = needleCoverage(dx, dy, needleLen, 0.03 * size * scale);
      const green = Math.max(ring, hub);
      r += (RING[0] - r) * green;
      g += (RING[1] - g) * green;
      b += (RING[2] - b) * green;
      const white = needle * (1 - hub);
      r += (NEEDLE[0] - r) * white;
      g += (NEEDLE[1] - g) * white;
      b += (NEEDLE[2] - b) * white;
      const i = (y * size + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(rgba, size);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'icon-192.png'), drawIcon(192, { maskable: false }));
writeFileSync(join(OUT_DIR, 'icon-512.png'), drawIcon(512, { maskable: false }));
writeFileSync(join(OUT_DIR, 'icon-maskable-512.png'), drawIcon(512, { maskable: true }));
console.log(`Icone generate in ${OUT_DIR}`);
