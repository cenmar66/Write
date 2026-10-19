// Generates the PWA icons from one SVG. Run: node scripts/make-icons.mjs
import sharp from "sharp";

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#7c6cff"/><stop offset=".6" stop-color="#f472b6"/><stop offset="1" stop-color="#fbbf77"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 64})">
    <path d="M17 22l6.5 21L32 26l8.5 17L47 22" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

const out = [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["apple-touch-icon.png", 180, 0],
  ["icon-maskable-512.png", 512, 80],
];
for (const [name, size, pad] of out) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/icons/${name}`);
}
await sharp(Buffer.from(svg(0))).resize(48, 48).png().toFile("src/app/icon.png");
console.log("Icons written.");

// Browser-tab favicon: the rounded W from the logo, on a transparent background.
const rounded = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#7c6cff"/><stop offset=".6" stop-color="#f472b6"/><stop offset="1" stop-color="#fbbf77"/>
  </linearGradient></defs>
  <rect width="64" height="64" rx="18" fill="url(#g)"/>
  <path d="M17 22l6.5 21L32 26l8.5 17L47 22" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const fs = await import("node:fs/promises");
await fs.writeFile("src/app/icon.svg", rounded.trim() + "\n");
await fs.rm("src/app/icon.png", { force: true });

// An .ico file is a small header plus PNG images (16, 32 and 48 px).
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => sharp(Buffer.from(rounded), { density: 300 }).resize(s, s).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e);
  header.writeUInt8(s, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
await fs.writeFile("src/app/favicon.ico", Buffer.concat([header, ...pngs]));
console.log("Favicon written.");
