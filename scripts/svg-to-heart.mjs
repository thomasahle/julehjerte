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
  --assume-lobe <lobe>  Treat all input paths as this lobe (left|right), unless overridden by --lobe
  --lobe <id:lobe>      Override lobe detection for a path id (lobe = left|right)
  --viewbox-is-overlap  Map the SVG viewBox onto the app overlap square (useful if your SVG uses the full viewBox as the overlap region)
  --stitch-tolerance <n>  Max endpoint gap when joining subpaths (defaults to auto)
  --strict-stitch       Fail if a <path> contains subpaths we can't stitch into one
  --derive-other-lobe   Create a between-lobes mirrored copy of each finger (fills the missing side for symmetric designs)
  --anti-between-lobes  Use the anti-diagonal mapping when deriving the other lobe (also reverses direction)
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
const assumeLobeRaw = getFlag('--assume-lobe', null);
const stitchToleranceRaw = getFlag('--stitch-tolerance', null);
const strictStitch = argv.includes('--strict-stitch');
const deriveOtherLobe = argv.includes('--derive-other-lobe');
const antiBetweenLobes = argv.includes('--anti-between-lobes');
const viewBoxIsOverlap = argv.includes('--viewbox-is-overlap');

const assumeLobe =
  assumeLobeRaw === null
    ? null
    : (() => {
        if (assumeLobeRaw === 'left' || assumeLobeRaw === 'right') return assumeLobeRaw;
        throw new Error(`Invalid --assume-lobe=${assumeLobeRaw} (expected left|right)`);
      })();

const stitchTolerance =
  stitchToleranceRaw === null
    ? null
    : (() => {
        const n = Number(stitchToleranceRaw);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error(`Invalid --stitch-tolerance=${stitchToleranceRaw}`);
        }
        return n;
      })();

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

function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function reverseSegment(seg) {
  return { ...seg, p0: seg.p3, p1: seg.p2, p2: seg.p1, p3: seg.p0 };
}

function reverseSubpath(segments) {
  return segments.slice().reverse().map(reverseSegment);
}

function approxSegmentLength(seg) {
  // Quick upper-ish bound based on control polygon length.
  return (
    pointDistance(seg.p0, seg.p1) +
    pointDistance(seg.p1, seg.p2) +
    pointDistance(seg.p2, seg.p3)
  );
}

function parseViewBox(attr) {
  const parts = String(attr ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
  }
  return { minX: 0, minY: 0, width: 600, height: 600 };
}

function getCenteredOverlapRect(gridSize) {
  const STRIP_WIDTH = 75;
  const CANVAS_SIZE = 600;
  const size = gridSize * STRIP_WIDTH;
  const left = CANVAS_SIZE / 2 - size / 2;
  const top = CANVAS_SIZE / 2 - size / 2;
  return { left, top, right: left + size, bottom: top + size, width: size, height: size };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function inferOverlapRectFromFingers(curFingers, fallbackGridSize) {
  const STRIP_WIDTH = 75;
  const CENTER = { x: 300, y: 300 };
  const leftCandidates = [];
  const rightCandidates = [];
  const topCandidates = [];
  const bottomCandidates = [];

  for (const f of curFingers) {
    const segs = f.segments ?? [];
    if (!segs.length) continue;
    const start = segs[0].p0;
    const end = segs[segs.length - 1].p3;
    if (f.lobe === 'left') {
      leftCandidates.push(Math.min(start.x, end.x));
      rightCandidates.push(Math.max(start.x, end.x));
    } else {
      topCandidates.push(Math.min(start.y, end.y));
      bottomCandidates.push(Math.max(start.y, end.y));
    }
  }

  const expectedW = fallbackGridSize * STRIP_WIDTH;
  const expectedH = fallbackGridSize * STRIP_WIDTH;
  const centeredLeft = CENTER.x - expectedW / 2;
  const centeredTop = CENTER.y - expectedH / 2;

  let left = leftCandidates.length ? median(leftCandidates) : centeredLeft;
  let right = rightCandidates.length ? median(rightCandidates) : centeredLeft + expectedW;
  let top = topCandidates.length ? median(topCandidates) : centeredTop;
  let bottom = bottomCandidates.length ? median(bottomCandidates) : centeredTop + expectedH;

  if (Math.abs(right - left - expectedW) <= 3) right = left + expectedW;
  if (Math.abs(bottom - top - expectedH) <= 3) bottom = top + expectedH;

  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function swapPointBetweenLobes(p, rect, anti = false) {
  const u = rect.width ? (p.x - rect.left) / rect.width : 0;
  const v = rect.height ? (p.y - rect.top) / rect.height : 0;
  if (!anti) return { x: rect.left + v * rect.width, y: rect.top + u * rect.height };
  return { x: rect.left + (1 - v) * rect.width, y: rect.top + (1 - u) * rect.height };
}

function canonicalizeDirectionForLobe(lobe, segments) {
  if (!segments.length) return segments;
  const start = segments[0].p0;
  const end = segments[segments.length - 1].p3;
  if (lobe === 'right') {
    // Keep a consistent direction (bottom -> top). This matters because the
    // weave renderer samples paths in-order to build strip ribbons.
    if (start.y < end.y) return reverseSubpath(segments);
  } else {
    // left lobe: right -> left
    if (start.x < end.x) return reverseSubpath(segments);
  }
  return segments;
}

function splitIntoSubpaths(segments) {
  const subpaths = [];
  let current = [];
  for (const seg of segments) {
    if (seg.move && current.length) {
      subpaths.push(current);
      current = [];
    }
    current.push(seg);
  }
  if (current.length) subpaths.push(current);
  return subpaths;
}

function stitchSubpathsIntoSinglePath(subpaths, tolerance) {
  if (subpaths.length <= 1) return { segments: subpaths[0] ?? [], unused: 0 };

  const scored = subpaths.map((segs) => ({
    segs,
    length: segs.reduce((sum, s) => sum + approxSegmentLength(s), 0)
  }));
  scored.sort((a, b) => b.length - a.length);

  let chain = scored[0]?.segs ? scored[0].segs.slice() : [];
  const remaining = scored.slice(1).map((x) => x.segs);

  const chainStart = () => chain[0]?.p0;
  const chainEnd = () => chain[chain.length - 1]?.p3;

  function tryAttach(candidate) {
    const start = chainStart();
    const end = chainEnd();
    if (!start || !end) return null;

    const candStart = candidate[0]?.p0;
    const candEnd = candidate[candidate.length - 1]?.p3;
    if (!candStart || !candEnd) return null;

    const asIs = candidate;
    const rev = reverseSubpath(candidate);

    const options = [];
    // Append after chain
    options.push({ where: 'append', segs: asIs, gap: pointDistance(end, candStart), joinTo: candStart });
    options.push({ where: 'append', segs: rev, gap: pointDistance(end, candEnd), joinTo: candEnd });
    // Prepend before chain
    options.push({ where: 'prepend', segs: asIs, gap: pointDistance(start, candEnd), joinTo: candEnd });
    options.push({ where: 'prepend', segs: rev, gap: pointDistance(start, candStart), joinTo: candStart });

    const valid = options.filter((o) => o.gap <= tolerance);
    if (!valid.length) return null;

    valid.sort((a, b) => a.gap - b.gap);
    return valid[0];
  }

  while (remaining.length) {
    let best = null;
    let bestIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      if (!candidate?.length) continue;
      const attempt = tryAttach(candidate);
      if (!attempt) continue;
      const candidateLen = candidate.reduce((sum, s) => sum + approxSegmentLength(s), 0);
      const key = { gap: attempt.gap, len: candidateLen };
      if (!best) {
        best = { ...attempt, key };
        bestIdx = i;
      } else if (key.gap < best.key.gap || (key.gap === best.key.gap && key.len > best.key.len)) {
        best = { ...attempt, key };
        bestIdx = i;
      }
    }

    if (!best) break;

    const beforeStart = chainStart();
    const beforeEnd = chainEnd();
    if (!beforeStart || !beforeEnd) break;

    if (best.where === 'append') {
      if (best.gap > 0) {
        chain.push(convertLineToCubic(beforeEnd, best.joinTo));
      }
      chain.push(...best.segs);
    } else {
      const prefix = best.segs.slice();
      if (best.gap > 0) {
        prefix.push(convertLineToCubic(best.joinTo, beforeStart));
      }
      chain = [...prefix, ...chain];
    }

    remaining.splice(bestIdx, 1);
  }

  return { segments: chain, unused: remaining.length };
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
  const fmt = (n) => Number(n.toFixed(places));
  let d = '';
  d += `M ${fmt(segments[0].p0.x)} ${fmt(segments[0].p0.y)}`;
  for (const seg of segments) {
    d += ` C ${fmt(seg.p1.x)} ${fmt(seg.p1.y)} ${fmt(seg.p2.x)} ${fmt(seg.p2.y)} ${fmt(
      seg.p3.x
    )} ${fmt(seg.p3.y)}`;
  }
  return d.trim();
}

const svg = fs.readFileSync(inputPath, 'utf8');
const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
const doc = dom.window.document;
const viewBox = parseViewBox(doc.documentElement?.getAttribute?.('viewBox'));
const overlapRect = getCenteredOverlapRect(gridSize);

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

  if (viewBoxIsOverlap) {
    const sx = overlapRect.width / (viewBox.width || 1);
    const sy = overlapRect.height / (viewBox.height || 1);
    const tx = overlapRect.left - viewBox.minX * sx;
    const ty = overlapRect.top - viewBox.minY * sy;
    for (const seg of segments) {
      for (const key of ['p0', 'p1', 'p2', 'p3']) {
        const p = seg[key];
        seg[key] = { x: p.x * sx + tx, y: p.y * sy + ty };
      }
    }
  }

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
  const lobe = lobeOverrides.get(id) ?? assumeLobe ?? autoLobe;

  const subpaths = splitIntoSubpaths(segments);
  const joinTol = stitchTolerance ?? Math.max(0.5, Math.max(width, height) * 1e-3);
  const stitched = stitchSubpathsIntoSinglePath(subpaths, joinTol);
  if (stitched.unused) {
    const kept = subpaths.length - stitched.unused;
    const msg = `[svg-to-heart] ${id}: only stitched ${kept}/${subpaths.length} subpaths; dropped ${stitched.unused} (try increasing --stitch-tolerance)`;
    if (strictStitch) throw new Error(msg);
    console.warn(msg);
  }
  const simplified = stitched.segments;

  const directed = canonicalizeDirectionForLobe(lobe, simplified);

  fingers.push({
    id,
    lobe,
    segments: directed,
    pathData: segmentsToPathData(directed, precision)
  });
}

if (deriveOtherLobe) {
  const lobes = new Set(fingers.map((f) => f.lobe));
  if (lobes.size > 1) {
    console.warn(
      `[svg-to-heart] --derive-other-lobe: input already contains both lobes (${Array.from(lobes).join(
        ', '
      )}); deriving will duplicate boundaries`
    );
  }
  const rect = viewBoxIsOverlap
    ? overlapRect
    : (() => {
        const inferred = inferOverlapRectFromFingers(fingers, gridSize);
        if (inferred.width < 1 || inferred.height < 1) return overlapRect;
        return inferred;
      })();
  const derived = fingers.map((f) => {
    const targetLobe = f.lobe === 'left' ? 'right' : 'left';
    const mapped = f.segments.map((seg) => ({
      ...seg,
      p0: swapPointBetweenLobes(seg.p0, rect, antiBetweenLobes),
      p1: swapPointBetweenLobes(seg.p1, rect, antiBetweenLobes),
      p2: swapPointBetweenLobes(seg.p2, rect, antiBetweenLobes),
      p3: swapPointBetweenLobes(seg.p3, rect, antiBetweenLobes)
    }));
    const finalSegments = canonicalizeDirectionForLobe(
      targetLobe,
      antiBetweenLobes ? reverseSubpath(mapped) : mapped
    );
    return {
      id: `mirror-${f.id}`,
      lobe: targetLobe,
      segments: finalSegments,
      pathData: segmentsToPathData(finalSegments, precision)
    };
  });
  fingers.push(...derived);
}

const heart = {
  id: heartId,
  name: heartName,
  author: heartAuthor,
  description: heartDesc,
  gridSize,
  fingers: fingers.map(({ id, lobe, pathData }) => ({ id, lobe, pathData }))
};

const json = JSON.stringify(heart, null, 2);
if (outputPath) {
  fs.writeFileSync(outputPath, json, 'utf8');
  console.log(`Wrote ${outputPath}`);
} else {
  console.log(json);
}
