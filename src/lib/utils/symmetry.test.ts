import { describe, it, expect, vi } from 'vitest';
import classicSvg from '../../../static/hearts/classic-3x3.svg?raw';
import sunSvg from '../../../static/hearts/sun.svg?raw';
import santaSvg from '../../../static/hearts/santa.svg?raw';
import boelgerSvg from '../../../static/hearts/boelger.svg?raw';
import { parseHeartFromSVG } from '$lib/utils/svgImport';
import { splitBezierAt } from '$lib/geometry/cubic';
import { PRINT_WIDTH_MM } from '$lib/geometry/paperNecks';
import type { Finger } from '$lib/types/heart';
import { lobesShareTemplate, lobeTemplateSymmetry } from '$lib/utils/symmetry';

function load(svg: string, filename: string) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const design = parseHeartFromSVG(svg, filename);
    expect(design).not.toBeNull();
    return design!;
  } finally {
    warn.mockRestore();
  }
}

describe('lobesShareTemplate', () => {
  it('needs only one template for a classic straight-cut heart', () => {
    const design = load(classicSvg, 'classic-3x3.svg');
    expect(lobesShareTemplate(design.fingers, design.gridSize)).toBe(true);
  });

  it('needs only one template when the lobes are 90° rotations of each other (issue #10, "sun")', () => {
    const design = load(sunSvg, 'sun.svg');
    expect(lobesShareTemplate(design.fingers, design.gridSize)).toBe(true);
  });

  it('needs two templates for an asymmetric design', () => {
    const design = load(santaSvg, 'santa.svg');
    expect(lobesShareTemplate(design.fingers, design.gridSize)).toBe(false);
  });

  it('needs two templates when the grid is not square', () => {
    const design = load(classicSvg, 'classic-3x3.svg');
    expect(lobesShareTemplate(design.fingers, { x: 3, y: 4 })).toBe(false);
  });
});

describe('lobeTemplateSymmetry', () => {
  it('says why the lobes share a template: mirrored or turned', () => {
    const classic = load(classicSvg, 'classic-3x3.svg');
    const sun = load(sunSvg, 'sun.svg');
    expect(lobeTemplateSymmetry(classic.fingers, classic.gridSize)).toBe('mirror');
    expect(lobeTemplateSymmetry(sun.fingers, sun.gridSize)).toBe('rotation');
  });

  it('is null exactly when the lobes need a template each', () => {
    const santa = load(santaSvg, 'santa.svg');
    const classic = load(classicSvg, 'classic-3x3.svg');
    expect(lobeTemplateSymmetry(santa.fingers, santa.gridSize)).toBeNull();
    expect(lobeTemplateSymmetry(classic.fingers, { x: 3, y: 4 })).toBeNull();
  });
});

describe('lobeTemplateSymmetry, less than a millimetre apart', () => {
  /**
   * The fingers with the left lobe's second cut redrawn: as two curves where
   * it was one (no longer the right lobe's cut node for node), and bulging
   * `bulgeMm` to the side at its middle: a straight cut across the square,
   * which is printed PRINT_WIDTH_MM wide (a cubic's middle moves 3/4 of what
   * both its handles move).
   */
  function redrawn(fingers: Finger[], bulgeMm: number): Finger[] {
    const cut = fingers.filter((f) => f.lobe === 'left')[1]!;
    const [seg] = cut.segments, mm = Math.abs(seg!.p3.x - seg!.p0.x) / PRINT_WIDTH_MM, by = (bulgeMm * mm) / 0.75;
    const bent = { ...seg!, p1: { x: seg!.p1.x, y: seg!.p1.y + by }, p2: { x: seg!.p2.x, y: seg!.p2.y + by } };
    return fingers.map((f) => (f === cut ? { ...f, segments: splitBezierAt(bent, 0.4) } : f));
  }

  it('takes two halves drawn with different nodes as the same', () => {
    const classic = load(classicSvg, 'classic-3x3.svg');
    expect(classic.fingers.filter((f) => f.lobe === 'left')[1]!.segments).toHaveLength(1);
    expect(lobeTemplateSymmetry(redrawn(classic.fingers, 0), classic.gridSize)).toBe('mirror');
    const sun = load(sunSvg, 'sun.svg');
    const cut = sun.fingers.find((f) => f.lobe === 'left')!;
    const split = sun.fingers.map((f) => (f === cut ? { ...f, segments: [...splitBezierAt(f.segments[0]!, 0.4), ...f.segments.slice(1)] } : f));
    expect(lobeTemplateSymmetry(split, sun.gridSize)).toBe('rotation');
  });

  it('does not count less than a millimetre on the printed template', () => {
    const classic = load(classicSvg, 'classic-3x3.svg');
    expect(lobeTemplateSymmetry(redrawn(classic.fingers, 0.8), classic.gridSize)).toBe('mirror');
    expect(lobeTemplateSymmetry(redrawn(classic.fingers, 1.2), classic.gridSize)).toBeNull();
  });

  it('gives Bølger, whose halves are drawn a hair apart, one template', () => {
    const boelger = load(boelgerSvg, 'boelger.svg');
    expect(lobeTemplateSymmetry(boelger.fingers, boelger.gridSize)).toBe('mirror');
  });
});
