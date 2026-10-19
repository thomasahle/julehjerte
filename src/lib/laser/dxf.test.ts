import { describe, expect, it } from 'vitest';
import type { Vec } from '$lib/types/heart';
import { serializeLaserDxf } from './dxf';
import { planLaserSheet } from './export';
import { SHEETS } from './sheet';
import { loadHeart } from './testHearts.test-helpers';

type Pair = { code: number; value: string };
interface Entity {
	type: string;
	codes: Pair[];
	vertices: (Vec & { bulge: number })[];
}

/** Just enough of a DXF reader: pairs, the header's variables, layers and entities. */
function readDxf(text: string) {
	const lines = text.split('\n');
	if (lines[lines.length - 1] === '') lines.pop();
	expect(lines.length % 2).toBe(0);
	const pairs: Pair[] = [];
	for (let i = 0; i < lines.length; i += 2) pairs.push({ code: Number(lines[i]!.trim()), value: lines[i + 1]! });
	expect(pairs[pairs.length - 1]).toEqual({ code: 0, value: 'EOF' });

	const header = new Map<string, Pair[]>();
	const layers = new Map<string, number>();
	const entities: Entity[] = [];
	let section = '';
	let current: Entity | null = null;
	let polyline: Entity | null = null;
	let variable = '';
	const get = (e: Entity, code: number) => e.codes.find((p) => p.code === code)?.value;

	const finish = () => {
		if (!current) return;
		if (section === 'TABLES' && current.type === 'LAYER') {
			layers.set(get(current, 2)!, Number(get(current, 62)));
		} else if (section === 'ENTITIES') {
			if (current.type === 'VERTEX') {
				polyline!.vertices.push({
					x: Number(get(current, 10)),
					y: Number(get(current, 20)),
					bulge: Number(get(current, 42) ?? 0)
				});
			} else if (current.type === 'SEQEND') {
				polyline = null;
			} else {
				entities.push(current);
				if (current.type === 'POLYLINE') polyline = current;
			}
		}
		current = null;
	};

	for (let i = 0; i < pairs.length; i++) {
		const { code, value } = pairs[i]!;
		if (code === 0) {
			finish();
			if (value === 'SECTION') {
				section = pairs[++i]!.value;
			} else if (value !== 'ENDSEC' && value !== 'EOF') {
				current = { type: value, codes: [], vertices: [] };
			}
		} else if (section === 'HEADER' && code === 9) {
			variable = value;
			header.set(variable, []);
		} else if (section === 'HEADER') {
			header.get(variable)!.push({ code, value });
		} else if (current) {
			current.codes.push({ code, value });
		}
	}
	return { header, layers, entities, get };
}

describe('serializeLaserDxf', () => {
	const classic = loadHeart('classic-3x3');
	const plan = planLaserSheet(classic, { widthMm: 80, count: 2, sheet: SHEETS.A4, lobe: 'left' });

	it('is R12 in millimetres, with its extents', () => {
		const { header } = readDxf(serializeLaserDxf(plan));
		expect(header.get('$ACADVER')).toEqual([{ code: 1, value: 'AC1009' }]);
		expect(header.get('$INSUNITS')).toEqual([{ code: 70, value: '4' }]);
		// Two 80 × 240 pieces from (5, 5), y flipped: 297 − 5 = 292 at the top.
		expect(header.get('$EXTMIN')!.map((p) => p.value)).toEqual(['5', '52', '0']);
		expect(header.get('$EXTMAX')!.map((p) => p.value)).toEqual(['170', '292', '0']);
	});

	it('has one red CUT layer', () => {
		const { layers } = readDxf(serializeLaserDxf(plan));
		expect(Object.fromEntries(layers)).toEqual({ CUT: 1 });
	});

	it('writes only POLYLINEs, all on CUT: the fold is not drawn', () => {
		const { entities, get } = readDxf(serializeLaserDxf(plan));
		expect(entities.map((e) => e.type)).toEqual(Array(6).fill('POLYLINE'));
		expect(entities.every((e) => get(e, 8) === 'CUT' && get(e, 62) === '1')).toBe(true);
	});

	it('writes each outline as one closed four-vertex polyline with bulging ears, y up', () => {
		const { entities, get } = readDxf(serializeLaserDxf(plan));
		const outlines = entities.filter((e) => get(e, 70) === '1');
		expect(outlines).toHaveLength(2);
		const [first] = outlines;
		expect(get(first!, 8)).toBe('CUT');
		expect(first!.vertices.map((v) => v.bulge)).toEqual([1, 0, 1, 0]);
		// Bottom-left first, then round the piece counter-clockwise.
		expect(first!.vertices.map(({ x, y }) => [x, y])).toEqual([
			[5, 92],
			[85, 92],
			[85, 252],
			[5, 252]
		]);
		// A bulge of +1 is a counter-clockwise half circle: its middle lies to
		// the right of the chord, which is below the bottom edge and above the top.
		const apex = (a: Vec, b: Vec) => {
			const half = Math.hypot(b.x - a.x, b.y - a.y) / 2;
			const dir = { x: (b.x - a.x) / (2 * half), y: (b.y - a.y) / (2 * half) };
			return { x: (a.x + b.x) / 2 + dir.y * half, y: (a.y + b.y) / 2 - dir.x * half };
		};
		const v = first!.vertices;
		expect(apex(v[0]!, v[1]!)).toEqual({ x: 45, y: 52 });
		expect(apex(v[2]!, v[3]!)).toEqual({ x: 45, y: 292 });
	});

	it('writes a straight cut through the fold as two vertices', () => {
		const { entities, get } = readDxf(serializeLaserDxf(plan));
		const cuts = entities.filter((e) => get(e, 70) === '0');
		expect(cuts).toHaveLength(4);
		for (const cut of cuts) {
			expect(cut.vertices).toHaveLength(2);
			// From the ear base to the mirrored ear base: 297 − (5 + 40), 297 − (5 + 200).
			expect(cut.vertices.map((v) => v.y)).toEqual([252, 92]);
		}
	});

	it('flattens curved cuts, and never writes a path twice', () => {
		const stjerne = planLaserSheet(loadHeart('stjerne'), { widthMm: 80, count: 4, sheet: SHEETS.A3, lobe: 'left' });
		const { entities } = readDxf(serializeLaserDxf(stjerne));
		const polylines = entities.filter((e) => e.type === 'POLYLINE');
		expect(polylines.length).toBe(stjerne.pieces.length * 3);
		expect(Math.max(...polylines.map((p) => p.vertices.length))).toBeGreaterThan(10);
		const keys = polylines.map((p) => JSON.stringify(p.vertices));
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('writes orientation marks on a blue MARK layer of their own, and none for the classic heart', () => {
		const jul = loadHeart('jul');
		const julPlan = planLaserSheet(jul, { widthMm: 80, count: 1, sheet: SHEETS.A4, lobe: 'left' });
		const { layers, entities, get } = readDxf(serializeLaserDxf(julPlan));
		expect(Object.fromEntries(layers)).toEqual({ CUT: 1, MARK: 5 });
		const marks = entities.filter((e) => get(e, 8) === 'MARK');
		expect(marks.every((e) => get(e, 62) === '5')).toBe(true);
		// ⊗: two strokes and a closed circle of two half circles.
		expect(marks).toHaveLength(3);
		const circle = marks.find((e) => get(e, 70) === '1')!;
		expect(circle.vertices.map((v) => v.bulge)).toEqual([1, 1]);
		// The cuts are as many as without marks: the outline and every cut.
		const piece = julPlan.pieces[0]!.piece;
		expect(entities.filter((e) => get(e, 8) === 'CUT')).toHaveLength(1 + piece.cuts.length);
		// On the piece, by its left side, below the ear base (y up: under the top's ear).
		const [mark] = piece.marks;
		const { x, y } = julPlan.pieces[0]!;
		expect(circle.vertices[0]!.x).toBeCloseTo(x + mark!.x - mark!.r, 2);
		expect(circle.vertices[0]!.y).toBeCloseTo(297 - (y + mark!.y), 2);

		const right = planLaserSheet(jul, { widthMm: 80, count: 1, sheet: SHEETS.A4, lobe: 'right' });
		const r = readDxf(serializeLaserDxf(right));
		expect(r.entities.filter((e) => r.get(e, 8) === 'MARK')).toHaveLength(2);

		expect(Object.fromEntries(readDxf(serializeLaserDxf(plan)).layers)).toEqual({ CUT: 1 });
	});
});
