import { describe, expect, it } from 'vitest';
import { heartAnchorFromHash, makeHeartAnchorId, sectionAnchorToLand } from './heartAnchors';

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

describe('sectionAnchorToLand', () => {
  it('lands a category hash the page was loaded or linked with', () => {
    expect(sectionAnchorToLand('enter', '#moenstre', 'navigate')).toBe('moenstre');
    expect(sectionAnchorToLand('enter', '#klassiske', undefined)).toBe('klassiske');
    expect(sectionAnchorToLand('link', '#skabeloner', 'reload')).toBe('skabeloner');
  });

  it('keeps the restored position after a reload or a step through history', () => {
    expect(sectionAnchorToLand('enter', '#moenstre', 'reload')).toBeNull();
    expect(sectionAnchorToLand('enter', '#moenstre', 'back_forward')).toBeNull();
    expect(sectionAnchorToLand('popstate', '#moenstre', 'navigate')).toBeNull();
  });

  it('does nothing for a goto, a card anchor or no hash', () => {
    // Ticking a card rewrites the URL with goto, hash and all.
    expect(sectionAnchorToLand('goto', '#moenstre', 'navigate')).toBeNull();
    // A card's anchor is centred by the page instead.
    expect(sectionAnchorToLand('enter', '#heart-stjerne', 'navigate')).toBeNull();
    expect(sectionAnchorToLand('enter', '', 'navigate')).toBeNull();
    expect(sectionAnchorToLand('enter', '#', 'navigate')).toBeNull();
  });
});
