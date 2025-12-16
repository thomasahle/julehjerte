#!/usr/bin/env node
// Convert SVG paths into a HeartDesign JSON file.
// Focused on the project's format: absolute M/C commands only.

import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes('--help')) {
  console.log(`Usage: node ${path.basename(process.argv[1])} <input.svg> [--out out.json] [--id sol-4x4] [--name "Sol 4x4"] [--author "Community"] [--grid 4] [--lobe pathId:left]

Options:
  --out <file>          Write output JSON to file (stdout if omitted)
  --id <id>             Heart id
  --name <name>         Heart name
  --author <author>     Heart author
  --desc <text>         Description
  --grid <n>            gridSize (default 4)
  --paths <id1,id2>     Only include these comma-separated path ids (keep document order)
  --lobe <id:lobe>      Override lobe detection for a path id (lobe = left|right)
  --precision <n>       Decimal places for coordinates (default 3)
`);
  process.exit(0);
}

function getFlag(flag, fallback) {
  const idx = argv.indexOf(flag);
  if (idx === -1) return fallback;
  return argv[idx + 1] ?? fallback;
}

function getAllFlags(flag) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && argv[i + 1]) out.push(argv[i + 1]);
  }
  return out;
}

const inputPath = argv[0];
const outputPath = getFlag('--out', null);
const heartId = getFlag('--id', 'custom-heart');
const heartName = getFlag('--name', 'Custom Heart');
const heartAuthor = getFlag('--author', 'Unknown');
const heartDesc = getFlag('--desc', undefined);
const gridSize = Number(getFlag('--grid', '4'));
const precision = Number(getFlag('--precision', '3'));
const includeIds = getFlag('--paths', null)?.split(',').filter(Boolean) ?? null;

const lobeOverrides = new Map(
  getAllFlags('--lobe')
    .map((entry) => entry.split(':'))
    .filter((pair) => pair.length === 2 && (pair[1] === 'left' || pair[1] === 'right'))
    .map(([id, lobe]) => [id, lobe])
);

function parseNumbers(str) {
  return (str.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
}

function mulMatrix(a, b) {
  // Affine 2x3 matrix [a,b,c,d,e,f]
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

function applyMatrix(m, p) {
  return {
    x: m[0] * p.x + m[2] * p.y + m[4],
    y: m[1] * p.x + m[3] * p.y + m[5]
  };
}

function parseTransform(str) {
  if (!str) return [1, 0, 0, 1, 0, 0];
  const parts = str.match(/[a-zA-Z]+\([^)]*\)/g) || [];
  let m = [1, 0, 0, 1, 0, 0];
  for (const part of parts) {
    const [type] = part.split('(');
    const nums = parseNumbers(part);
    let next = [1, 0, 0, 1, 0, 0];
    if (type === 'matrix' && nums.length === 6) {
      next = nums;
    } else if (type === 'translate') {
      const [tx, ty = 0] = nums;
      next = [1, 0, 0, 1, tx, ty];
    } else if (type === 'scale') {
      const [sx, sy = sx] = nums;
      next = [sx, 0, 0, sy, 0, 0];
    } else if (type === 'rotate') {
      const [deg, cx = 0, cy = 0] = nums;
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      next = [cos, sin, -sin, cos, 0, 0];
      if (cx || cy) {
        // Translate to pivot, rotate, translate back
        next = mulMatrix([1, 0, 0, 1, cx, cy], mulMatrix(next, [1, 0, 0, 1, -cx, -cy]));
      }
    }
    m = mulMatrix(m, next);
  }
  return m;
}

function convertLineToCubic(p0, p1) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  return {
    p0,
    p1: { x: p0.x + dx / 3, y: p0.y + dy / 3 },
    p2: { x: p0.x + (2 * dx) / 3, y: p0.y + (2 * dy) / 3 },
    p3: p1
  };
}

function parsePathToSegments(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const isCommand = (t) => /^[a-zA-Z]$/.test(t);

  let i = 0;
  let current = { x: 0, y: 0 };
  let subpathStart = { x: 0, y: 0 };
  let lastControl = null;
  let prevWasCurve = false;
  const segments = [];
  let lastEnd = null;

  const readNumber = () => Number(tokens[i++]);
  const pushSegment = (seg, kind) => {
    const move = !lastEnd || lastEnd.x !== seg.p0.x || lastEnd.y !== seg.p0.y;
    segments.push({ ...seg, move, kind });
    lastEnd = seg.p3;
  };
  while (i < tokens.length) {
    const cmdToken = tokens[i++];
    if (!isCommand(cmdToken)) continue;
    const isRelative = cmdToken === cmdToken.toLowerCase();
    const type = cmdToken.toUpperCase();

    const nextPoint = () => {
      const x = readNumber();
      const y = readNumber();
      return isRelative ? { x: current.x + x, y: current.y + y } : { x, y };
    };

    if (type === 'M') {
      const first = nextPoint();
      current = first;
      subpathStart = first;
      lastControl = null;
      prevWasCurve = false;
      lastEnd = null;
      // Additional pairs in same command are implicit lines; just advance the pen.
      while (i < tokens.length && !isCommand(tokens[i])) {
        const to = nextPoint();
        pushSegment(convertLineToCubic(current, to), 'line');
        current = to;
        lastControl = current;
        prevWasCurve = false;
      }
    } else if (type === 'L') {
      while (i < tokens.length && !isCommand(tokens[i])) {
        const to = nextPoint();
        pushSegment(convertLineToCubic(current, to), 'line');
        current = to;
        lastControl = current;
        prevWasCurve = false;
      }
    } else if (type === 'H') {
      while (i < tokens.length && !isCommand(tokens[i])) {
        const x = readNumber();
        const to = { x: isRelative ? current.x + x : x, y: current.y };
        pushSegment(convertLineToCubic(current, to), 'line');
        current = to;
        lastControl = current;
        prevWasCurve = false;
      }
    } else if (type === 'V') {
      while (i < tokens.length && !isCommand(tokens[i])) {
        const y = readNumber();
        const to = { x: current.x, y: isRelative ? current.y + y : y };
        pushSegment(convertLineToCubic(current, to), 'line');
        current = to;
        lastControl = current;
        prevWasCurve = false;
      }
    } else if (type === 'C') {
      while (i < tokens.length && !isCommand(tokens[i])) {
        const p1 = nextPoint();
        const p2 = nextPoint();
        const p3 = nextPoint();
        pushSegment({ p0: current, p1, p2, p3 }, 'curve');
        current = p3;
        lastControl = p2;
        prevWasCurve = true;
      }
    } else if (type === 'S') {
      while (i < tokens.length && !isCommand(tokens[i])) {
        const reflected =
          lastControl && prevWasCurve
            ? { x: 2 * current.x - lastControl.x, y: 2 * current.y - lastControl.y }
            : current;
        const p2 = nextPoint();
        const p3 = nextPoint();
        pushSegment({ p0: current, p1: reflected, p2, p3 }, 'curve');
        current = p3;
        lastControl = p2;
        prevWasCurve = true;
      }
    } else if (type === 'Z') {
      pushSegment(convertLineToCubic(current, subpathStart), 'line');
      current = subpathStart;
      lastControl = null;
      prevWasCurve = false;
    }
  }

  return segments;
}

function segmentsToPathData(segments, places) {
  if (!segments.length) return '';
  // Keep only curve segments; drop lines that were used for bookkeeping in SVG.
  const curves = segments.filter((s) => s.kind === 'curve');
  if (!curves.length) return '';
  const fmt = (n) => Number(n.toFixed(places));
  let d = '';
  let first = true;
  for (const seg of curves) {
    const needsMove = first || seg.move;
    if (needsMove) {
      d += `${first ? '' : ' '}M ${fmt(seg.p0.x)} ${fmt(seg.p0.y)}`;
      first = false;
    }
    d += ` C ${fmt(seg.p1.x)} ${fmt(seg.p1.y)} ${fmt(seg.p2.x)} ${fmt(seg.p2.y)} ${fmt(
      seg.p3.x
    )} ${fmt(seg.p3.y)}`;
  }
  return d.trim();
}

const svg = fs.readFileSync(inputPath, 'utf8');
const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
const doc = dom.window.document;

const selectedPaths =
  includeIds?.map((id) => doc.getElementById(id)).filter(Boolean) ??
  Array.from(doc.querySelectorAll('path'));

const fingers = [];

for (const el of selectedPaths) {
  const id = el.getAttribute('id') || 'path';
  const rawD = el.getAttribute('d');
  if (!rawD) continue;

  // Compose transforms from element up to root
  let m = [1, 0, 0, 1, 0, 0];
  let node = el;
  while (node && node.getAttribute) {
    const t = node.getAttribute('transform');
    if (t) m = mulMatrix(parseTransform(t), m);
    node = node.parentNode;
  }

  const segments = parsePathToSegments(rawD).map((seg) => ({
    p0: applyMatrix(m, seg.p0),
    p1: applyMatrix(m, seg.p1),
    p2: applyMatrix(m, seg.p2),
    p3: applyMatrix(m, seg.p3),
    move: seg.move,
    kind: seg.kind
  }));

  const invalid = segments.find((seg) =>
    [seg.p0, seg.p1, seg.p2, seg.p3].some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  );
  if (invalid) {
    throw new Error(`Non-finite coordinate detected in path ${id}`);
  }

  // Detect lobe: vertical-ish -> right, else left
  const xs = segments.flatMap((s) => [s.p0.x, s.p1.x, s.p2.x, s.p3.x]);
  const ys = segments.flatMap((s) => [s.p0.y, s.p1.y, s.p2.y, s.p3.y]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const autoLobe = height > width ? 'right' : 'left';
  const lobe = lobeOverrides.get(id) ?? autoLobe;

  fingers.push({
    id,
    lobe,
    pathData: segmentsToPathData(segments, precision)
  });
}

const heart = {
  id: heartId,
  name: heartName,
  author: heartAuthor,
  description: heartDesc,
  gridSize,
  fingers
};

const json = JSON.stringify(heart, null, 2);
if (outputPath) {
  fs.writeFileSync(outputPath, json, 'utf8');
  console.log(`Wrote ${outputPath}`);
} else {
  console.log(json);
}
