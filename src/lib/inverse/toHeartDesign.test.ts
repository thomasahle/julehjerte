import { describe, it, expect } from 'vitest';
import { detectSymmetryModes } from '$lib/utils/symmetry';
import { rasterizeDesign, maskMismatch } from '$lib/paint/rasterize';
import {
  convertCutGeometry,
  cutGeometryToDesign,
  CutGeometryError,
  segmentsPerCut,
  type CutGeometry,
  type CutReference
} from '$lib/inverse/toHeartDesign';
// Plain ESM straight out of the shipped engine. `$inverse` is the vitest alias
// for static/inverse; see src/lib/inverse/engine-modules.d.ts for why the tests
// do not reach it by relative path the way `presets.js` reaches the presets.
import { loadSolutionJSON } from '$inverse/core/graph.js';
import { sampleWeave } from '$inverse/core/validate.js';
import starSolution from '../../../static/inverse/examples/star.saved.json';
import julSolution from '../../../static/inverse/examples/jul.saved.json';

const EXAMPLES: Record<'star' | 'jul', CutGeometry> = {
  star: starSolution as unknown as CutGeometry,
  jul: julSolution as unknown as CutGeometry
};

/** Sample grid for every comparison against the engine. */
const N = 200;

/** The engine's own picture of the woven square: 0 = left paper, 1 = right. */
function engineMask(geometry: CutGeometry, n = N): Uint8Array {
  // loadSolutionJSON keeps a reference to what it is given, so hand it a copy.
  const solution = loadSolutionJSON(JSON.parse(JSON.stringify(geometry)));
  return sampleWeave(solution, n) as Uint8Array;
}

function ourMask(geometry: CutGeometry, opts: { tolerance?: number } = {}, n = N): Uint8Array {
  const design = cutGeometryToDesign(geometry, { name: 'test', tolerance: opts.tolerance });
  return rasterizeDesign(design, n).data;
}

function transpose(mask: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[y * n + x] = mask[x * n + y]!;
  return out;
}

function mirrorX(mask: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[y * n + x] = mask[y * n + (n - 1 - x)]!;
  return out;
}

/** A straight cut as one cubic, control points a third and two thirds along. */
function straightCut(from: [number, number], to: [number, number]): number[][] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return [
    [from[0], from[1]],
    [from[0] + dx / 3, from[1] + dy / 3],
    [from[0] + (2 * dx) / 3, from[1] + (2 * dy) / 3],
    [to[0], to[1]]
  ];
}

/** A hand-built solution: `aXs` vertical cuts, `bYs` horizontal ones. */
function syntheticGeometry(aXs: number[], bYs: number[], phase: 0 | 1, w = 100): CutGeometry {
  const curves: CutGeometry['curves'] = {};
  const A: CutReference[][] = [];
  const B: CutReference[][] = [];
  let next = 0;
  for (const x of aXs) {
    const id = String(next++);
    curves[id] = { control_points: straightCut([x, 0], [x, w]), visible_boundary: true };
    A.push([{ curve: id, reverse: false }]);
  }
  for (const y of bYs) {
    const id = String(next++);
    curves[id] = { control_points: straightCut([0, y], [w, y]), visible_boundary: true };
    B.push([{ curve: id, reverse: false }]);
  }
  return {
    schema: 'heartcurves-2',
    units: 'mm',
    square_width_mm: w,
    phase,
    curves,
    A_overlap_paths: A,
    B_overlap_paths: B
  };
}

describe('cutGeometryToDesign', () => {
  describe('the frame', () => {
    for (const name of ['star', 'jul'] as const) {
      it(`reproduces the engine's own weave for ${name}`, () => {
        const mismatch = maskMismatch(ourMask(EXAMPLES[name], { tolerance: 0 }), engineMask(EXAMPLES[name]));
        expect(mismatch).toBeLessThan(0.015);
      });
    }

    it('is not accidentally right: JUL disagrees loudly under a mirror or a transpose', () => {
      // JUL spells a word, so it is asymmetric under both. Had the converter
      // swapped the two families or flipped an axis, the comparison above would
      // have failed; this is the other half of that proof.
      const ours = ourMask(EXAMPLES.jul, { tolerance: 0 });
      const theirs = engineMask(EXAMPLES.jul);
      expect(maskMismatch(transpose(ours, N), theirs)).toBeGreaterThan(0.1);
      expect(maskMismatch(mirrorX(ours, N), theirs)).toBeGreaterThan(0.1);
    });

    it('puts family A on the right lobe and family B on the left', () => {
      const design = cutGeometryToDesign(EXAMPLES.jul, { name: 'jul', tolerance: 0 });
      const { fingers } = segmentsPerCut(design);
      expect(fingers.filter((f) => f.lobe === 'right')).toHaveLength(EXAMPLES.jul.A_overlap_paths.length);
      expect(fingers.filter((f) => f.lobe === 'left')).toHaveLength(EXAMPLES.jul.B_overlap_paths.length);
      expect(design.gridSize).toEqual({ x: 5, y: 5 });
    });

    it('scales by 100 / square_width_mm and keeps the cuts edge to edge', () => {
      // The same star at half the size must convert to the very same heart.
      const half = JSON.parse(JSON.stringify(EXAMPLES.star)) as CutGeometry;
      half.square_width_mm = 50;
      for (const curve of Object.values(half.curves)) {
        curve.control_points = curve.control_points.map((p) => [p[0]! / 2, p[1]! / 2]);
      }
      expect(maskMismatch(ourMask(half, { tolerance: 0 }), ourMask(EXAMPLES.star, { tolerance: 0 }))).toBe(0);
    });
  });

  describe('weaveParity', () => {
    it('takes the engine phase unchanged', () => {
      for (const name of ['star', 'jul'] as const) {
        const design = cutGeometryToDesign(EXAMPLES[name], { name, tolerance: 0 });
        expect(design.weaveParity).toBe(EXAMPLES[name].phase);
      }
    });

    // One A cut and two B cuts make the counts odd/even, so the rule
    // `weaveParity = phase` and the engine sampler's own start value
    // `phase ^ (nA % 2) ^ (nB % 2)` disagree. Both phases are checked, so
    // picking either the wrong rule or a constant fails here.
    for (const phase of [0, 1] as const) {
      it(`matches the engine with odd cut counts at phase ${phase}`, () => {
        const geometry = syntheticGeometry([30], [25, 70], phase);
        const design = cutGeometryToDesign(geometry, { name: 'synthetic', tolerance: 0 });
        expect(design.weaveParity).toBe(phase);
        expect(maskMismatch(rasterizeDesign(design, 100).data, engineMask(geometry, 100))).toBe(0);
      });
    }

    it('would not match with the other parity', () => {
      const geometry = syntheticGeometry([30], [25, 70], 0);
      const design = cutGeometryToDesign(geometry, { name: 'synthetic', tolerance: 0 });
      const flipped = { ...design, weaveParity: 1 as const };
      expect(maskMismatch(rasterizeDesign(flipped, 100).data, engineMask(geometry, 100))).toBeGreaterThan(0.1);
    });

    it('agrees with the engine at either phase of either example', () => {
      // Both saved examples carry phase 0, so flipping it is the only way to see
      // the rule work on real geometry rather than on hand-built straight cuts.
      for (const name of ['star', 'jul'] as const) {
        for (const phase of [0, 1] as const) {
          const geometry = { ...EXAMPLES[name], phase };
          expect(maskMismatch(ourMask(geometry, { tolerance: 0 }), engineMask(geometry))).toBeLessThan(0.015);
        }
      }
    });
  });

  describe('simplification', () => {
    it('costs well under a point of fidelity at the default tolerance', () => {
      for (const name of ['star', 'jul'] as const) {
        const theirs = engineMask(EXAMPLES[name]);
        const raw = maskMismatch(ourMask(EXAMPLES[name], { tolerance: 0 }), theirs);
        const fitted = maskMismatch(ourMask(EXAMPLES[name]), theirs);
        // Measured at FIT_TOLERANCE 0.25: star +0.62 points, jul +0.42.
        expect(fitted).toBeLessThanOrEqual(raw + 0.007);
        expect(fitted).toBeLessThan(0.015);
      }
    });

    it('holds the half-point growth the tolerance is scaled for', () => {
      // Refitting costs area roughly in proportion to the tolerance — about
      // three points of the woven square per unit — so this is what pins the
      // default. Asked for a finer fit, the fitter delivers it.
      for (const name of ['star', 'jul'] as const) {
        const theirs = engineMask(EXAMPLES[name]);
        const raw = maskMismatch(ourMask(EXAMPLES[name], { tolerance: 0 }), theirs);
        const fitted = maskMismatch(ourMask(EXAMPLES[name], { tolerance: 0.15 }), theirs);
        expect(fitted).toBeLessThanOrEqual(raw + 0.005);
      }
    });

    it('roughly halves the cubics per cut, which is near the corner floor', () => {
      // The star's cuts turn hard — 67 corners over 25° across the eight of
      // them — and a corner always costs its own cubic, so about nine per cut is
      // the floor no tolerance gets under. `sharpTurns` below measures it.
      const before = segmentsPerCut(cutGeometryToDesign(EXAMPLES.star, { name: 'star', tolerance: 0 }));
      const after = segmentsPerCut(cutGeometryToDesign(EXAMPLES.star, { name: 'star' }));
      expect(before.average).toBeGreaterThan(20);
      expect(after.average).toBeLessThan(before.average * 0.6);
      expect(after.average).toBeLessThanOrEqual(12);
    });

    it('cannot go below the corners the engine cut', () => {
      const design = cutGeometryToDesign(EXAMPLES.star, { name: 'star', tolerance: 4 });
      const { average } = segmentsPerCut(design);
      // Even at an absurd 4 mm tolerance the corners keep the count up, so the
      // node count is a property of the engine's answer, not of our fitting.
      expect(average).toBeGreaterThan(4);
    });

    it('keeps the endpoints of every cut on the square edges', () => {
      const design = cutGeometryToDesign(EXAMPLES.jul, { name: 'jul' });
      for (const finger of design.fingers) {
        const first = finger.segments[0]!;
        const last = finger.segments[finger.segments.length - 1]!;
        if (finger.lobe === 'left') {
          expect(first.p0.x).toBeCloseTo(487.5, 6);
          expect(last.p3.x).toBeCloseTo(112.5, 6);
        } else {
          expect(first.p0.y).toBeCloseTo(487.5, 6);
          expect(last.p3.y).toBeCloseTo(112.5, 6);
        }
      }
    });
  });

  describe('node types', () => {
    it('marks the fitted joints smooth and the endpoints corners', () => {
      const design = cutGeometryToDesign(EXAMPLES.star, { name: 'star' });
      const { fingers } = segmentsPerCut(design);
      expect(fingers.length).toBeGreaterThan(0);
      for (const finger of fingers) {
        const n = finger.segments.length;
        expect(finger.nodeTypes?.['0']).toBe('corner');
        expect(finger.nodeTypes?.[String(n)]).toBe('corner');
        for (let i = 1; i < n; i++) expect(finger.nodeTypes?.[String(i)]).toBe('smooth');
      }
    });
  });

  describe('rejections', () => {
    it('refuses more cuts than the grid can hold', () => {
      const tooMany = Array.from({ length: 12 }, (_, i) => 5 + i * 7);
      expect(() => cutGeometryToDesign(syntheticGeometry(tooMany, [50], 0), { name: 'x' })).toThrow(
        CutGeometryError
      );
      try {
        cutGeometryToDesign(syntheticGeometry(tooMany, [50], 0), { name: 'x' });
      } catch (error) {
        expect((error as CutGeometryError).key).toBe('paintErrorTooManyCuts');
      }
      // One fewer fills the 12-strip grid exactly and is accepted.
      const design = cutGeometryToDesign(syntheticGeometry(tooMany.slice(1), [50], 0), { name: 'x' });
      expect(design.gridSize.x).toBe(12);
    });

    it('refuses a family with no cuts at all', () => {
      try {
        cutGeometryToDesign(syntheticGeometry([], [50], 0), { name: 'x' });
        expect.unreachable();
      } catch (error) {
        expect((error as CutGeometryError).key).toBe('paintErrorTooFewCuts');
      }
    });

    it('refuses a cut that stops short of the opposite edge', () => {
      const geometry = syntheticGeometry([30], [50], 0);
      const id = Object.keys(geometry.curves)[0]!;
      geometry.curves[id]!.control_points = straightCut([30, 0], [30, 50]);
      try {
        cutGeometryToDesign(geometry, { name: 'x' });
        expect.unreachable();
      } catch (error) {
        expect((error as CutGeometryError).key).toBe('paintErrorOpenCut');
      }
    });

    it('refuses geometry it cannot read', () => {
      try {
        cutGeometryToDesign('{ not json', { name: 'x' });
        expect.unreachable();
      } catch (error) {
        expect((error as CutGeometryError).key).toBe('paintErrorGeometrySchema');
      }
      try {
        cutGeometryToDesign({ ...syntheticGeometry([30], [50], 0), schema: 'heartcurves-1' }, { name: 'x' });
        expect.unreachable();
      } catch (error) {
        expect((error as CutGeometryError).key).toBe('paintErrorGeometrySchema');
      }
    });

    it('refuses a cut whose cubics do not join up', () => {
      const geometry = syntheticGeometry([30], [50], 0);
      geometry.curves['a'] = { control_points: straightCut([30, 0], [30, 40]), visible_boundary: true };
      geometry.curves['b'] = { control_points: straightCut([70, 60], [30, 100]), visible_boundary: true };
      geometry.A_overlap_paths = [[{ curve: 'a', reverse: false }, { curve: 'b', reverse: false }]];
      try {
        cutGeometryToDesign(geometry, { name: 'x' });
        expect.unreachable();
      } catch (error) {
        expect((error as CutGeometryError).key).toBe('paintErrorGeometryCurves');
      }
    });

    it('reads the reverse flags: a reversed chain converts to the same heart', () => {
      const geometry = JSON.parse(JSON.stringify(EXAMPLES.star)) as CutGeometry;
      geometry.A_overlap_paths = geometry.A_overlap_paths.map((cut) =>
        cut.map((ref) => ({ ...ref, reverse: !ref.reverse })).reverse()
      );
      expect(maskMismatch(ourMask(geometry, { tolerance: 0 }), ourMask(EXAMPLES.star, { tolerance: 0 }))).toBe(0);
    });
  });

  describe('enforce', () => {
    it('makes the star exactly symmetric on all three rows', () => {
      const design = cutGeometryToDesign(EXAMPLES.star, {
        name: 'star',
        enforce: { curve: 'sym', lobe: 'sym', lobes: 'sym' }
      });
      expect(detectSymmetryModes(design.fingers)).toEqual({
        withinCurveMode: 'sym',
        withinLobeMode: 'sym',
        betweenLobesMode: 'sym'
      });
    });

    // One row at a time: a half turn within the lobe and an anti-transpose
    // between them compose into a plain transpose, and the draw page reports the
    // plainer name, so all three together cannot tell the anti mappings apart.
    const antiRows = [
      ['curve', 'withinCurveMode'],
      ['lobe', 'withinLobeMode'],
      ['lobes', 'betweenLobesMode']
    ] as const;
    for (const [row, mode] of antiRows) {
      it(`reports ${row} anti when only that row is enforced`, () => {
        const design = cutGeometryToDesign(EXAMPLES.jul, {
          name: 'jul',
          enforce: { curve: 'off', lobe: 'off', lobes: 'off', [row]: 'anti' }
        });
        expect(detectSymmetryModes(design.fingers)[mode]).toBe('anti');
      });
    }

    it('changes nothing on a heart that is already symmetric', () => {
      // Enforcing is a correction, not a transformation: a weave that already
      // holds the symmetry must come out of it untouched.
      const geometry = syntheticGeometry([30, 70], [30, 70], 0);
      const plain = cutGeometryToDesign(geometry, { name: 'x' });
      const enforced = cutGeometryToDesign(geometry, {
        name: 'x',
        enforce: { curve: 'sym', lobe: 'sym', lobes: 'sym' }
      });
      expect(maskMismatch(rasterizeDesign(enforced, N).data, rasterizeDesign(plain, N).data)).toBe(0);
      expect(maskMismatch(rasterizeDesign(enforced, N).data, engineMask(geometry))).toBe(0);
    });

    it('leaves the heart alone when every row is off', () => {
      const plain = cutGeometryToDesign(EXAMPLES.jul, { name: 'jul' });
      const enforced = cutGeometryToDesign(EXAMPLES.jul, {
        name: 'jul',
        enforce: { curve: 'off', lobe: 'off', lobes: 'off' }
      });
      expect(maskMismatch(rasterizeDesign(enforced, N).data, rasterizeDesign(plain, N).data)).toBe(0);
    });
  });

  describe('the rows it could honour', () => {
    /** JUL with one A cut dropped, so the two families no longer match up. */
    function lopsided(): CutGeometry {
      const geometry = JSON.parse(JSON.stringify(EXAMPLES.jul)) as CutGeometry;
      geometry.A_overlap_paths = geometry.A_overlap_paths.slice(0, 3);
      return geometry;
    }

    it('repeats back what it was asked for when the geometry can carry it', () => {
      const asked = { curve: 'sym', lobe: 'sym', lobes: 'anti' } as const;
      const { honoured } = convertCutGeometry(EXAMPLES.jul, { name: 'jul', enforce: asked });
      expect(honoured).toEqual(asked);
    });

    it('says every row is off when the caller asks for no symmetry at all', () => {
      expect(convertCutGeometry(EXAMPLES.jul, { name: 'jul' }).honoured).toEqual({
        curve: 'off',
        lobe: 'off',
        lobes: 'off'
      });
    });

    // Mellem lapper makes one lobe the other one mapped, which needs the same
    // number of cuts on both sides — `lobesShareTemplate` refuses anything else,
    // and so does our square grid. The engine can perfectly well answer with 3
    // cuts one way and 4 the other, and then the row has to be reported as
    // dropped: a panel that kept showing "Mellem lapper: Sym" would disagree
    // with Tegn's own detection the moment the visitor opened the heart there.
    it('drops Mellem lapper when the two families came back different sizes', () => {
      const { design, honoured } = convertCutGeometry(lopsided(), {
        name: 'jul',
        enforce: { curve: 'off', lobe: 'sym', lobes: 'sym' }
      });
      expect(design.gridSize).toEqual({ x: 4, y: 5 });
      expect(honoured).toEqual({ curve: 'off', lobe: 'sym', lobes: 'off' });
      // And the heart really is what `honoured` says: the row it dropped is off
      // in the draw page's own reading, the row it kept is on.
      const modes = detectSymmetryModes(design.fingers);
      expect(modes.betweenLobesMode).toBe('off');
      expect(modes.withinLobeMode).toBe('sym');
    });

    it('leaves the lopsided heart untouched by the row it dropped', () => {
      const geometry = lopsided();
      const plain = cutGeometryToDesign(geometry, { name: 'jul' });
      const asked = cutGeometryToDesign(geometry, {
        name: 'jul',
        enforce: { curve: 'off', lobe: 'off', lobes: 'sym' }
      });
      expect(maskMismatch(rasterizeDesign(asked, N).data, rasterizeDesign(plain, N).data)).toBe(0);
    });
  });

  describe('metadata', () => {
    it('takes the paper colours from the engine, A first', () => {
      const geometry = { ...syntheticGeometry([30], [50], 0), paper_colors: ['#bd1111', '#ffffff'] };
      const design = cutGeometryToDesign(geometry, { name: 'x' });
      expect(design.colors).toEqual({ right: '#bd1111', left: '#ffffff' });
    });

    it('prefers the colours the caller passes', () => {
      const geometry = { ...syntheticGeometry([30], [50], 0), paper_colors: ['#bd1111', '#ffffff'] };
      const design = cutGeometryToDesign(geometry, {
        name: 'Stjerne fra billede',
        author: 'Maleren',
        colors: { left: '#123456', right: '#654321' }
      });
      expect(design.colors).toEqual({ left: '#123456', right: '#654321' });
      expect(design.name).toBe('Stjerne fra billede');
      expect(design.author).toBe('Maleren');
    });
  });
});
