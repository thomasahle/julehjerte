import { describe, expect, it } from 'vitest';
import { convertCutGeometry, convertValidatedCutGeometry, CutGeometryError, type CutGeometry } from './toHeartDesign';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import type { HeartDesign } from '$lib/types/heart';
import star from '../../../scripts/inverse/fixtures/editor-star-crossing.json';

// Fresh result captured from the production Mal → Prøv stjernen → Find snit
// flow on 2026-09-08. Engine checks passed, but the converted heart warned about
// two self-intersections after Åbn i Tegn, reproducing the user's screenshot.
const geometry = star as unknown as CutGeometry;
const issues = (d: HeartDesign) => findFingersWithIssues(d.fingers, intersectionMarginPx(inferOverlapRect(d.fingers, d.gridSize)));
const symmetry = { curve: 'off', lobe: 'off', lobes: 'sym' } as const;

describe('the final editable heart', () => {
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
