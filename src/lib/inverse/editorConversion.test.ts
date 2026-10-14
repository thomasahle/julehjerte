import { describe, expect, it } from 'vitest';
import { convertCutGeometry, convertValidatedCutGeometry, CutGeometryError, type CutGeometry } from './toHeartDesign';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import type { HeartDesign } from '$lib/types/heart';
import star from '../../../scripts/inverse/fixtures/editor-star-crossing.json';
import anchor from '../../../scripts/inverse/fixtures/editor-anchor-return.json';
import gift from '../../../scripts/inverse/fixtures/editor-gift-return.json';
import sideClearance from '../../../scripts/inverse/fixtures/editor-side-clearance.json';

// Fresh result captured from the production Mal → Prøv stjernen → Find snit
// flow on 2026-09-08. Engine checks passed, but the converted heart warned about
// two self-intersections after Åbn i Tegn, reproducing the user's screenshot.
const geometry = star as unknown as CutGeometry;
const issues = (d: HeartDesign) => findFingersWithIssues(d.fingers, intersectionMarginPx(inferOverlapRect(d.fingers, d.gridSize)));
const symmetry = { curve: 'off', lobe: 'off', lobes: 'sym' } as const;

describe('the final editable heart', () => {
  it('does not let simplification handles consume the paper margin next to an outer edge', () => {
    const input = sideClearance.geometry as unknown as CutGeometry;
    const clearance = (design: HeartDesign) => {
      const rect = inferOverlapRect(design.fingers, design.gridSize);
      return Math.min(...design.fingers.filter(f => f.id.startsWith('L-cut-')).flatMap(f => f.segments.flatMap(s =>
        [s.p0, s.p1, s.p2, s.p3].map(p => Math.min(p.y - rect.top, rect.bottom - p.y) * 100 / rect.height))));
    };
    const original = convertCutGeometry(input, { name: 'original', tolerance: 0 });
    expect(clearance(original.design)).toBeGreaterThan(3.26);
    expect(clearance(convertCutGeometry(input, { name: 'simplified' }).design)).toBeLessThan(2.505);
    const result = convertValidatedCutGeometry(input, { name: 'validated' });
    expect(clearance(result.design)).toBeGreaterThanOrEqual(clearance(original.design) - 1e-6);
    expect(issues(result.design).size).toBe(0);
  });

  it('accepts the original solver geometry before simplifying it', () => {
    expect(issues(convertCutGeometry(geometry, { name: 'raw', tolerance: 0 }).design).size).toBe(0);
  });

  it('passes the editor’s own rules after simplification and symmetry correction', () => {
    const result = convertValidatedCutGeometry(geometry, { name: 'star', enforce: symmetry });
    expect(issues(result.design).size).toBe(0);
    expect(result.editorValidation?.passed).toBe(true);
    expect(result.honoured).toEqual(symmetry);
  });

  it('preserves the exact common spans of the two sheets', () => {
    const d = convertValidatedCutGeometry(geometry, { name: 'star' }).design;
    const rect = inferOverlapRect(d.fingers, d.gridSize);
    const key = (p: number[][]) => p.map(q => q.map(v => v.toFixed(7)).join(',')).join(';');
    const canonical = (p: number[][]) => [key(p), key(p.slice().reverse())].sort()[0];
    const families = ['right', 'left'].map(lobe => new Set(d.fingers.filter(f => f.lobe === lobe).flatMap(f => f.segments.map(s => canonical([s.p0, s.p1, s.p2, s.p3].map(p => [(p.x - rect.left) * 100 / rect.width, (p.y - rect.top) * 100 / rect.height]))))));
    const a = new Set(geometry.A_overlap_paths.flatMap(p => p.map(r => r.curve)));
    const shared = [...new Set(geometry.B_overlap_paths.flatMap(p => p.map(r => r.curve)))].filter(id => a.has(id));
    expect(shared.length).toBeGreaterThan(0);
    for (const id of shared) for (const family of families) expect(family.has(canonical(geometry.curves[id]!.control_points))).toBe(true);
  });

  it('refuses overlapping cuts even when no simplification or correction is requested', () => {
    const invalid = structuredClone(geometry);
    invalid.A_overlap_paths[1] = structuredClone(invalid.A_overlap_paths[0]!);
    expect(() => convertValidatedCutGeometry(invalid, { name: 'invalid', tolerance: 0 })).toThrow(CutGeometryError);
  });

  it('blocks the photographed anchor’s narrow return even though engine validation accepted it', () => {
    // Actual Chromium upload/crop/solve result. Complete-cut checks also catch
    // the left return: 1.42 mm gap, 3.10 mm arc, and 197 degrees of turning.
    const narrow = anchor as unknown as CutGeometry;
    expect(issues(convertCutGeometry(narrow, { name: 'anchor', tolerance: 0 }).design)).toEqual(new Set(['L-cut-1', 'R-cut-2']));
    expect(() => convertValidatedCutGeometry(narrow, { name: 'anchor' })).toThrow(CutGeometryError);
  });

  it('rejects the photographed gift return even without simplification', () => {
    const narrow = gift as unknown as CutGeometry;
    expect(issues(convertCutGeometry(narrow, { name: 'gift', tolerance: 0 }).design)).toEqual(new Set(['L-cut-0']));
    expect(() => convertValidatedCutGeometry(narrow, { name: 'gift' })).toThrow(CutGeometryError);
  });

  it('refuses cuts that cross inside the same sheet', () => {
    const line = (a: number[], b: number[]) => ({ control_points: [a, a.map((v, i) => v + (b[i]! - v) / 3), a.map((v, i) => v + 2 * (b[i]! - v) / 3), b] });
    const invalid: CutGeometry = {
      square_width_mm: 100, phase: 0,
      curves: { a: line([20, 0], [80, 100]), b: line([80, 0], [20, 100]), c: line([0, 50], [100, 50]) },
      A_overlap_paths: [[{ curve: 'a', reverse: false }], [{ curve: 'b', reverse: false }]],
      B_overlap_paths: [[{ curve: 'c', reverse: false }]]
    };
    expect(() => convertValidatedCutGeometry(invalid, { name: 'crossing' })).toThrow(CutGeometryError);
  });
});
