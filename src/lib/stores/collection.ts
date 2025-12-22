import { browser } from '$app/environment';
import type { HeartDesign } from '$lib/types/heart';
import { normalizeHeartDesign, serializeHeartDesign, parseHeartFromSVG } from '$lib/utils/heartDesign';
import { trackHeartLoadError, trackSvgParseError } from '$lib/analytics';

const STORAGE_KEY = 'julehjerte-collection';

export type HeartCategory = {
  id: string;
  hearts: HeartDesign[];
};

export type StaticHeartsIndex = { categories: { id: string; hearts: string[] }[] };

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

export function clearUserCollection(): void {
  if (!browser) return;
  localStorage.removeItem(STORAGE_KEY);
}

export async function loadStaticHeartsIndex(): Promise<StaticHeartsIndex['categories']> {
  try {
    const response = await fetch('/hearts/index.json');
    if (!response.ok) {
      trackHeartLoadError('index', `Failed to load index.json: ${response.status}`);
      return [];
    }
    const index: StaticHeartsIndex = await response.json();
    return Array.isArray(index.categories) ? index.categories : [];
  } catch (err) {
    trackHeartLoadError('index', err instanceof Error ? err.message : 'Unknown error');
    return [];
  }
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

export async function loadStaticHearts(): Promise<HeartCategory[]> {
  const indexCategories = await loadStaticHeartsIndex();
  const categories: HeartCategory[] = await Promise.all(
    indexCategories.map(async (cat) => {
      const designs = await Promise.all(cat.hearts.map(loadStaticHeartById));
      return { id: cat.id, hearts: designs.filter((d): d is HeartDesign => d !== null) };
    })
  );
  return categories.filter((cat) => cat.hearts.length > 0);
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
