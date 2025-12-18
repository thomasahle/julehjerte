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

export function saveUserDesign(design: HeartDesign): void {
  if (!browser) return;

  const collection = getUserCollection();
  // Check if design with same ID exists, update it
  const existingIndex = collection.findIndex((d) => d.id === design.id);
  if (existingIndex >= 0) {
    collection[existingIndex] = design;
  } else {
    collection.push(design);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collection.map(serializeHeartDesign)));
}

export function deleteUserDesign(id: string): void {
  if (!browser) return;

  const collection = getUserCollection();
  const filtered = collection.filter((d) => d.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.map(serializeHeartDesign)));
}

export function clearUserCollection(): void {
  if (!browser) return;
  localStorage.removeItem(STORAGE_KEY);
}

export async function loadStaticHearts(): Promise<HeartDesign[]> {
  try {
    const response = await fetch('/hearts/index.json');
    if (!response.ok) {
      trackHeartLoadError('index', `Failed to load index.json: ${response.status}`);
      return [];
    }

    const index: { hearts: string[] } = await response.json();
    const designs = await Promise.all(
      index.hearts.map(async (id) => {
        try {
          const heartResponse = await fetch(`/hearts/${id}.svg`);
          if (!heartResponse.ok) {
            trackHeartLoadError(id, `HTTP ${heartResponse.status}`);
            return null;
          }
          const svgText = await heartResponse.text();
          const design = parseHeartFromSVG(svgText, `${id}.svg`);
          if (!design) {
            trackSvgParseError(`${id}.svg`, 'No valid paths found');
          }
          return design;
        } catch (err) {
          trackHeartLoadError(id, err instanceof Error ? err.message : 'Unknown error');
          return null;
        }
      })
    );

    return designs.filter((d): d is HeartDesign => d !== null);
  } catch (err) {
    trackHeartLoadError('index', err instanceof Error ? err.message : 'Unknown error');
    return [];
  }
}

export async function loadAllHearts(): Promise<(HeartDesign & { isUserCreated?: boolean })[]> {
  const staticHearts = await loadStaticHearts();
  const userHearts = getUserCollection();

  // Static hearts first, then user-created hearts at the end (marked with isUserCreated)
  return [
    ...staticHearts,
    ...userHearts.map((h) => ({ ...h, isUserCreated: true }))
  ];
}
