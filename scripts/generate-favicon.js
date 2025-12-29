/**
 * Generate favicon PNG from a 2x2 heart.
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
 * Generate a 2x2 woven heart SVG.
 *
 * The heart consists of:
 * - Two lobes (left=white, right=red) that overlap in a 2x2 grid
 * - The weave pattern creates a checkerboard in the overlap area
 * - Rotated 45 degrees to form the classic heart shape
 */
function generateHeartSvg(size, colors, outlineColor = '#666666') {
  const { left, right } = colors;

  // Heart geometry constants (matching the project's rendering)
  // For a 2x2 heart: overlap rectangle with 2 strips per lobe
  const STRIP_WIDTH = 75;
  const CENTER = 300;
  const gridX = 2, gridY = 2;

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

  // Strip paths for weave effect (2x2 grid)
  // For parity 0: top-left and bottom-right show right lobe on top
  const stripY = overlapTop + STRIP_WIDTH; // y = 300 (middle horizontal line)
  const stripX = overlapLeft + STRIP_WIDTH; // x = 300 (middle vertical line)

  // Vertical strips (right lobe) that appear on top in certain cells
  // For correct weave: red on top in top-right and bottom-left quadrants
  const rightOnTopStrips = `
    M ${stripX} ${overlapTop}
    L ${overlapRight} ${overlapTop}
    L ${overlapRight} ${stripY}
    L ${stripX} ${stripY}
    Z
    M ${overlapLeft} ${stripY}
    L ${stripX} ${stripY}
    L ${stripX} ${overlapBottom}
    L ${overlapLeft} ${overlapBottom}
    Z
  `;

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
      <path d="${rightOnTopStrips}" fill="${right}" fill-rule="evenodd" />
    </g>
    <path d="${outlinePath}" fill="none" stroke="${outlineColor}" stroke-width="${outlineWidth}" stroke-linejoin="round" stroke-linecap="round" />
  </g>
</svg>`;
}

// Colors
const colors = {
  left: '#ffffff',
  right: '#cc0000'
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

  console.log('\nDone! Generated all favicon files.');
}

generateFavicons().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
