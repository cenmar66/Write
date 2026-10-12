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
