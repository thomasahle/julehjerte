/**
 * Generate the favicons from a 3x3 heart.
 *
 * This script generates the heart SVG inline (without depending on TypeScript modules)
 * and converts it to PNG using the canvas package.
 *
 * Usage: node scripts/generate-favicon.js
 */

import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

/**
 * Generate a 3x3 woven heart SVG, the site's Klassisk 3×3.
 *
 * The heart consists of:
 * - Two lobes (left=white, right=red) that overlap in a 3x3 grid
 * - The weave pattern creates a checkerboard in the overlap area
 * - Rotated 45 degrees to form the classic heart shape
 */
function generateHeartSvg(size, colors, outlineColor = '#666666') {
  const { left, right } = colors;

  // Heart geometry constants (matching the project's rendering)
  // For a 3x3 heart: overlap rectangle with 3 strips per lobe, the heart as large as it was
  const STRIP_WIDTH = 50;
  const CENTER = 300;
  const gridX = 3, gridY = 3;

  const overlapWidth = gridX * STRIP_WIDTH;  // 150
  const overlapHeight = gridY * STRIP_WIDTH; // 150
  const overlapLeft = CENTER - overlapWidth / 2;   // 225
  const overlapTop = CENTER - overlapHeight / 2;   // 225
  const overlapRight = overlapLeft + overlapWidth;  // 375
  const overlapBottom = overlapTop + overlapHeight; // 375

  const leftRadius = overlapHeight / 2;  // 75
  const topRadius = overlapWidth / 2;    // 75

  // Left lobe clip path: semicircle on left + rectangle
  const leftLobeClip = [
    `M ${overlapLeft} ${overlapTop}`,
    `L ${overlapRight} ${overlapTop}`,
    `L ${overlapRight} ${overlapBottom}`,
    `L ${overlapLeft} ${overlapBottom}`,
    `A ${leftRadius} ${leftRadius} 0 1 1 ${overlapLeft} ${overlapTop}`,
    'Z'
  ].join(' ');

  // Right lobe clip path: semicircle on top + rectangle
  const rightLobeClip = [
    `M ${overlapLeft} ${overlapTop}`,
    `A ${topRadius} ${topRadius} 0 1 1 ${overlapRight} ${overlapTop}`,
    `L ${overlapRight} ${overlapBottom}`,
    `L ${overlapLeft} ${overlapBottom}`,
    `L ${overlapLeft} ${overlapTop}`,
    'Z'
  ].join(' ');

  // Outline path (full heart shape)
  const outlinePath = [
    `M ${overlapLeft} ${overlapTop}`,
    `A ${topRadius} ${topRadius} 0 1 1 ${overlapRight} ${overlapTop}`,
    `L ${overlapRight} ${overlapBottom}`,
    `L ${overlapLeft} ${overlapBottom}`,
    `A ${leftRadius} ${leftRadius} 0 1 1 ${overlapLeft} ${overlapTop}`,
    'Z'
  ].join(' ');

  // The squares where the right lobe's strip lies on top: every other one, with the
  // left lobe's paper in the corners (and so in the square at the cleft), as on the site.
  const rightOnTopStrips = [];
  for (let row = 0; row < gridY; row++) {
    for (let col = 0; col < gridX; col++) {
      if ((col + row) % 2 === 0) continue;
      const x = overlapLeft + col * STRIP_WIDTH;
      const y = overlapTop + row * STRIP_WIDTH;
      rightOnTopStrips.push(`M ${x} ${y} L ${x + STRIP_WIDTH} ${y} L ${x + STRIP_WIDTH} ${y + STRIP_WIDTH} L ${x} ${y + STRIP_WIDTH} Z`);
    }
  }

  // Calculate viewBox to fit the rotated heart
  const cx = CENTER, cy = CENTER;

  // Approximate bounding box after 45-degree rotation
  const halfDiag = (overlapWidth + overlapHeight) / 2 * 1.1;
  const viewBoxSize = halfDiag * 2;
  const viewBoxMin = CENTER - halfDiag;

  const outlineWidth = Math.max(overlapWidth, overlapHeight) * 0.012;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBoxMin} ${viewBoxMin} ${viewBoxSize} ${viewBoxSize}" preserveAspectRatio="xMidYMid meet">
  <g transform="rotate(45, ${cx}, ${cy})">
    <defs>
      <clipPath id="overlap-clip">
        <rect x="${overlapLeft}" y="${overlapTop}" width="${overlapWidth}" height="${overlapHeight}" />
      </clipPath>
    </defs>
    <path d="${leftLobeClip}" fill="${left}" />
    <path d="${rightLobeClip}" fill="${right}" />
    <g clip-path="url(#overlap-clip)">
      <rect x="${overlapLeft}" y="${overlapTop}" width="${overlapWidth}" height="${overlapHeight}" fill="${left}" />
      <path d="${rightOnTopStrips.join(' ')}" fill="${right}" />
    </g>
    <path d="${outlinePath}" fill="none" stroke="${outlineColor}" stroke-width="${outlineWidth}" stroke-linejoin="round" stroke-linecap="round" />
  </g>
</svg>`;
}

// Colors
const colors = {
  left: '#ffffff',
  right: '#c41e2a'
};

// Generate PNGs at different sizes
const sizes = [
  { name: 'favicon-16.png', size: 16, outline: '#888888' },
  { name: 'favicon-32.png', size: 32, outline: '#777777' },
  { name: 'favicon-48.png', size: 48, outline: '#666666' },
  { name: 'icon-192.png', size: 192, outline: '#555555' },
  { name: 'icon-512.png', size: 512, outline: '#444444' },
];

async function generateFavicons() {
  for (const { name, size, outline } of sizes) {
    const svgMarkup = generateHeartSvg(size, colors, outline);

    // Convert SVG to PNG using canvas
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Load SVG as image
    const svgBuffer = Buffer.from(svgMarkup);
    const img = await loadImage(svgBuffer);

    ctx.drawImage(img, 0, 0, size, size);

    // Save PNG
    const pngBuffer = canvas.toBuffer('image/png');
    const outPath = path.join(projectRoot, 'static', name);
    fs.writeFileSync(outPath, pngBuffer);
    console.log(`Generated ${name} (${size}x${size})`);
  }

  // Also generate SVG favicon
  const svgFavicon = generateHeartSvg(64, colors, '#999999');
  fs.writeFileSync(path.join(projectRoot, 'static/favicon.svg'), svgFavicon);
  console.log('Generated favicon.svg');

  // favicon.ico: the three small PNGs in one file (an .ico may hold PNGs as they are).
  const icons = [16, 32, 48].map((size) => ({
    size,
    data: fs.readFileSync(path.join(projectRoot, 'static', `favicon-${size}.png`))
  }));
  const header = Buffer.alloc(6 + 16 * icons.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(icons.length, 4);
  let offset = header.length;
  icons.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size, at);
    header.writeUInt8(size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  fs.writeFileSync(path.join(projectRoot, 'static/favicon.ico'), Buffer.concat([header, ...icons.map((icon) => icon.data)]));
  console.log('Generated favicon.ico');

  console.log('\nDone! Generated all favicon files.');
}

generateFavicons().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
