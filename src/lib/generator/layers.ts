/** A circular medallion, then two independent outer bands. The motif is a
 * nested contour inside the circle; counters remain coincident A/B cuts. */
import { add, compile, fourPortMotif, forest, centroid, ConstructionError, type Ring, type Point } from './geometry';
import { generateFittedFigure } from './fitted';
import { generatePanelFigure } from './panels';

export function generateLayeredFigure(rings: Ring[], size = 70, scale = .7,
	panels?: { columns: number; rows: number; filled: boolean; adaptive?: boolean; shear?: number; counterSeams?: boolean }, route = fourPortMotif) {
	if (!rings.flat().length) throw new ConstructionError('empty', 'No contour');
	const circle: Ring = Array.from({ length: 96 }, (_, i) =>
		[.5 * Math.cos(i * Math.PI / 48), .5 * Math.sin(i * Math.PI / 48)] as Point
	);
	const shapes = [circle, ...rings.map(r => r.map(([x, y]) => [x * scale, y * scale] as Point))];
	let junction: Point | undefined;
	if (panels?.counterSeams) {
		// Open the motif's counters onto the panel seams. A median keeps the
		// four panels broad while passing through a central row/column of
		// details; the visible motif and both surrounding bands stay intact.
		const counters = forest(rings).flatMap(node => node.children).map(node => centroid(node.ring));
		if (!counters.length) throw new ConstructionError('topology', 'No enclosed counter for panel seams');
		const median = (axis: 0 | 1) => counters.map(point => point[axis] * size * scale)
			.sort((a, b) => a - b)[Math.floor(counters.length / 2)];
		junction = [median(0), median(1)];
	}
	const result = panels
		? generatePanelFigure(shapes, undefined, size, 1, panels.columns, 'check', panels.rows, false, route,
			panels.counterSeams ? 'components' : panels.filled ? 'filled' : 'ray', panels.adaptive, panels.shear, undefined, junction)
		: generateFittedFigure(shapes, size, 1, route);
	if (panels) {
		// The fitted recipe already includes this band. Panel routing must
		// retain it too, so decomposing the medallion preserves both borders.
		const band = (100 - size) / 2 - 4;
		for (const t of [band, 100 - band]) {
			add(result.edges, [[t, 0], [t, 100]], 'A', 'frame');
			add(result.edges, [[0, t], [100, t]], 'B', 'frame');
		}
	}
	const inset = (100 - size) / 2 - 8;
	for (const t of [inset, 100 - inset]) {
		add(result.edges, [[t, 0], [t, 100]], 'A', 'frame');
		add(result.edges, [[0, t], [100, t]], 'B', 'frame');
	}
	return { ...result, geometry: compile(result.edges) };
}
