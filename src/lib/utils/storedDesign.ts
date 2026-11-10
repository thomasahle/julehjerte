import type { HeartDesign, HeartDesignJson } from '$lib/types/heart';
import { readableVersion } from './formatVersion';
import { normalizeHeartDesign, serializeHeartDesign } from './heartDesign';

/**
 * The version of a heart's JSON form the site writes, wherever the JSON goes:
 * "Mine hjerter", the editor's draft, a shared or Tegn's own `#design=` link.
 * Hearts written before versioning have none.
 */
export const DESIGN_VERSION = 1;

/** A heart's JSON as the site stores and shares it. */
export type StoredHeartDesign = HeartDesignJson & { v: number };

/** The heart's JSON to store or share: `serializeHeartDesign`'s, with its version. */
export function encodeHeartDesign(design: HeartDesign): StoredHeartDesign {
	return { v: DESIGN_VERSION, ...serializeHeartDesign(design) };
}

/**
 * The heart in any JSON the site has stored or shared, every older form
 * included (`normalizeHeartDesign` reads those); null for what is not an
 * object, and for a heart written by a later site than this one.
 */
export function decodeHeartDesign(raw: unknown): HeartDesign | null {
	if (!raw || typeof raw !== 'object' || !readableVersion((raw as { v?: unknown }).v, DESIGN_VERSION)) return null;
	return normalizeHeartDesign(raw);
}
