// Generates PromptSatori app icons. Run: node scripts/make-satori-icons.mjs
import { writeFileSync } from "node:fs";
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
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/satori-icons/${name}`);
}
// Browser-tab icons: a rounded tile reads better at 16-48px.
const tab = svg(40).replace('<rect width="512" height="512" fill="#0f6e66"/>', '<rect width="512" height="512" rx="112" fill="#0f6e66"/>');
await sharp(Buffer.from(tab)).resize(48, 48).png().toFile("public/satori-icons/favicon-48.png");
writeFileSync("public/satori-icons/icon.svg", tab.trim() + "\n");
// Next.js file convention: PromptSatori pages get this icon instead of Write.ai's.
writeFileSync("src/app/satori/icon.svg", tab.trim() + "\n");
console.log("PromptSatori icons written.");
