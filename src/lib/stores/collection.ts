import { browser } from '$app/environment';
import type { HeartDesign } from '$lib/types/heart';

const STORAGE_KEY = 'julehjerte-collection';

export function getUserCollection(): HeartDesign[] {
  if (!browser) return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
}

export function deleteUserDesign(id: string): void {
  if (!browser) return;

  const collection = getUserCollection();
  const filtered = collection.filter((d) => d.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function clearUserCollection(): void {
  if (!browser) return;
  localStorage.removeItem(STORAGE_KEY);
}

export async function loadStaticHearts(): Promise<HeartDesign[]> {
  try {
    const response = await fetch('/hearts/index.json');
    if (!response.ok) return [];

    const index: { hearts: string[] } = await response.json();
    const designs = await Promise.all(
      index.hearts.map(async (id) => {
        try {
          const heartResponse = await fetch(`/hearts/${id}.json`);
          if (!heartResponse.ok) return null;
          return (await heartResponse.json()) as HeartDesign;
        } catch {
          // Skip invalid hearts
          return null;
        }
      })
    );

    return designs.filter((d): d is HeartDesign => d !== null);
  } catch {
    return [];
  }
}

export async function loadAllHearts(): Promise<HeartDesign[]> {
  const staticHearts = await loadStaticHearts();
  const userHearts = getUserCollection();

  // User hearts come first, marked with isUserCreated
  return [
    ...userHearts.map((h) => ({ ...h, isUserCreated: true })),
    ...staticHearts
  ];
}
