/**
 * The inverse engine's cut geometry → one of our hearts.
 *
 * The engine answers with `cut_geometry.json` (schema `heartcurves-2`): a square
 * of `square_width_mm`, a colour `phase`, and two families of cuts. Every cut is
 * a chain of short cubics running edge to edge — family A from y=0 to y=w with x
 * varying, family B from x=0 to x=w with y varying.
 *
 * ## The frame
 *
 * Our overlap rectangle uses the same axes: left-lobe fingers are horizontal
 * (they run between x=0 and x=100, their position is y), right-lobe fingers are
 * vertical. So engine A (vertical) becomes our **right** lobe, engine B
 * (horizontal) our **left** lobe, coordinates scale by `100 / square_width_mm`,
 * and nothing is mirrored or transposed. `toHeartDesign.test.ts` proves it on
 * `jul.saved.json`, which is asymmetric under both a mirror and a transpose, by
 * comparing our raster with the engine's own `sampleWeave`.
 *
 * ## The weaveParity rule: `weaveParity = phase`
 *
 * Write c for the number of A cuts to the left of a point and d for the number
 * of B cuts above it.
 *
 * - The engine (`core/validate.js`) closes each A cut into a ring
 *   (0,0) → cut → (0,w) → (0,0), which encloses the square *left* of the cut,
 *   and each B cut into (0,0) → cut → (w,0) → (0,0), enclosing what is *above*
 *   it. `sampleRings` then fills them even-odd starting from a phase of
 *   `phase ^ (nA % 2) ^ (nB % 2)`. Counting crossings from x = −∞ counts the
 *   cuts on the far side, and `nA − c ≡ nA + c (mod 2)`, so those two count
 *   terms cancel the two `% 2` terms exactly: the engine's cell is
 *   **`phase ^ c ^ d`**.
 * - Ours (`$lib/rendering/svgWeave`): the right lobe's fingers are the A cuts
 *   plus the two x edges, so a point with c A cuts to its left sits in right
 *   strip number c, which is drawn only when `c ≡ weaveParity (mod 2)`; the
 *   left lobe's fingers are the B cuts plus the two y edges, and its strip d is
 *   drawn when d is even. The even-odd union of the two gives
 *   **`c + d + weaveParity (mod 2)`**.
 *
 * Equal for every cell exactly when `weaveParity = phase`. The path counts drop
 * out — they only appear in the engine's own expression because its rings count
 * from the opposite side of the square.
 */

import type { Finger, HeartColors, HeartDesign, LobeId, NodeType } from '$lib/types/heart';
import type { BezierSegment } from '$lib/geometry/bezierSegments';
import { reverseSegments, segmentsToPathData } from '$lib/geometry/bezierSegments';
import { normalizeHeartDesign } from '$lib/utils/heartDesign';
import {
  mapPointBetweenLobes,
  mapPointWithinLobe,
  mapSegments,
  pointReflectAcrossMidpoint,
  reflectAcrossChordBisector
} from '$lib/utils/symmetry';
import { MAX_GRID_SIZE } from '$lib/constants';
import { FIT_TOLERANCE, simplifyCubicChain } from '$lib/inverse/simplifyCurves';

/** One cut's ordered reference into `curves`; `reverse` runs the cubic backwards. */
export type CutReference = { curve: string; reverse: boolean };

/** The engine's saved solution, schema `heartcurves-2`. */
export type CutGeometry = {
  schema?: string;
  units?: string;
  square_width_mm: number;
  phase: 0 | 1;
  paper_colors?: string[];
  curves: Record<string, { control_points: number[][]; visible_boundary?: boolean }>;
  /** Vertical cuts, y = 0 → y = w. Our right lobe. */
  A_overlap_paths: CutReference[][];
  /** Horizontal cuts, x = 0 → x = w. Our left lobe. */
  B_overlap_paths: CutReference[][];
};

/** Message keys the paint UI can translate; the `message` is for the console. */
export type CutGeometryErrorKey =
  | 'paintErrorGeometrySchema'
  | 'paintErrorGeometryCurves'
  | 'paintErrorTooManyCuts'
  | 'paintErrorTooFewCuts'
  | 'paintErrorOpenCut';

export class CutGeometryError extends Error {
  constructor(
    readonly key: CutGeometryErrorKey,
    message: string
  ) {
    super(message);
    this.name = 'CutGeometryError';
  }
}

export type SymmetryMode = 'off' | 'sym' | 'anti';
/**
 * The editor's three symmetry rows: Inden i kurve, Inden i lap, Mellem lapper.
 * Mirrors the type the paint session store carries.
 */
export type SymmetrySettings = { curve: SymmetryMode; lobe: SymmetryMode; lobes: SymmetryMode };

export type CutGeometryOptions = {
  name: string;
  author?: string;
  colors?: HeartColors;
  enforce?: SymmetrySettings;
  /** Fitting tolerance in the 0–100 frame, in millimetres on a 100 mm square. */
  tolerance?: number;
};

/** How far an endpoint may sit from its square edge, in the 0–100 frame. */
const EDGE_TOLERANCE = 0.05;

/** Distance under which two chained cubics count as touching, in the 0–100 frame. */
const JOIN_TOLERANCE = 0.5;

/** The 0–100 frame's far edge; the near edge is 0. */
const SPAN = 100;

/**
 * Fingers per lobe our grid can hold. Above this the design would be silently
 * clamped to `MAX_GRID_SIZE` and lose cuts, so it is refused instead. It counts
 * the two square edges, which `normalizeHeartDesign` adds, so the engine may
 * hand us at most `MAX_GRID_SIZE - 1` cuts per family.
 */
const MAX_FINGERS_PER_LOBE = MAX_GRID_SIZE + 1;

type Pt = { x: number; y: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function parseCutGeometry(json: string | CutGeometry): CutGeometry {
  let data: unknown = json;
  if (typeof json === 'string') {
    try {
      data = JSON.parse(json);
    } catch {
      throw new CutGeometryError('paintErrorGeometrySchema', 'Cut geometry is not valid JSON.');
    }
  }
  if (!isRecord(data)) {
    throw new CutGeometryError('paintErrorGeometrySchema', 'Cut geometry is not an object.');
  }
  const g = data as unknown as CutGeometry;
  if (g.schema !== undefined && g.schema !== 'heartcurves-2') {
    throw new CutGeometryError('paintErrorGeometrySchema', `Unsupported schema ${String(g.schema)}.`);
  }
  if (!Number.isFinite(g.square_width_mm) || g.square_width_mm <= 0) {
    throw new CutGeometryError('paintErrorGeometrySchema', 'Cut geometry has no square width.');
  }
  if (g.phase !== 0 && g.phase !== 1) {
    throw new CutGeometryError('paintErrorGeometrySchema', 'Cut geometry has no colour phase.');
  }
  if (!isRecord(g.curves) || !Array.isArray(g.A_overlap_paths) || !Array.isArray(g.B_overlap_paths)) {
    throw new CutGeometryError('paintErrorGeometrySchema', 'Cut geometry has no cut families.');
  }
  return g;
}

/** Resolve one cut into a continuous chain of cubics, scaled into the 0–100 frame. */
function resolveChain(geometry: CutGeometry, cut: CutReference[], scale: number, label: string): BezierSegment[] {
  if (!Array.isArray(cut) || !cut.length) {
    throw new CutGeometryError('paintErrorGeometryCurves', `${label} is empty.`);
  }
  const segments: BezierSegment[] = [];
  for (const ref of cut) {
    const curve = isRecord(ref) ? geometry.curves[String(ref.curve)] : undefined;
    const controls = curve?.control_points;
    if (!Array.isArray(controls) || controls.length !== 4) {
      throw new CutGeometryError('paintErrorGeometryCurves', `${label} references an unusable curve.`);
    }
    const points = controls.map((p) => {
      if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
        throw new CutGeometryError('paintErrorGeometryCurves', `${label} has a non-numeric control point.`);
      }
      return { x: p[0]! * scale, y: p[1]! * scale };
    });
    if (ref.reverse) points.reverse();
    segments.push({ p0: points[0]!, p1: points[1]!, p2: points[2]!, p3: points[3]! });
  }
  // The engine hands the cubics back in order; a gap would mean we read the
  // reverse flags wrong, and silently drawing through it would be worse.
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1]!.p3;
    const next = segments[i]!.p0;
    if (Math.hypot(prev.x - next.x, prev.y - next.y) > JOIN_TOLERANCE) {
      throw new CutGeometryError('paintErrorGeometryCurves', `${label} is not continuous at cubic ${i}.`);
    }
    // Weld the joint so the chain is exactly continuous for the fitter.
    segments[i]!.p0 = { ...prev };
  }
  return segments;
}

function nearEdge(value: number, edge: number): boolean {
  return Math.abs(value - edge) <= EDGE_TOLERANCE;
}

/**
 * Turn one cut into a finger in our canonical direction.
 *
 * `axis` is the coordinate the cut crosses the square in: 'y' for family A
 * (our right lobe), 'x' for family B (our left lobe). Canonical fingers start at
 * the far edge (y=100 for the right lobe, x=100 for the left) and end at 0, so a
 * cut that runs the other way is reversed here rather than by
 * `normalizeHeartDesign`, which would have to guess.
 */
function orientChain(segments: BezierSegment[], axis: 'x' | 'y', label: string): BezierSegment[] {
  const start = segments[0]!.p0;
  const end = segments[segments.length - 1]!.p3;
  const s = axis === 'x' ? start.x : start.y;
  const e = axis === 'x' ? end.x : end.y;
  if (nearEdge(s, SPAN) && nearEdge(e, 0)) return segments;
  if (nearEdge(s, 0) && nearEdge(e, SPAN)) return reverseSegments(segments);
  throw new CutGeometryError(
    'paintErrorOpenCut',
    `${label} does not run from edge to edge (${axis} ${s.toFixed(3)} → ${e.toFixed(3)}).`
  );
}

/** Pin the crossing coordinate of both endpoints exactly onto the square's edges. */
function snapToEdges(segments: BezierSegment[], axis: 'x' | 'y'): void {
  const first = segments[0]!;
  const last = segments[segments.length - 1]!;
  if (axis === 'x') {
    first.p0 = { x: SPAN, y: first.p0.y };
    last.p3 = { x: 0, y: last.p3.y };
  } else {
    first.p0 = { x: first.p0.x, y: SPAN };
    last.p3 = { x: last.p3.x, y: 0 };
  }
}

// ============================================================================
// Symmetry enforcement
// ============================================================================
//
// The mappings are imported from `$lib/utils/symmetry.ts`, the very file the
// draw page's `detectSymmetryModes` measures against, so an enforced heart
// lights up the same three rows when the visitor opens it in Tegn. Two copies of
// a reflection are two things to keep in step; there is one. The maps take their
// bounds as an argument, so they work in our 0–100 frame as well as in the
// editor's pixel frame — `normalizeHeartDesign` only scales and translates
// afterwards, and a reflection survives that untouched.

/** The 0–100 frame as the symmetry maps want it: the whole woven square. */
const SQUARE: { minX: number; maxX: number; minY: number; maxY: number; size: number } = {
  minX: 0,
  maxX: SPAN,
  minY: 0,
  maxY: SPAN,
  size: SPAN
};

/**
 * The midpoint of two chains, cubic for cubic.
 *
 * Every caller passes a chain and a map of that same chain, and `mapSegments`
 * preserves length exactly, so unequal lengths mean a bug in here rather than
 * bad input from the engine — hence a plain Error, not a `CutGeometryError`.
 */
function averageSegments(a: BezierSegment[], b: BezierSegment[]): BezierSegment[] {
  if (a.length !== b.length) {
    throw new Error(`Cannot average chains of ${a.length} and ${b.length} cubics.`);
  }
  const mid = (p: Pt, q: Pt): Pt => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  return a.map((s, i) => ({
    p0: mid(s.p0, b[i]!.p0),
    p1: mid(s.p1, b[i]!.p1),
    p2: mid(s.p2, b[i]!.p2),
    p3: mid(s.p3, b[i]!.p3)
  }));
}

/** Make one cut symmetric about its own middle (Inden i kurve). */
function enforceWithinCurve(segments: BezierSegment[], anti: boolean): BezierSegment[] {
  const start = segments[0]!.p0;
  const end = segments[segments.length - 1]!.p3;
  const mate = (p: Pt) =>
    anti ? pointReflectAcrossMidpoint(start, end, p) : reflectAcrossChordBisector(start, end, p);
  return averageSegments(segments, mapSegments(segments, mate, true));
}

/**
 * Make a lobe's cuts symmetric as a set (Inden i lap).
 *
 * Cuts come in sorted, so cut i pairs with cut n−1−i; the first half is copied
 * onto the second, and an odd middle cut is folded onto itself. Copying rather
 * than averaging keeps this working after simplification, where two partner
 * cuts may have ended up with different numbers of cubics.
 */
function enforceWithinLobe(cuts: BezierSegment[][], lobe: LobeId, anti: boolean): BezierSegment[][] {
  const map = (p: Pt) => mapPointWithinLobe(SQUARE, lobe, p, anti);
  const out = cuts.map((c) => c);
  const n = cuts.length;
  for (let i = 0; i < n; i++) {
    const j = n - 1 - i;
    if (i < j) out[j] = mapSegments(out[i]!, map, anti);
    else if (i === j) out[i] = averageSegments(out[i]!, mapSegments(out[i]!, map, anti));
  }
  return out;
}

function applyEnforcement(
  leftCuts: BezierSegment[][],
  rightCuts: BezierSegment[][],
  enforce: SymmetrySettings
): { left: BezierSegment[][]; right: BezierSegment[][] } {
  let left = leftCuts;
  let right = rightCuts;

  if (enforce.curve !== 'off') {
    const anti = enforce.curve === 'anti';
    left = left.map((c) => enforceWithinCurve(c, anti));
    right = right.map((c) => enforceWithinCurve(c, anti));
  }

  if (enforce.lobe !== 'off') {
    const anti = enforce.lobe === 'anti';
    left = enforceWithinLobe(left, 'left', anti);
    right = enforceWithinLobe(right, 'right', anti);
  }

  // Only meaningful when the lobes have equally many cuts; the engine can answer
  // with different counts, and then this row simply stays off.
  if (enforce.lobes !== 'off' && left.length === right.length) {
    const anti = enforce.lobes === 'anti';
    right = left.map((c) => mapSegments(c, (p) => mapPointBetweenLobes(SQUARE, p, anti), anti));
  }

  return { left, right };
}

// ============================================================================

function nodeTypesFor(count: number): Record<string, NodeType> {
  const nodeTypes: Record<string, NodeType> = { '0': 'corner', [String(count)]: 'corner' };
  for (let i = 1; i < count; i++) nodeTypes[String(i)] = 'smooth';
  return nodeTypes;
}

function toRawFinger(segments: BezierSegment[], lobe: LobeId, index: number) {
  return {
    id: `${lobe === 'left' ? 'L' : 'R'}-cut-${index}`,
    lobe,
    pathData: segmentsToPathData(segments),
    nodeTypes: nodeTypesFor(segments.length)
  };
}

/** Position of a canonical finger along the axis it is stacked on. */
function fingerPosition(segments: BezierSegment[], lobe: LobeId): number {
  const p = segments[0]!.p0;
  return lobe === 'left' ? p.y : p.x;
}

/**
 * Convert the engine's cut geometry into a heart the editor can open.
 *
 * The output is built as raw 0–100 JSON fingers and handed to
 * `normalizeHeartDesign`, which adds the four square edges as fingers, fixes the
 * grid size and moves everything into the editor's pixel frame — the same road
 * every saved heart travels, so nothing here can drift from it.
 */
export function cutGeometryToDesign(json: string | CutGeometry, opts: CutGeometryOptions): HeartDesign {
  const geometry = parseCutGeometry(json);
  const scale = SPAN / geometry.square_width_mm;

  const families: Array<{ paths: CutReference[][]; lobe: LobeId; axis: 'x' | 'y'; label: string }> = [
    { paths: geometry.A_overlap_paths, lobe: 'right', axis: 'y', label: 'A' },
    { paths: geometry.B_overlap_paths, lobe: 'left', axis: 'x', label: 'B' }
  ];

  const byLobe: Record<LobeId, BezierSegment[][]> = { left: [], right: [] };
  for (const family of families) {
    if (family.paths.length < 1) {
      throw new CutGeometryError(
        'paintErrorTooFewCuts',
        `Family ${family.label} has no cuts; a heart needs at least one per side.`
      );
    }
    if (family.paths.length + 2 > MAX_FINGERS_PER_LOBE) {
      throw new CutGeometryError(
        'paintErrorTooManyCuts',
        `Family ${family.label} has ${family.paths.length} cuts; at most ${MAX_FINGERS_PER_LOBE - 2} fit our ${MAX_GRID_SIZE}-strip grid.`
      );
    }
    const cuts = family.paths.map((cut, i) => {
      const label = `Family ${family.label} cut ${i}`;
      const chain = orientChain(resolveChain(geometry, cut, scale, label), family.axis, label);
      const simplified = simplifyCubicChain(chain, opts.tolerance ?? FIT_TOLERANCE);
      snapToEdges(simplified, family.axis);
      return simplified;
    });
    cuts.sort((a, b) => fingerPosition(a, family.lobe) - fingerPosition(b, family.lobe));
    byLobe[family.lobe] = cuts;
  }

  const { left, right } = opts.enforce
    ? applyEnforcement(byLobe.left, byLobe.right, opts.enforce)
    : { left: byLobe.left, right: byLobe.right };

  const paperColors = geometry.paper_colors;
  const colors =
    opts.colors ??
    (Array.isArray(paperColors) && typeof paperColors[0] === 'string' && typeof paperColors[1] === 'string'
      ? // The engine's pair is [A, B] and A is the right lobe.
        { right: paperColors[0], left: paperColors[1] }
      : undefined);

  const design = normalizeHeartDesign({
    id: '',
    name: opts.name,
    author: opts.author ?? '',
    weaveParity: geometry.phase,
    gridSize: { x: right.length + 1, y: left.length + 1 },
    colors,
    fingers: [
      ...left.map((segments, i) => toRawFinger(segments, 'left', i)),
      ...right.map((segments, i) => toRawFinger(segments, 'right', i))
    ]
  });

  if (!design) {
    throw new CutGeometryError('paintErrorGeometryCurves', 'The converted cuts did not make a heart.');
  }
  return design;
}

/** Cubics per cut after conversion, for the report and the tests. */
export function segmentsPerCut(design: HeartDesign): { fingers: Finger[]; average: number } {
  // Only the cuts the engine solved for; the four square edges are straight
  // fingers `normalizeHeartDesign` added, and nobody has to cut those.
  const cuts = design.fingers.filter((f) => f.id.startsWith('L-cut-') || f.id.startsWith('R-cut-'));
  const total = cuts.reduce((sum, f) => sum + f.segments.length, 0);
  return { fingers: cuts, average: cuts.length ? total / cuts.length : 0 };
}
