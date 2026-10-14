/** A4 portrait drawing area, with a 10 mm overlap for joining neighbouring sheets. */
export function templateTiles(widthMm: number) {
	if (!Number.isFinite(widthMm) || widthMm < 80 || widthMm > 1000)
		throw new Error('Paper width must be 80–1000 mm');
	const width = 180,
		height = 228,
		overlap = 10;
	const columns = Math.max(
		1,
		Math.ceil((widthMm + 2 - overlap) / (width - overlap))
	);
	const rows = Math.max(
		1,
		Math.ceil((1.5 * widthMm + 2 - overlap) / (height - overlap))
	);
	return { width, height, overlap, columns, rows, pages: 2 * columns * rows };
}
