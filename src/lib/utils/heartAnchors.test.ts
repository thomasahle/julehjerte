import { describe, expect, it } from 'vitest';
import { heartAnchorFromHash, makeHeartAnchorId } from './heartAnchors';

describe('heartAnchorFromHash', () => {
  it('returns a card anchor', () => {
    expect(heartAnchorFromHash('#heart-stjerne')).toBe('heart-stjerne');
    expect(heartAnchorFromHash(`#${makeHeartAnchorId('classic-3x3')}`)).toBe('heart-classic-3x3');
  });

  it('leaves category and empty hashes to the browser', () => {
    expect(heartAnchorFromHash('#moenstre')).toBeNull();
    expect(heartAnchorFromHash('#mine')).toBeNull();
    expect(heartAnchorFromHash('#heart-')).toBeNull();
    expect(heartAnchorFromHash('')).toBeNull();
  });
});
