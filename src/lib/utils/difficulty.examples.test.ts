import { describe, it, expect, vi } from 'vitest';
import explosionSvg from '../../../static/hearts/explosion.svg?raw';
import davidSvg from '../../../static/hearts/david.svg?raw';
import { parseHeartFromSVG } from '$lib/utils/heartDesign';
import { calculateDifficulty } from '$lib/utils/difficulty';

describe('difficulty examples', () => {
  it('rates explosion as <= medium', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const design = parseHeartFromSVG(explosionSvg, 'explosion.svg');
      expect(design).not.toBeNull();
      if (!design) return;

      const difficulty = calculateDifficulty(design);
      expect(['easy', 'medium']).toContain(difficulty.level);
    } finally {
      warn.mockRestore();
    }
  });

  it('rates Davidsstjerne as expert', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const design = parseHeartFromSVG(davidSvg, 'david.svg');
      expect(design).not.toBeNull();
      if (!design) return;

      const difficulty = calculateDifficulty(design);
      expect(difficulty.level).toBe('expert');
    } finally {
      warn.mockRestore();
    }
  });
});
