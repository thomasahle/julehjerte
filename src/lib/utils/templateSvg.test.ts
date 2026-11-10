import { describe, expect, it } from 'vitest';
import type { BezierSegment } from '$lib/types/heart';
import { segmentsToPathData } from '$lib/geometry/bezierSegments';
import { getTemplateData, templateSegments } from './templateSvg';
import { lobesShareTemplate } from './symmetry';
import { loadHeart } from '$lib/laser/testHearts.test-helpers';

/** First and last point of an absolute M/L/C path. */
function endpoints(d: string): { first: [number, number]; last: [number, number] } {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  return { first: [nums[0], nums[1]], last: [nums[nums.length - 2], nums[nums.length - 1]] };
}

describe('templateSegments', () => {
  // A square overlap at (10, 20), side 30, with an ear radius of 15.
  const args = [20, 10, 15] as const;
  const line = (x0: number, y0: number, x1: number, y1: number): BezierSegment => ({
    p0: { x: x0, y: y0 },
    p1: { x: x0 + (x1 - x0) / 3, y: y0 + (y1 - y0) / 3 },
    p2: { x: x0 + ((x1 - x0) * 2) / 3, y: y0 + ((y1 - y0) * 2) / 3 },
    p3: { x: x1, y: y1 }
  });

  it('maps the right lobe from top (ear) to bottom (fold)', () => {
    const [seg] = templateSegments([line(25, 20, 25, 50)], ...args, 'right');
    expect(seg!.p0.y).toBeCloseTo(15); // ear base
    expect(seg!.p3.y).toBeCloseTo(45); // fold = overlapHeight + earRadius
  });

  it('maps the left lobe from its left edge (ear) to its right edge (fold)', () => {
    // The left lobe's ear is to the left of the square, so x = overlapLeft is the ear side.
    const [seg] = templateSegments([line(10, 35, 40, 35)], ...args, 'left');
    expect(seg!.p0.y).toBeCloseTo(15);
    expect(seg!.p3.y).toBeCloseTo(45);
  });

  it('keeps a taper at the lobe end at the lobe end', () => {
    // A strip edge that leans over the first third of its run (near the ear).
    const curve = { p0: { x: 10, y: 35 }, p1: { x: 15, y: 30 }, p2: { x: 20, y: 30 }, p3: { x: 25, y: 35 } };
    const [seg] = templateSegments([curve, line(25, 35, 40, 35)], ...args, 'left');
    // The curved part stays within the top half of the body.
    expect(Math.max(seg!.p0.y, seg!.p1.y, seg!.p2.y, seg!.p3.y)).toBeLessThanOrEqual(15 + 30 / 2 + 1e-9);
  });

  it('starts each segment where the one before it ends, and writes −0 as 0', () => {
    const gap = [line(20, 20, 30, 30), line(30.5, 30, 40, 40)];
    const [a, b] = templateSegments(gap, ...args, 'right');
    expect(b!.p0).toBe(a!.p3);
    const [z] = templateSegments([line(-0, -0, 5, 5)], 0, 0, -0, 'right');
    expect(Object.is(z!.p0.x, 0)).toBe(true);
    expect(Object.is(z!.p0.y, 0)).toBe(true);
  });
});

describe('getTemplateData', () => {
  it('every cut runs from the ear base to the fold, for both lobes of every gallery heart', () => {
    for (const design of galleryDesigns()) {
      for (const lobe of ['left', 'right'] as const) {
        const data = getTemplateData(design, lobe);
        for (const d of data.cutPaths) {
          const { first, last } = endpoints(d);
          const ys = [first[1], last[1]].sort((a, b) => a - b);
          expect(ys[0]).toBeCloseTo(data.earRadius, 3);
          expect(ys[1]).toBeCloseTo(data.templateHeight, 3);
        }
      }
    }
  });

  it('writes each cut\'s segments out as its path data', () => {
    for (const design of galleryDesigns()) {
      for (const lobe of ['left', 'right'] as const) {
        const data = getTemplateData(design, lobe);
        expect(data.cutPaths).toEqual(data.cutSegments.map(segmentsToPathData));
      }
    }
  });

  it('gives a mirror-symmetric heart identical templates for its two lobes', () => {
    const shared = galleryDesigns().filter((d) => lobesShareTemplate(d.fingers, d.gridSize));
    expect(shared.length).toBeGreaterThan(0);
    for (const design of shared) {
      const left = getTemplateData(design, 'left');
      const right = getTemplateData(design, 'right');
      expect(left.templateWidth).toBeCloseTo(right.templateWidth, 6);
      expect(left.templateHeight).toBeCloseTo(right.templateHeight, 6);
      // Gallery hearts are drawn by hand, so their symmetry is only near-exact:
      // the two templates agree to within the 5-unit tolerance lobesShareTemplate uses.
      const points = (d: string) => d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      const byStart = (a: string, b: string) => points(a)[0] - points(b)[0];
      const l = [...left.cutPaths].sort(byStart).map(points);
      const r = [...right.cutPaths].sort(byStart).map(points);
      expect(l.length).toBe(r.length);
      for (let i = 0; i < l.length; i++) {
        expect(l[i].length).toBe(r[i].length);
        for (let j = 0; j < l[i].length; j++) expect(Math.abs(l[i][j] - r[i][j])).toBeLessThan(5); // the tolerance lobesShareTemplate itself allows
      }
    }
  });
});

function galleryDesigns() {
  return ['classic-3x3', 'jul', 'snowflake', 'santa', 'ramme', 'flower'].map(loadHeart);
}
