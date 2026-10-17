import { describe, expect, it } from 'vitest';
import { getTemplateData, transformPathData } from './templateSvg';
import { lobesShareTemplate } from './symmetry';
import { loadHeart } from '$lib/laser/testHearts';

/** First and last point of an absolute M/L/C path. */
function endpoints(d: string): { first: [number, number]; last: [number, number] } {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  return { first: [nums[0], nums[1]], last: [nums[nums.length - 2], nums[nums.length - 1]] };
}

describe('transformPathData', () => {
  // A square overlap at (10, 20), side 30, with an ear radius of 15.
  const args = [20, 10, 30, 30, 15] as const;

  it('maps the right lobe from top (ear) to bottom (fold)', () => {
    const { first, last } = endpoints(transformPathData('M 25 20 L 25 50', ...args, 'right'));
    expect(first[1]).toBeCloseTo(15); // ear base
    expect(last[1]).toBeCloseTo(45); // fold = overlapHeight + earRadius
  });

  it('maps the left lobe from its left edge (ear) to its right edge (fold)', () => {
    // The left lobe's ear is to the left of the square, so x = overlapLeft is the ear side.
    const { first, last } = endpoints(transformPathData('M 10 35 L 40 35', ...args, 'left'));
    expect(first[1]).toBeCloseTo(15);
    expect(last[1]).toBeCloseTo(45);
  });

  it('keeps a taper at the lobe end at the lobe end', () => {
    // A strip edge that leans over the first third of its run (near the ear).
    const d = transformPathData('M 10 35 C 15 30 20 30 25 35 L 40 35', ...args, 'left');
    const nums = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const ys = nums.filter((_, i) => i % 2 === 1);
    // The curved part (the first four points) stays within the top half of the body.
    expect(Math.max(...ys.slice(0, 4))).toBeLessThanOrEqual(15 + 30 / 2 + 1e-9);
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
