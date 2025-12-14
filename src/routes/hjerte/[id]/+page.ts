// Pre-render known template pages at build time
export const prerender = true;

// Generate entries for all static hearts
export function entries() {
	// Known static heart IDs
	const staticHearts = [
		'classic-3x3',
		'classic-4x4',
		'classic-5x5',
		'scalloped-4x4',
		'wavy-3x3',
		'wavy-4x4',
		'hourglass-3x3',
		'hourglass-4x4',
		'zigzag-3x3',
		'zigzag-4x4',
		'deep-wave-4x4',
		'bulge-3x3'
	];

	return staticHearts.map((id) => ({ id }));
}
