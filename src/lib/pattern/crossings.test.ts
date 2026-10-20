import { describe, expect, it } from 'vitest';
import { getCenteredRectParams } from '$lib/utils/overlapRect';
import { opposite } from './rules';
import { ruleStart } from './starts';
import { generateEditorFingers } from './editorBridge';
import { READ_TOLERANCE, sharedCrossings } from './crossings';

describe('where the cuts of a heart drawn from a tile cross', () => {
	it('finds every crossing at a node of both cuts, in order along each', () => {
		const tile = ruleStart(opposite('move', 'turn'), 3);
		const rect = getCenteredRectParams({ x: 4, y: 4 });
		const fingers = generateEditorFingers(tile, rect);
		const crossings = sharedCrossings(fingers, { x: 4, y: 4 }, READ_TOLERANCE)!;
		expect(crossings).toHaveLength(3);
		for (const [j, row] of crossings.entries()) {
			expect(row).toHaveLength(3);
			for (const [i, c] of row.entries()) {
				const left = fingers.find((f) => f.id === `L-${j + 1}`)!.segments;
				const right = fingers.find((f) => f.id === `R-${i + 1}`)!.segments;
				const a = left[c.left]!.p0;
				const b = right[c.right]!.p0;
				expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-9);
				// on the plain grid, where the cells meet
				expect(Math.abs(a.x - (rect.left + ((i + 1) * rect.width) / 4))).toBeLessThan(1e-6);
			}
		}
	});

	it('finds none where the cuts cross between their nodes', () => {
		const tile = ruleStart(opposite('move', 'turn'), 3);
		const rect = getCenteredRectParams({ x: 4, y: 4 });
		// one piece a cut, end to end: the cuts cross, but at no node of either
		const lines = generateEditorFingers(tile, rect).map((f) => ({ ...f, segments: [{ ...f.segments[0]!, p3: f.segments[f.segments.length - 1]!.p3 }] }));
		expect(sharedCrossings(lines, { x: 4, y: 4 }, READ_TOLERANCE)).toBeNull();
		// and a cut missing altogether
		expect(sharedCrossings(generateEditorFingers(tile, rect).filter((f) => f.id !== 'R-2'), { x: 4, y: 4 }, READ_TOLERANCE)).toBeNull();
	});
});
