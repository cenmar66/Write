// Generates InboxSatori's icons. Run: node scripts/make-inbox-icons.mjs
// Mark: a brush-stroke ensō (the Zen circle of satori) left open where the brush lifts, a
// teal dot at the lift ("the one thing that matters"), and an envelope inside.
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const BG = "#24489c";
const INK = "#fffaf0";
const TEAL = "#5fd3c4";

/** pad: inset for maskable/home-screen safe zones; small: bolder version for browser tabs. */
const svg = ({ pad = 0, rounded = true, small = false } = {}) => {
  const env = small
    ? `<rect x="188" y="190" width="164" height="120" rx="16" fill="none" stroke="${INK}" stroke-width="34"/>
  <path d="M194 200 L270 256 L346 200" fill="none" stroke="${INK}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<rect x="194" y="196" width="152" height="110" rx="16" fill="none" stroke="${INK}" stroke-width="22"/>
  <path d="M200 204 L270 255 L340 204" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><mask id="lift"><rect width="512" height="512" fill="#fff"/><path d="M256 256 L330 40 L470 40 L470 150 Z" fill="#000"/></mask></defs>
  <rect width="512" height="512"${rounded ? ' rx="112"' : ""} fill="${BG}"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})">
  <path mask="url(#lift)" fill-rule="evenodd" fill="${INK}" d="M256 92a164 164 0 1 0 0.01 0Z M270 124a126 126 0 1 0 0.01 0Z"/>
  ${env}
  <circle cx="392" cy="148" r="${small ? 28 : 22}" fill="${TEAL}"/>
  </g>
</svg>`;
};

const out = "public/inbox-icons";
for (const [name, size, opts] of [
  ["icon-192.png", 192, { rounded: false, pad: 16 }],
  ["icon-512.png", 512, { rounded: false, pad: 40 }],
  ["icon-maskable-512.png", 512, { rounded: false, pad: 96 }],
  ["apple-touch-icon.png", 180, { rounded: false, pad: 14 }],
  ["favicon-48.png", 48, { small: true }],
  ["favicon-32.png", 32, { small: true }],
]) {
  await sharp(Buffer.from(svg(opts))).resize(size, size).png().toFile(`${out}/${name}`);
}
writeFileSync(`${out}/icon.svg`, svg().trim() + "\n");
// Next.js file convention: InboxSatori pages get this tab icon instead of Write.ai's.
writeFileSync("src/app/inbox/icon.svg", svg({ small: true }).trim() + "\n");
console.log("InboxSatori icons written.");
