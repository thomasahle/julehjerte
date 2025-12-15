import paperPkg from 'paper';
import { performance } from 'node:perf_hooks';

const { PaperScope } = paperPkg;

const STRIP_WIDTH = 50;
const CANVAS_SIZE = 600;
const CENTER = { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 };

function now() {
  return performance.now();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function itemArea(item) {
  const area = item?.area;
  return typeof area === 'number' ? area : 0;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

function summarize(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const mean = n ? sorted.reduce((a, b) => a + b, 0) / n : 0;
  return {
    n,
    mean,
    median: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    min: sorted[0] ?? 0,
    max: sorted[n - 1] ?? 0
  };
}

function fmt(ms) {
  if (!Number.isFinite(ms)) return 'NaN';
  if (ms < 10) return ms.toFixed(2);
  if (ms < 100) return ms.toFixed(1);
  return ms.toFixed(0);
}

function withInsertItemsDisabled(paper, fn) {
  const prev = paper.settings.insertItems;
  paper.settings.insertItems = false;
  try {
    return fn();
  } finally {
    paper.settings.insertItems = prev;
  }
}

function getSquareParams(strips) {
  const squareSize = strips * STRIP_WIDTH;
  const squareLeft = CENTER.x - squareSize / 2;
  const squareTop = CENTER.y - squareSize / 2;
  const earRadius = squareSize / 2;
  return { squareSize, squareLeft, squareTop, earRadius };
}

function createDefaultFingers(countPerLobe) {
  const strips = countPerLobe;
  const { squareSize, squareLeft, squareTop } = getSquareParams(strips);

  const result = [];
  const internal = Math.max(0, strips - 1);

  for (let i = 0; i < internal; i++) {
    const t = (i + 1) / strips;
    const y = squareTop + t * squareSize;
    const p0 = { x: squareLeft + squareSize, y };
    const p3 = { x: squareLeft, y };

    const bow = (t - 0.5) * squareSize * 0.12;
    const p1 = { x: p0.x - squareSize * 0.3, y: p0.y + bow };
    const p2 = { x: p3.x + squareSize * 0.3, y: p3.y - bow };

    result.push({ id: `L-${i}`, lobe: 'left', p0, p1, p2, p3 });
  }

  for (let i = 0; i < internal; i++) {
    const t = (i + 1) / strips;
    const x = squareLeft + t * squareSize;
    const p0 = { x, y: squareTop + squareSize };
    const p3 = { x, y: squareTop };

    const bow = (t - 0.5) * squareSize * 0.12;
    const p1 = { x: p0.x + bow, y: p0.y - squareSize * 0.3 };
    const p2 = { x: p3.x - bow, y: p3.y + squareSize * 0.3 };

    result.push({ id: `R-${i}`, lobe: 'right', p0, p1, p2, p3 });
  }

  return result;
}

function linePathData(points) {
  const parts = [];
  for (let i = 0; i < points.length; i++) {
    const { x, y } = points[i];
    parts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(3)} ${y.toFixed(3)}`);
  }
  return parts.join(' ');
}

function createWavyPolylineFingers(countPerLobe, { segments = 24, amplitude = 12, frequency = 2 } = {}) {
  const strips = countPerLobe;
  const { squareSize, squareLeft, squareTop } = getSquareParams(strips);
  const squareRight = squareLeft + squareSize;
  const squareBottom = squareTop + squareSize;

  const result = [];
  const internal = Math.max(0, strips - 1);
  const step = squareSize / segments;

  // Left: horizontal-ish boundaries (right edge -> left edge), varying y(x)
  for (let i = 0; i < internal; i++) {
    const t = (i + 1) / strips;
    const baseY = squareTop + t * squareSize;
    const phase = (i * Math.PI) / 7;
    const pts = [];
    for (let k = 0; k <= segments; k++) {
      const x = squareRight - k * step;
      const y = baseY + amplitude * Math.sin((2 * Math.PI * frequency * k) / segments + phase);
      pts.push({ x, y });
    }
    const pathData = linePathData(pts);
    const p0 = { x: squareRight, y: baseY };
    const p3 = { x: squareLeft, y: baseY };
    result.push({ id: `Lw-${i}`, lobe: 'left', p0, p1: p0, p2: p3, p3, pathData });
  }

  // Right: vertical-ish boundaries (bottom edge -> top edge), varying x(y)
  for (let i = 0; i < internal; i++) {
    const t = (i + 1) / strips;
    const baseX = squareLeft + t * squareSize;
    const phase = (i * Math.PI) / 5;
    const pts = [];
    for (let k = 0; k <= segments; k++) {
      const y = squareBottom - k * step;
      const x = baseX + amplitude * Math.sin((2 * Math.PI * frequency * k) / segments + phase);
      pts.push({ x, y });
    }
    const pathData = linePathData(pts);
    const p0 = { x: baseX, y: squareBottom };
    const p3 = { x: baseX, y: squareTop };
    result.push({ id: `Rw-${i}`, lobe: 'right', p0, p1: p0, p2: p3, p3, pathData });
  }

  return result;
}

function buildLobeShape(paper, kind, squareLeft, squareTop, squareSize, earRadius) {
  return withInsertItemsDisabled(paper, () => {
    const squareRect = new paper.Path.Rectangle(
      new paper.Point(squareLeft, squareTop),
      new paper.Size(squareSize, squareSize)
    );

    let semi;
    if (kind === 'left') {
      const ear = new paper.Path.Circle(
        new paper.Point(squareLeft, squareTop + squareSize / 2),
        earRadius
      );
      const cut = new paper.Path.Rectangle(
        new paper.Point(squareLeft, squareTop),
        new paper.Point(squareLeft + earRadius, squareTop + squareSize)
      );
      semi = ear.subtract(cut, { insert: false });
    } else {
      const ear = new paper.Path.Circle(
        new paper.Point(squareLeft + squareSize / 2, squareTop),
        earRadius
      );
      const cut = new paper.Path.Rectangle(
        new paper.Point(squareLeft, squareTop),
        new paper.Point(squareLeft + squareSize, squareTop + earRadius)
      );
      semi = ear.subtract(cut, { insert: false });
    }

    const lobe = squareRect.unite(semi, { insert: false });
    return lobe;
  });
}

function buildFingerPath(paper, finger) {
  if (finger.pathData) return new paper.Path(finger.pathData);
  const path = new paper.Path();
  path.moveTo(new paper.Point(finger.p0.x, finger.p0.y));
  path.cubicCurveTo(
    new paper.Point(finger.p1.x, finger.p1.y),
    new paper.Point(finger.p2.x, finger.p2.y),
    new paper.Point(finger.p3.x, finger.p3.y)
  );
  return path;
}

function samplePath(path, samples) {
  const length = path.length;
  if (!length) return [];
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const offset = (length * i) / samples;
    const pt = path.getPointAt(offset);
    if (pt) pts.push(pt);
  }
  return pts;
}

function buildRibbonBetween(paper, a, b, samples) {
  const aPts = samplePath(a, samples);
  const bPts = samplePath(b, samples);
  const ribbon = new paper.Path();
  ribbon.addSegments(aPts.map((p) => new paper.Segment(p)));
  ribbon.addSegments(bPts.reverse().map((p) => new paper.Segment(p)));
  ribbon.closed = true;
  return ribbon;
}

function buildStripRegionBetween(paper, a, b, overlap, ribbonSamples) {
  return withInsertItemsDisabled(paper, () => {
    const ribbon = buildRibbonBetween(paper, a, b, ribbonSamples);
    const clipped = ribbon.intersect(overlap, { insert: false });
    return clipped;
  });
}

function buildLobeStrips(paper, lobe, fingers, overlap, squareLeft, squareTop, squareSize, ribbonSamples) {
  const squareRight = squareLeft + squareSize;
  const squareBottom = squareTop + squareSize;

  const internal = fingers
    .filter((f) => f.lobe === lobe)
    .slice()
    .sort((a, b) => (lobe === 'left' ? a.p0.y - b.p0.y : a.p0.x - b.p0.x));

  const boundaries = [];

  if (lobe === 'left') {
    boundaries.push(() => new paper.Path.Line(new paper.Point(squareRight, squareTop), new paper.Point(squareLeft, squareTop)));
    internal.forEach((f) => boundaries.push(() => buildFingerPath(paper, f)));
    boundaries.push(() => new paper.Path.Line(new paper.Point(squareRight, squareBottom), new paper.Point(squareLeft, squareBottom)));
  } else {
    boundaries.push(() => new paper.Path.Line(new paper.Point(squareLeft, squareBottom), new paper.Point(squareLeft, squareTop)));
    internal.forEach((f) => boundaries.push(() => buildFingerPath(paper, f)));
    boundaries.push(() => new paper.Path.Line(new paper.Point(squareRight, squareBottom), new paper.Point(squareRight, squareTop)));
  }

  const strips = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const a = boundaries[i]();
    const b = boundaries[i + 1]();
    const strip = buildStripRegionBetween(paper, a, b, overlap, ribbonSamples);
    a.remove();
    b.remove();
    if (!strip || Math.abs(itemArea(strip)) < 1) continue;
    strips.push({ index: i, item: strip });
  }
  return strips;
}

function buildInputs(paper, gridSize, fingers, ribbonSamples) {
  const { squareSize, squareLeft, squareTop, earRadius } = getSquareParams(gridSize);
  const leftLobe = buildLobeShape(paper, 'left', squareLeft, squareTop, squareSize, earRadius);
  const rightLobe = buildLobeShape(paper, 'right', squareLeft, squareTop, squareSize, earRadius);
  const overlap = withInsertItemsDisabled(paper, () => leftLobe.intersect(rightLobe, { insert: false }));

  const leftStrips = buildLobeStrips(paper, 'left', fingers, overlap, squareLeft, squareTop, squareSize, ribbonSamples);
  const rightStrips = buildLobeStrips(paper, 'right', fingers, overlap, squareLeft, squareTop, squareSize, ribbonSamples);

  return { overlap, leftStrips, rightStrips };
}

// --- Weave variants ---------------------------------------------------------

function weave_mask2(paper, { leftStrips, rightStrips }) {
  return withInsertItemsDisabled(paper, () => {
    const leftEvenItems = leftStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);
    const leftOddItems = leftStrips.filter((s) => s.index % 2 === 1).map((s) => s.item);
    const rightEvenItems = rightStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);
    const rightOddItems = rightStrips.filter((s) => s.index % 2 === 1).map((s) => s.item);

    const leftEven = leftEvenItems.length ? new paper.CompoundPath({ children: leftEvenItems }) : null;
    const leftOdd = leftOddItems.length ? new paper.CompoundPath({ children: leftOddItems }) : null;
    const rightEven = rightEvenItems.length ? new paper.CompoundPath({ children: rightEvenItems }) : null;
    const rightOdd = rightOddItems.length ? new paper.CompoundPath({ children: rightOddItems }) : null;

    const evenEven = leftEven && rightEven ? leftEven.intersect(rightEven, { insert: false }) : null;
    const oddOdd = leftOdd && rightOdd ? leftOdd.intersect(rightOdd, { insert: false }) : null;

    return {
      checksum: Math.abs(itemArea(evenEven)) + Math.abs(itemArea(oddOdd))
    };
  });
}

function weave_xor_exclude(paper, { leftStrips, rightStrips }) {
  return withInsertItemsDisabled(paper, () => {
    const leftEvenItems = leftStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);
    const rightEvenItems = rightStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);

    const leftEven = leftEvenItems.length ? new paper.CompoundPath({ children: leftEvenItems }) : null;
    const rightEven = rightEvenItems.length ? new paper.CompoundPath({ children: rightEvenItems }) : null;

    // XOR(L_even, R_even) gives odd-parity cells (where strip parity differs).
    const odd = leftEven && rightEven ? leftEven.exclude(rightEven, { insert: false }) : null;
    return { checksum: Math.abs(itemArea(odd)) };
  });
}

function weave_evenoddFill(paper, { leftStrips, rightStrips }) {
  return withInsertItemsDisabled(paper, () => {
    const leftEvenItems = leftStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);
    const rightEvenItems = rightStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);

    // No boolean ops: rely on even-odd fill rule to represent XOR(L_even, R_even).
    // This is a potential fast path for on-canvas rendering.
    const odd = new paper.CompoundPath({ children: [...leftEvenItems, ...rightEvenItems] });
    odd.fillRule = 'evenodd';
    // Area for compound paths doesn't necessarily match even-odd semantics; use bounds as checksum.
    return { checksum: odd.bounds.width + odd.bounds.height };
  });
}

function weave_mask1_mixedCompound(paper, { leftStrips, rightStrips }) {
  return withInsertItemsDisabled(paper, () => {
    const leftEvenItems = leftStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);
    const leftOddItems = leftStrips.filter((s) => s.index % 2 === 1).map((s) => s.item);
    const rightEvenItems = rightStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);
    const rightOddItems = rightStrips.filter((s) => s.index % 2 === 1).map((s) => s.item);

    // (L_odd ∪ R_even) ∩ (L_even ∪ R_odd) === (L_odd ∩ R_odd) ∪ (L_even ∩ R_even)
    // under the assumption that same-lobe strips don't overlap.
    const a = new paper.CompoundPath({ children: [...leftOddItems, ...rightEvenItems] });
    const b = new paper.CompoundPath({ children: [...leftEvenItems, ...rightOddItems] });
    a.fillRule = 'nonzero';
    b.fillRule = 'nonzero';
    // Attempt to avoid winding cancellation when children overlap.
    a.reorient(true, true);
    b.reorient(true, true);

    const mask = a.intersect(b, { insert: false });
    return { checksum: Math.abs(itemArea(mask)) };
  });
}

function weave_mask1_unionThenIntersect(paper, { leftStrips, rightStrips }) {
  return withInsertItemsDisabled(paper, () => {
    const leftEvenItems = leftStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);
    const leftOddItems = leftStrips.filter((s) => s.index % 2 === 1).map((s) => s.item);
    const rightEvenItems = rightStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);
    const rightOddItems = rightStrips.filter((s) => s.index % 2 === 1).map((s) => s.item);

    const leftEven = leftEvenItems.length ? new paper.CompoundPath({ children: leftEvenItems }) : null;
    const leftOdd = leftOddItems.length ? new paper.CompoundPath({ children: leftOddItems }) : null;
    const rightEven = rightEvenItems.length ? new paper.CompoundPath({ children: rightEvenItems }) : null;
    const rightOdd = rightOddItems.length ? new paper.CompoundPath({ children: rightOddItems }) : null;

    // Exact (but more expensive) version of the single-intersection idea:
    // A = unite(L_odd, R_even), B = unite(L_even, R_odd), mask = A ∩ B
    const a = leftOdd && rightEven ? leftOdd.unite(rightEven, { insert: false }) : null;
    const b = leftEven && rightOdd ? leftEven.unite(rightOdd, { insert: false }) : null;
    const mask = a && b ? a.intersect(b, { insert: false }) : null;

    return { checksum: Math.abs(itemArea(mask)) };
  });
}

function weave_cells(paper, { leftStrips, rightStrips }) {
  return withInsertItemsDisabled(paper, () => {
    const evenCells = [];
    const oddCells = [];
    for (const l of leftStrips) {
      for (const r of rightStrips) {
        const cell = l.item.intersect(r.item, { insert: false });
        if (!cell || Math.abs(itemArea(cell)) < 1) continue;
        if (((l.index + r.index) & 1) === 0) evenCells.push(cell);
        else oddCells.push(cell);
      }
    }
    const even = evenCells.length ? new paper.CompoundPath({ children: evenCells }) : null;
    const odd = oddCells.length ? new paper.CompoundPath({ children: oddCells }) : null;
    return { checksum: Math.abs(itemArea(even)) + Math.abs(itemArea(odd)) };
  });
}

function weave_subtractLoop(paper, { leftStrips, rightStrips }) {
  return withInsertItemsDisabled(paper, () => {
    const left = leftStrips.map((s) => ({ index: s.index, item: s.item }));
    const right = rightStrips.map((s) => ({ index: s.index, item: s.item }));

    for (let li = 0; li < left.length; li++) {
      for (let ri = 0; ri < right.length; ri++) {
        const cell = left[li].item.intersect(right[ri].item, { insert: false });
        if (!cell || Math.abs(itemArea(cell)) < 1) continue;

        if (((left[li].index + right[ri].index) & 1) === 0) {
          const next = right[ri].item.subtract(cell, { insert: false });
          right[ri].item = next;
        } else {
          const next = left[li].item.subtract(cell, { insert: false });
          left[li].item = next;
        }
      }
    }

    const checksum =
      left.reduce((sum, s) => sum + Math.abs(itemArea(s.item)), 0) +
      right.reduce((sum, s) => sum + Math.abs(itemArea(s.item)), 0);

    return { checksum };
  });
}

const METHODS = [
  { id: 'mask2', name: 'mask2 (2× intersect)', fn: weave_mask2 },
  { id: 'xor', name: 'xor (1× exclude)', fn: weave_xor_exclude },
  { id: 'evenodd', name: 'evenodd (0× boolean, fillRule)', fn: weave_evenoddFill },
  { id: 'mask1', name: 'mask1 (1× intersect, mixed)', fn: weave_mask1_mixedCompound },
  { id: 'mask1u', name: 'mask1 (2× unite + 1× intersect)', fn: weave_mask1_unionThenIntersect },
  { id: 'cells', name: 'cells (N² intersects)', fn: weave_cells },
  { id: 'subtract', name: 'subtract (N² intersect+subtract)', fn: weave_subtractLoop }
];

function seededRng(seed) {
  // LCG (Numerical Recipes)
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function sampleParityPoints(paper, { overlap, leftStrips, rightStrips }, { samples = 400, seed = 1 } = {}) {
  const rng = seededRng(seed);
  const b = overlap.bounds;

  const points = [];

  while (points.length < samples) {
    const x = b.left + rng() * b.width;
    const y = b.top + rng() * b.height;
    const pt = new paper.Point(x, y);
    if (!overlap.contains(pt)) continue;

    const leftIdx = leftStrips.find((s) => s.item.contains(pt))?.index;
    const rightIdx = rightStrips.find((s) => s.item.contains(pt))?.index;
    if (leftIdx == null || rightIdx == null) continue;

    const expectedOdd = ((leftIdx + rightIdx) & 1) === 1;
    points.push({ pt, expectedOdd });
  }

  return points;
}

function sanityCheckOddMask(paper, inputs, buildOddMask, { samples = 400, seed = 1 } = {}) {
  const points = sampleParityPoints(paper, inputs, { samples, seed });
  const oddMask = buildOddMask(paper, inputs);

  let mismatches = 0;
  let expectedOddCount = 0;
  for (const { pt, expectedOdd } of points) {
    if (expectedOdd) expectedOddCount++;
    const gotOdd = oddMask.contains(pt);
    if (expectedOdd !== gotOdd) mismatches++;
  }

  oddMask.remove();
  return {
    tested: points.length,
    expectedOddFrac: points.length ? expectedOddCount / points.length : 0,
    mismatches,
    mismatchRate: points.length ? mismatches / points.length : 0
  };
}

function sanityCheckEvenMasks(paper, inputs, buildEvenMasks, { samples = 400, seed = 1 } = {}) {
  const points = sampleParityPoints(paper, inputs, { samples, seed });
  const { evenEven, oddOdd } = buildEvenMasks(paper, inputs);

  let mismatches = 0;
  let expectedOddCount = 0;
  for (const { pt, expectedOdd } of points) {
    if (expectedOdd) expectedOddCount++;
    const gotEven = Boolean((evenEven && evenEven.contains(pt)) || (oddOdd && oddOdd.contains(pt)));
    const expectedEven = !expectedOdd;
    if (expectedEven !== gotEven) mismatches++;
  }

  evenEven?.remove();
  oddOdd?.remove();
  return {
    tested: points.length,
    expectedOddFrac: points.length ? expectedOddCount / points.length : 0,
    mismatches,
    mismatchRate: points.length ? mismatches / points.length : 0
  };
}

// --- Benchmark runner --------------------------------------------------------

function runOnce({ gridSize, fingers, ribbonSamples, method }) {
  const paper = new PaperScope();
  paper.setup([CANVAS_SIZE, CANVAS_SIZE]);

  const t0 = now();
  const inputs = buildInputs(paper, gridSize, fingers, ribbonSamples);
  const t1 = now();
  const { checksum } = method.fn(paper, inputs);
  const t2 = now();

  // Best-effort cleanup to reduce GC noise between iterations.
  paper.project.clear();

  return {
    stripsMs: t1 - t0,
    weaveMs: t2 - t1,
    totalMs: t2 - t0,
    checksum
  };
}

function bench({ title, gridSize, fingers, ribbonSamples, warmupIters, iters }) {
  console.log(`\n${title}`);
  console.log(`gridSize=${gridSize}, ribbonSamples=${ribbonSamples}, warmup=${warmupIters}, iters=${iters}`);

  // Quick correctness sanity (area checksum, not pixel-perfect).
  const paperSanity = new PaperScope();
  paperSanity.setup([CANVAS_SIZE, CANVAS_SIZE]);
  const inputsSanity = buildInputs(paperSanity, gridSize, fingers, ribbonSamples);
  const overlapArea = Math.abs(itemArea(inputsSanity.overlap));
  const sanityMask2 = weave_mask2(paperSanity, inputsSanity).checksum;
  const sanityXor = weave_xor_exclude(paperSanity, inputsSanity).checksum;
  paperSanity.project.clear();

  const sanityMask1Mixed = runOnce({ gridSize, fingers, ribbonSamples, method: METHODS[3] }).checksum;
  const sanityMask1Union = runOnce({ gridSize, fingers, ribbonSamples, method: METHODS[4] }).checksum;
  const ratioMixed = sanityMask2 ? sanityMask1Mixed / sanityMask2 : 0;
  const ratioUnion = sanityMask2 ? sanityMask1Union / sanityMask2 : 0;
  console.log(`sanity: mask1(mixed)/mask2 area ratio ≈ ${ratioMixed.toFixed(4)}`);
  console.log(`sanity: mask1(union)/mask2 area ratio ≈ ${ratioUnion.toFixed(4)}`);

  // Fill-rule sanity: compare even-odd mask contains() vs expected parity at random points.
  {
    const paper = new PaperScope();
    paper.setup([CANVAS_SIZE, CANVAS_SIZE]);
    const inputs = buildInputs(paper, gridSize, fingers, ribbonSamples);
    const evenoddCheck = sanityCheckOddMask(
      paper,
      inputs,
      (p, { leftStrips, rightStrips }) => {
        const leftEvenItems = leftStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);
        const rightEvenItems = rightStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);
        return withInsertItemsDisabled(p, () => {
          const odd = new p.CompoundPath({ children: [...leftEvenItems, ...rightEvenItems] });
          odd.fillRule = 'evenodd';
          return odd;
        });
      },
      { samples: 300, seed: 123 }
    );
    paper.project.clear();
    console.log(
      `sanity: evenodd vs parity mismatches ${evenoddCheck.mismatches}/${evenoddCheck.tested} (${(evenoddCheck.mismatchRate * 100).toFixed(2)}%), odd≈${evenoddCheck.expectedOddFrac.toFixed(3)}`
    );
  }

  // XOR boolean sanity: exclude() vs expected parity.
  {
    const paper = new PaperScope();
    paper.setup([CANVAS_SIZE, CANVAS_SIZE]);
    const inputs = buildInputs(paper, gridSize, fingers, ribbonSamples);
    const xorCheck = sanityCheckOddMask(
      paper,
      inputs,
      (p, { leftStrips, rightStrips }) => {
        const leftEvenItems = leftStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);
        const rightEvenItems = rightStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);
        return withInsertItemsDisabled(p, () => {
          const leftEven = leftEvenItems.length ? new p.CompoundPath({ children: leftEvenItems }) : null;
          const rightEven = rightEvenItems.length ? new p.CompoundPath({ children: rightEvenItems }) : null;
          const odd = leftEven && rightEven ? leftEven.exclude(rightEven, { insert: false }) : new p.CompoundPath();
          leftEven?.remove();
          rightEven?.remove();
          return odd;
        });
      },
      { samples: 300, seed: 123 }
    );
    paper.project.clear();
    console.log(
      `sanity: xor(exclude) vs parity mismatches ${xorCheck.mismatches}/${xorCheck.tested} (${(xorCheck.mismatchRate * 100).toFixed(2)}%), odd≈${xorCheck.expectedOddFrac.toFixed(3)}`
    );
  }

  // mask2 sanity: 2× intersect even-masks vs expected parity.
  {
    const paper = new PaperScope();
    paper.setup([CANVAS_SIZE, CANVAS_SIZE]);
    const inputs = buildInputs(paper, gridSize, fingers, ribbonSamples);
    const mask2Check = sanityCheckEvenMasks(
      paper,
      inputs,
      (p, { leftStrips, rightStrips }) => {
        const leftEvenItems = leftStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);
        const leftOddItems = leftStrips.filter((s) => s.index % 2 === 1).map((s) => s.item);
        const rightEvenItems = rightStrips.filter((s) => s.index % 2 === 0).map((s) => s.item);
        const rightOddItems = rightStrips.filter((s) => s.index % 2 === 1).map((s) => s.item);

        return withInsertItemsDisabled(p, () => {
          const leftEven = leftEvenItems.length ? new p.CompoundPath({ children: leftEvenItems }) : null;
          const leftOdd = leftOddItems.length ? new p.CompoundPath({ children: leftOddItems }) : null;
          const rightEven = rightEvenItems.length ? new p.CompoundPath({ children: rightEvenItems }) : null;
          const rightOdd = rightOddItems.length ? new p.CompoundPath({ children: rightOddItems }) : null;

          const evenEven = leftEven && rightEven ? leftEven.intersect(rightEven, { insert: false }) : null;
          const oddOdd = leftOdd && rightOdd ? leftOdd.intersect(rightOdd, { insert: false }) : null;

          leftEven?.remove();
          leftOdd?.remove();
          rightEven?.remove();
          rightOdd?.remove();

          return { evenEven, oddOdd };
        });
      },
      { samples: 300, seed: 123 }
    );
    paper.project.clear();
    console.log(
      `sanity: mask2 vs parity mismatches ${mask2Check.mismatches}/${mask2Check.tested} (${(mask2Check.mismatchRate * 100).toFixed(2)}%), odd≈${mask2Check.expectedOddFrac.toFixed(3)}`
    );
  }

  const rows = [];

  for (const method of METHODS) {
    for (let i = 0; i < warmupIters; i++) {
      runOnce({ gridSize, fingers, ribbonSamples, method });
    }
    if (global.gc) global.gc();

    const strips = [];
    const weave = [];
    const total = [];
    let checksumAcc = 0;

    for (let i = 0; i < iters; i++) {
      const r = runOnce({ gridSize, fingers, ribbonSamples, method });
      strips.push(r.stripsMs);
      weave.push(r.weaveMs);
      total.push(r.totalMs);
      checksumAcc += r.checksum || 0;
      if (global.gc) global.gc();
    }

    rows.push({
      name: method.name,
      strips: summarize(strips),
      weave: summarize(weave),
      total: summarize(total),
      checksumAcc
    });
  }

  const pad = (s, w) => String(s).padEnd(w, ' ');
  const nameW = Math.max(...rows.map((r) => r.name.length)) + 2;

  console.log(
    `${pad('Method', nameW)}  total mean/p95   weave mean/p95   strips mean/p95`
  );
  for (const r of rows) {
    console.log(
      `${pad(r.name, nameW)}  ${pad(`${fmt(r.total.mean)}/${fmt(r.total.p95)}`, 14)}  ${pad(`${fmt(r.weave.mean)}/${fmt(r.weave.p95)}`, 14)}  ${pad(`${fmt(r.strips.mean)}/${fmt(r.strips.p95)}`, 14)}`
    );
  }
}

function main() {
  const gridSize = Number(process.env.GRID ?? 8);
  const ribbonSamples = clamp(Number(process.env.SAMPLES ?? 60), 8, 200);
  const warmupIters = clamp(Number(process.env.WARMUP ?? 3), 0, 50);
  const iters = clamp(Number(process.env.ITERS ?? 15), 1, 200);

  const designs = [
    {
      title: 'Design: default cubic boundaries',
      fingers: createDefaultFingers(gridSize)
    },
    {
      title: 'Design: wavy polyline boundaries (24 segments)',
      fingers: createWavyPolylineFingers(gridSize, { segments: 24, amplitude: 12, frequency: 2 })
    }
  ];

  console.log('Weave benchmark (Paper.js boolean ops)');
  console.log(`Tip: run with \`node --expose-gc scripts/bench-weave.mjs\` for more stable numbers.`);

  for (const d of designs) {
    bench({
      title: d.title,
      gridSize,
      fingers: d.fingers,
      ribbonSamples,
      warmupIters,
      iters
    });
  }
}

main();
