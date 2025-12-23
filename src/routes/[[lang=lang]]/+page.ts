import type { PageLoad } from './$types';
import index from '$lib/data/hearts.json';

// Enable SSR for meta tags (crawlers need them in initial HTML)
export const prerender = true;
export const ssr = true;

export const load: PageLoad = async () => {
  return {
    indexCategories: Array.isArray(index.categories) ? index.categories : []
  };
};
