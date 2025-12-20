import { browser } from '$app/environment';
import type { HeartDesign } from '$lib/types/heart';
import { normalizeHeartDesign, serializeHeartDesign, parseHeartFromSVG } from '$lib/utils/heartDesign';
import { trackHeartLoadError, trackSvgParseError } from '$lib/analytics';

const STORAGE_KEY = 'julehjerte-collection';

export type HeartCategory = {
  id: string;
  hearts: HeartDesign[];
};

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

export async function loadStaticHearts(): Promise<HeartCategory[]> {
  try {
    const response = await fetch('/hearts/index.json');
    if (!response.ok) {
      trackHeartLoadError('index', `Failed to load index.json: ${response.status}`);
      return [];
    }

    const index: { categories: { id: string; hearts: string[] }[] } = await response.json();

    const categories: HeartCategory[] = await Promise.all(
      index.categories.map(async (cat) => {
        const designs = await Promise.all(
          cat.hearts.map(async (id) => {
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

        return {
          id: cat.id,
          hearts: designs.filter((d): d is HeartDesign => d !== null)
        };
      })
    );

    return categories.filter((cat) => cat.hearts.length > 0);
  } catch (err) {
    trackHeartLoadError('index', err instanceof Error ? err.message : 'Unknown error');
    return [];
  }
}

export type HeartWithMeta = HeartDesign & { isUserCreated?: boolean };

export type HeartCategoryWithMeta = {
  id: string;
  hearts: HeartWithMeta[];
};

export async function loadAllHearts(): Promise<HeartCategoryWithMeta[]> {
  const staticCategories = await loadStaticHearts();
  const userHearts = getUserCollection();

  // Convert static categories to include metadata
  const categories: HeartCategoryWithMeta[] = staticCategories.map((cat) => ({
    id: cat.id,
    hearts: cat.hearts
  }));

  // Add user-created hearts as their own category at the end
  if (userHearts.length > 0) {
    categories.push({
      id: 'mine',
      hearts: userHearts.map((h) => ({ ...h, isUserCreated: true }))
    });
  }

  return categories;
}
