// Generates The Daily Canvas app icons. Run: node scripts/make-canvas-icons.mjs
import sharp from "sharp";

// A cream page with a green tick and a small leaf sprig.
const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#efe9df"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})">
    <rect x="96" y="84" width="320" height="356" rx="28" fill="#fdfbf6" stroke="#d9d0bf" stroke-width="6"/>
    <rect x="96" y="84" width="320" height="64" rx="28" fill="#5f8f6c"/>
    <rect x="96" y="120" width="320" height="28" fill="#5f8f6c"/>
    <g stroke="#e6dfd2" stroke-width="5">
      <line x1="130" y1="214" x2="382" y2="214"/><line x1="130" y1="282" x2="382" y2="282"/><line x1="130" y1="350" x2="382" y2="350"/>
    </g>
    <rect x="138" y="178" width="34" height="34" rx="7" fill="#5f8f6c"/>
    <path d="M144 196c5 4 9 9 13 15 7-13 17-24 31-33" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="138" y="246" width="34" height="34" rx="7" fill="none" stroke="#b8ae9c" stroke-width="5"/>
    <rect x="138" y="314" width="34" height="34" rx="7" fill="none" stroke="#b8ae9c" stroke-width="5"/>
    <g fill="none" stroke="#6f8f6f" stroke-width="7" stroke-linecap="round">
      <path d="M300 400c22-30 44-58 86-92"/>
      <path d="M326 366c-14-2-23-12-25-26 14 1 24 11 25 26Z"/>
      <path d="M344 344c13-1 25-9 30-21-13 0-25 8-30 21Z"/>
    </g>
  </g>
</svg>`;

for (const [name, size, pad] of [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["apple-touch-icon.png", 180, 0],
  ["icon-maskable-512.png", 512, 60],
]) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/canvas-icons/${name}`);
}
console.log("Daily Canvas icons written.");
