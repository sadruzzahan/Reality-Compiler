import sharp from "sharp";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SRC = "artifacts/reality-compiler/public/logo.svg";
const ICON_DIR = "artifacts/reality-compiler/public/icons";

mkdirSync(ICON_DIR, { recursive: true });

const svgBuffer = readFileSync(SRC);

const SIZES = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "favicon-48x48.png", size: 48 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
];

for (const { name, size } of SIZES) {
  await sharp(svgBuffer, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 10, g: 10, b: 10, alpha: 1 } })
    .png()
    .toFile(`${ICON_DIR}/${name}`);
  console.log(`wrote ${ICON_DIR}/${name}`);
}

// Maskable icon: 512 with 10% safe-area padding (background fully fills).
const maskableInner = await sharp(svgBuffer, { density: 384 })
  .resize(410, 410, { fit: "contain", background: { r: 10, g: 10, b: 10, alpha: 0 } })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 512,
    height: 512,
    channels: 4,
    background: { r: 10, g: 10, b: 10, alpha: 1 },
  },
})
  .composite([{ input: maskableInner, top: 51, left: 51 }])
  .png()
  .toFile(`${ICON_DIR}/icon-512-maskable.png`);
console.log(`wrote ${ICON_DIR}/icon-512-maskable.png`);

// OG image: 1200x630 with logo centered + brand wordmark.
const ogLogo = await sharp(svgBuffer, { density: 512 })
  .resize(280, 280)
  .png()
  .toBuffer();

const ogTextSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0a0a0a"/>
      <stop offset="1" stop-color="#1a0d2e"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="600" y="430" text-anchor="middle" fill="#ffffff" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="64">Reality Compiler</text>
  <text x="600" y="490" text-anchor="middle" fill="#a78bfa" font-family="JetBrains Mono, monospace" font-size="26">Compile reality from plain text.</text>
  <text x="600" y="560" text-anchor="middle" fill="#71717a" font-family="JetBrains Mono, monospace" font-size="20">A marketplace for AI-designed hardware.</text>
</svg>
`);

await sharp(ogTextSvg)
  .composite([{ input: ogLogo, top: 60, left: 460 }])
  .jpeg({ quality: 88 })
  .toFile("artifacts/reality-compiler/public/opengraph.jpg");
console.log("wrote artifacts/reality-compiler/public/opengraph.jpg");

// Tiny favicon.ico isn't trivial to generate without an extra dep; the
// browser will happily fall back to favicon-32x32.png referenced in the
// <link> tags. We keep the existing favicon.svg as the modern default.

// PWA manifest
const manifest = {
  name: "Reality Compiler",
  short_name: "Reality Compiler",
  description:
    "Describe a physical product in plain text. Reality Compiler turns it into a manufacturable spec, BOM, and concept render — and a marketplace where designers earn from every order.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#0a0a0a",
  theme_color: "#7c3aed",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    {
      src: "/icons/icon-512-maskable.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};
writeFileSync(
  "artifacts/reality-compiler/public/manifest.webmanifest",
  JSON.stringify(manifest, null, 2),
);
console.log("wrote manifest.webmanifest");
