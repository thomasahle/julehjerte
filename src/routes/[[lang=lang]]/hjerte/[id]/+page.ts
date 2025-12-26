import heartsData from '$lib/data/hearts.json';

export const prerender = true;

// Generate all possible heart page URLs for prerendering
export function entries() {
	const allHeartIds = heartsData.categories.flatMap((cat) => cat.hearts);

	// Generate entries for both languages (da = default/no lang, en)
	return [
		...allHeartIds.map((id) => ({ lang: undefined, id })), // Danish (default)
		...allHeartIds.map((id) => ({ lang: 'en', id })) // English
	];
}
