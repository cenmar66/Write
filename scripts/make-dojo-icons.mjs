// Generates PromptDojo app icons. Run: node scripts/make-dojo-icons.mjs
import sharp from "sharp";

// Deep teal tile with a cream ring, horizon line and two legs (a seated figure / torii-like mark).
const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0f6e66"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})">
    <circle cx="256" cy="246" r="128" fill="none" stroke="#fffaf0" stroke-width="34"/>
    <path d="M110 246h292" stroke="#fffaf0" stroke-width="34" stroke-linecap="round"/>
    <path d="M206 330l-38 70M306 330l38 70" stroke="#fffaf0" stroke-width="30" stroke-linecap="round"/>
  </g>
</svg>`;

for (const [name, size, pad] of [
  ["icon-192.png", 192, 24],
  ["icon-512.png", 512, 60],
  ["apple-touch-icon.png", 180, 20],
  ["icon-maskable-512.png", 512, 100],
]) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/dojo-icons/${name}`);
}
console.log("PromptDojo icons written.");
