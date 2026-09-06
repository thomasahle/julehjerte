import { describe, it, expect, vi } from 'vitest';
import classicSvg from '../../../static/hearts/classic-3x3.svg?raw';
import sunSvg from '../../../static/hearts/sun.svg?raw';
import santaSvg from '../../../static/hearts/santa.svg?raw';
import { parseHeartFromSVG } from '$lib/utils/heartDesign';
import { lobesShareTemplate } from '$lib/utils/symmetry';

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
