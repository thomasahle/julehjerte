import { browser } from '$app/environment';
import type { HeartDesign } from '$lib/types/heart';
import { normalizeHeartDesign, serializeHeartDesign, parseHeartFromSVG } from '$lib/utils/heartDesign';
import { trackHeartLoadError, trackSvgParseError } from '$lib/analytics';

const STORAGE_KEY = 'julehjerte-collection';

export function getUserCollection(): HeartDesign[] {
  if (!browser) return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
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
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const raw = stored ? (JSON.parse(stored) as unknown) : [];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
}

export function deleteUserDesign(id: string): void {
  if (!browser) return;

  const raw = readUserCollectionRaw();
  const filtered = raw.filter((d) => !(d && typeof d === 'object' && 'id' in d && (d as { id?: unknown }).id === id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}


export async function loadStaticHeartById(id: string): Promise<HeartDesign | null> {
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
