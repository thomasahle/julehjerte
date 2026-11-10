import { describe, expect, it } from 'vitest';
import { normalizeHeartDesign, serializeHeartDesign } from './heartDesign';
import { DESIGN_JSON, TILE_JSON } from './fixtures/storedForms';

// A heart's JSON form (`HeartDesignJson`) is what "Mine hjerter", the editor's
// draft and every link carry: whatever the site wrote once must keep opening.

const parsed = (json: string) => JSON.parse(json) as Record<string, unknown>;
/** What the site writes for a heart read from `raw`. */
const rewritten = (raw: unknown) => JSON.stringify(serializeHeartDesign(normalizeHeartDesign(raw)!));

describe("a heart's stored JSON", () => {
	it('is written as the site wrote it on 10 Nov 2026', () => {
		expect(rewritten(parsed(DESIGN_JSON))).toBe(DESIGN_JSON);
		expect(rewritten(parsed(TILE_JSON))).toBe(TILE_JSON);
	});

	it('reads what the site wrote', () => {
		const heart = normalizeHeartDesign(parsed(DESIGN_JSON))!;
		expect(heart).toMatchObject({
			id: 'user-5b0c9a7e',
			name: 'Mit hjerte',
			author: 'Ida',
			description: 'Til mor',
			weaveParity: 1,
			colors: { left: '#0b3d2c', right: '#f5c518' },
			gridSize: { x: 3, y: 3 }
		});
		// The interior cuts, and the outer edges the editor draws around them.
		expect(heart.fingers.map((f) => f.id)).toEqual(['L-1', 'L-2', 'R-1', 'R-2', 'L-edge-187.5', 'L-edge-412.5', 'R-edge-187.5', 'R-edge-412.5']);
		expect(heart.fingers[0].nodeTypes).toEqual({ '0': 'corner' });
		const tile = normalizeHeartDesign(parsed(TILE_JSON))!;
		expect(tile).toMatchObject({ names: { da: 'Fisk', en: 'Fish' }, descriptions: { da: 'En fisk' }, colors: undefined });
		expect(tile.pattern).toEqual(parsed(TILE_JSON).pattern);
	});

	it('reads the older forms: before colours, names and paragraphs, a single grid size, cuts without ids', () => {
		const { colors: _colors, ...september } = parsed(DESIGN_JSON);
		expect(rewritten(september)).toBe(JSON.stringify(september));
		expect(normalizeHeartDesign(september)!.colors).toBeUndefined();
		expect(rewritten({ ...parsed(DESIGN_JSON), gridSize: 3 })).toBe(DESIGN_JSON);
		const nameless = normalizeHeartDesign({
			...parsed(DESIGN_JSON),
			fingers: (parsed(DESIGN_JSON).fingers as Record<string, unknown>[]).map(({ id: _id, ...finger }) => finger)
		})!;
		expect(nameless.fingers.filter((f) => /^[LR]-tmp-/.test(f.id))).toHaveLength(4);
		expect(normalizeHeartDesign({ ...parsed(DESIGN_JSON), weaveParity: undefined })!.weaveParity).toBe(0);
		// Before the tiles' corners could move, a tile kept how far it leaned.
		const leaning = { ...(parsed(TILE_JSON).pattern as object), offset: [0.1, -0.2] };
		expect(normalizeHeartDesign({ ...parsed(TILE_JSON), pattern: leaning })!.pattern).toEqual(leaning);
	});

	it('reads past fields it does not know, such as a version', () => {
		expect(rewritten({ v: 1, ...parsed(DESIGN_JSON), later: { anything: true } })).toBe(DESIGN_JSON);
	});

	it('reads anything that is an object as a heart, and nothing else', () => {
		for (const junk of [null, undefined, 42, 'heart', true]) expect(normalizeHeartDesign(junk)).toBeNull();
		// An object with nothing of a heart in it is a blank one.
		expect(normalizeHeartDesign({})).toMatchObject({ id: '', name: 'Untitled', gridSize: { x: 2, y: 2 } });
		expect(normalizeHeartDesign([])).toMatchObject({ id: '', name: 'Untitled' });
	});
});
