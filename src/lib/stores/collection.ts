import { browser } from '$app/environment';
import type { HeartDesign } from '$lib/types/heart';
import { normalizeHeartDesign, serializeHeartDesign, parseHeartFromSVG } from '$lib/utils/heartDesign';
import { readStorage, writeStorage } from '$lib/utils/safeStorage';
import { trackHeartLoadError, trackSvgParseError } from '$lib/analytics';
import { ALL_HEART_IDS } from '$lib/data/categories';

/** Where the visitor's own hearts are kept; the front page's inline strand script reads it too. */
export const USER_COLLECTION_KEY = 'julehjerte-collection';
const STORAGE_KEY = USER_COLLECTION_KEY;

export function getUserCollection(): HeartDesign[] {
  if (!browser) return [];

  const stored = readStorage(STORAGE_KEY);
  try {
    const raw = stored ? (JSON.parse(stored) as unknown[]) : [];
    if (!Array.isArray(raw)) return [];
    return raw
      .map(normalizeHeartDesign)
      .filter((d): d is HeartDesign => d !== null);
  } catch {
    return [];
  }
}

function readUserCollectionRaw(): unknown[] {
  if (!browser) return [];
  const stored = readStorage(STORAGE_KEY);
  try {
    const raw = stored ? (JSON.parse(stored) as unknown) : [];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * Throws when storage is blocked or full: every caller reports a failed save to
 * the visitor, so it must hear about it.
 */
export function saveUserDesign(design: HeartDesign): void {
  if (!browser) return;

  const serialized = serializeHeartDesign(design);
  const raw = readUserCollectionRaw();
  const existingIndex = raw.findIndex(
    (d) => d && typeof d === 'object' && 'id' in d && (d as { id?: unknown }).id === serialized.id
  );
  if (existingIndex >= 0) {
    raw[existingIndex] = serialized;
  } else {
    raw.push(serialized);
  }
  // Raw on purpose, not writeStorage: the failure must reach the caller.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
}

export function deleteUserDesign(id: string): void {
  if (!browser) return;

  const raw = readUserCollectionRaw();
  const filtered = raw.filter((d) => !(d && typeof d === 'object' && 'id' in d && (d as { id?: unknown }).id === id));
  // With storage blocked there is nothing stored to delete from, so a failure is silent.
  writeStorage(STORAGE_KEY, JSON.stringify(filtered));
}


/**
 * A gallery heart's design, read from its SVG under /hearts/. Every SVG there
 * is in the gallery index (hearts.jsonc), so an id that is not names no file:
 * it gets null without a request, rather than a 404 in the network log on
 * every mistyped or stale heart link.
 */
export async function loadStaticHeartById(id: string): Promise<HeartDesign | null> {
  if (!ALL_HEART_IDS.includes(id)) return null;
  try {
    const heartResponse = await fetch(`/hearts/${id}.svg`);
    if (!heartResponse.ok) {
      trackHeartLoadError(id, `HTTP ${heartResponse.status}`);
      return null;
    }
    const svgText = await heartResponse.text();
    const design = parseHeartFromSVG(svgText, `${id}.svg`);
    if (!design) trackSvgParseError(`${id}.svg`, 'No valid paths found');
    return design;
  } catch (err) {
    trackHeartLoadError(id, err instanceof Error ? err.message : 'Unknown error');
    return null;
  }
}

type HeartWithMeta = HeartDesign & { isUserCreated?: boolean };

export type HeartCategoryWithMeta = {
  id: string;
  hearts: HeartWithMeta[];
};
