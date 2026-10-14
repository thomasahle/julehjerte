/** A circular medallion, then two independent outer bands. The motif is a
 * nested contour inside the circle; counters remain coincident A/B cuts. */
import { add, compile, ConstructionError, type Ring, type Point } from './geometry';
import { generateFittedFigure } from './fitted';

export function generateLayeredFigure(rings: Ring[], size = 70, scale = .7) {
	if (!rings.flat().length) throw new ConstructionError('empty', 'No contour');
	const circle: Ring = Array.from({ length: 96 }, (_, i) =>
		[.5 * Math.cos(i * Math.PI / 48), .5 * Math.sin(i * Math.PI / 48)] as Point
	);
	const shapes = [circle, ...rings.map(r => r.map(([x, y]) => [x * scale, y * scale] as Point))];
	const result = generateFittedFigure(shapes, size, 1);
	const inset = (100 - size) / 2 - 8;
	for (const t of [inset, 100 - inset]) {
		add(result.edges, [[t, 0], [t, 100]], 'A', 'frame');
		add(result.edges, [[0, t], [100, t]], 'B', 'frame');
	}
	return { ...result, geometry: compile(result.edges) };
}
