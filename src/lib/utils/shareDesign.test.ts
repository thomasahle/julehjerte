import { describe, it, expect, afterEach } from 'vitest';
import type { HeartDesignJson } from '$lib/types/heart';
import { decodeSharedDesign, encodeSharedDesign, sharedDesignUrl, SHARED_HEART_ID } from './shareDesign';
import { normalizeHeartDesign } from './heartDesign';

const design: HeartDesignJson = {
  id: 'heart-123-abc',
  name: 'Mit hjerte æøå',
  author: 'Test',
  weaveParity: 1,
  gridSize: { x: 3, y: 3 },
  fingers: [
    { id: 'L-1', lobe: 'left', pathData: 'M 100 33.333333333333336 C 75.1234567 33.33 25 33.33 0 33.33' },
    { id: 'R-1', lobe: 'right', pathData: 'M 33.3 100 C 33.3 75 33.3 25 33.3 0', nodeTypes: { '0': 'corner' } }
  ]
};

const rounded = {
  ...design,
  fingers: [
    { id: 'L-1', lobe: 'left', pathData: 'M 100 33.333 C 75.123 33.33 25 33.33 0 33.33' },
    { id: 'R-1', lobe: 'right', pathData: 'M 33.3 100 C 33.3 75 33.3 25 33.3 0', nodeTypes: { '0': 'corner' } }
  ]
};

const originalCompressionStream = globalThis.CompressionStream;
const originalDecompressionStream = globalThis.DecompressionStream;

afterEach(() => {
  globalThis.CompressionStream = originalCompressionStream;
  globalThis.DecompressionStream = originalDecompressionStream;
});

describe('shareDesign', () => {
  it('round-trips a design through a compressed, URL-safe payload', async () => {
    const payload = await encodeSharedDesign(design);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeSharedDesign(payload)).toEqual(rounded);
  });

  it('falls back to plain base64url JSON without CompressionStream and reads it back', async () => {
    // @ts-expect-error simulate a browser without CompressionStream
    globalThis.CompressionStream = undefined;
    const plain = await encodeSharedDesign(design);
    expect(plain).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(atob(plain.replace(/-/g, '+').replace(/_/g, '/')).startsWith('{')).toBe(true);
    expect(await decodeSharedDesign(plain)).toEqual(rounded);
    // Plain payloads need no DecompressionStream either.
    // @ts-expect-error simulate a browser without DecompressionStream
    globalThis.DecompressionStream = undefined;
    expect(await decodeSharedDesign(plain)).toEqual(rounded);
  });

  it('compresses to a shorter payload than the plain form', async () => {
    const compressed = await encodeSharedDesign(design);
    // @ts-expect-error simulate a browser without CompressionStream
    globalThis.CompressionStream = undefined;
    const plain = await encodeSharedDesign(design);
    expect(compressed.length).toBeLessThan(plain.length);
  });

  it('accepts the legacy encodeURIComponent(JSON) form, decoded or not', async () => {
    const json = JSON.stringify(design);
    expect(await decodeSharedDesign(encodeURIComponent(json))).toEqual(design);
    expect(await decodeSharedDesign(json)).toEqual(design);
  });

  it('returns null for invalid payloads', async () => {
    expect(await decodeSharedDesign('')).toBeNull();
    expect(await decodeSharedDesign('not base64!')).toBeNull();
    expect(await decodeSharedDesign('AAAA')).toBeNull();
    expect(await decodeSharedDesign('{not json')).toBeNull();
  });

  it("carries the heart's own colours, and drops invalid ones on the way back", async () => {
    const colored: HeartDesignJson = { ...design, colors: { left: '#0b3d2c', right: '#f5c518' } };
    const payload = await encodeSharedDesign(colored);
    const decoded = await decodeSharedDesign(payload);
    expect((decoded as HeartDesignJson).colors).toEqual(colored.colors);
    // The payload is only JSON; validation is normalizeHeartDesign's job.
    expect(normalizeHeartDesign(decoded)!.colors).toEqual(colored.colors);

    const tampered = await encodeSharedDesign({
      ...design,
      colors: { left: 'red', right: '#000000' }
    } as HeartDesignJson);
    expect(normalizeHeartDesign(await decodeSharedDesign(tampered))!.colors).toBeUndefined();
  });

  it('builds the share URL for both languages', () => {
    expect(sharedDesignUrl('abc', 'da')).toBe(`https://juleflet.dk/hjerte/${SHARED_HEART_ID}/#design=abc`);
    expect(sharedDesignUrl('abc', 'en')).toBe(`https://juleflet.dk/en/hjerte/${SHARED_HEART_ID}/#design=abc`);
  });
});
