/** A heart whose paper is too thin in one known place, for $lib/geometry/paperNecks's tests and its users'. */
import type { Finger, HeartDesign, Vec } from '$lib/types/heart';
import { getCenteredRectParams } from '$lib/utils/overlapRect';

const grid = { x: 3, y: 3 };
const rect = getCenteredRectParams(grid);
/** Millimetres on a template printed 80 mm wide, in the design's pixels. */
const mm = rect.width / 80;

/** A cut through the points, straight from each to the next. */
const cut = (id: string, lobe: 'left' | 'right', points: Vec[]): Finger => ({
	id, lobe,
	segments: points.slice(1).map((p3, i) => {
		const p0 = points[i]!;
		return { p0, p1: { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 }, p2: { x: p0.x + (2 * (p3.x - p0.x)) / 3, y: p0.y + (2 * (p3.y - p0.y)) / 3 }, p3 };
	})
});

/** The plain 3 × 3 heart, its left lobe's middle cut `L-1` bent towards `L-2` to `gap` mm from it, at two thirds of the way out. */
export function bentHeart(gap?: number): HeartDesign {
	const y = (i: number) => rect.top + (i / 3) * rect.height, x = (i: number) => rect.left + (i / 3) * rect.width;
	const fingers: Finger[] = [];
	for (let i = 0; i <= 3; i++) {
		const bent = i === 1 && gap !== undefined;
		const at = rect.left + 0.6 * rect.width, near = y(2) - gap! * mm;
		fingers.push(cut(`L-${i}`, 'left', bent
			? [{ x: rect.right, y: y(i) }, { x: at + 4 * mm, y: y(i) }, { x: at, y: near }, { x: at - 4 * mm, y: y(i) }, { x: rect.left, y: y(i) }]
			: [{ x: rect.right, y: y(i) }, { x: rect.left, y: y(i) }]));
		fingers.push(cut(`R-${i}`, 'right', [{ x: x(i), y: rect.bottom }, { x: x(i), y: rect.top }]));
	}
	return { id: 'test', name: 'Test', gridSize: grid, weaveParity: 0, fingers } as HeartDesign;
}
