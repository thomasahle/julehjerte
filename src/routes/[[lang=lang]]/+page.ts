import type { PageLoad } from './$types';
import index from '$lib/data/hearts.json';
import { getGalleryDesign } from '$lib/data/heartDesigns';
import type { HeartDesign } from '$lib/types/heart';

// Enable SSR for meta tags (crawlers need them in initial HTML)
export const prerender = true;
export const ssr = true;

export const load: PageLoad = async () => {
  const indexCategories = Array.isArray(index.categories) ? index.categories : [];

  // Precomputed designs (scripts/generate-heart-data.mjs) so the cards are in the
  // prerendered HTML. User-created hearts live in localStorage and load in the browser.
  const designs: Record<string, HeartDesign> = {};
  for (const id of indexCategories.flatMap((category) => category.hearts)) {
    const design = getGalleryDesign(id);
    if (design) designs[id] = design;
  }

  return { indexCategories, designs };
};
