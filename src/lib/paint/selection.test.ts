import { describe, expect, it } from 'vitest';
import { createMask, shareAt, type Mask } from './mask';
import {
	MIN_SIZE,
	boundsOf,
	clear,
	commit,
	contains,
	cornerAt,
	corners,
	fenceOf,
	keepOutside,
	isEmptyRect,
	isUnmoved,
	lift,
	middleRect,
	moveBy,
	placementOf,
	rectFrom,
	resizeBy,
	rotateHandleAt,
	rotateTo,
	scaleTo,
	stamp,
	turnBy
} from './selection';
import { EDIT_CLEARED, EDIT_LAID, EDIT_NONE, stamp as dab, stroke } from './tools';
import { transformsFor } from './symmetry';

/** A mask from rows of `.` and `#`, so a patch can be read at a glance. */
function maskOf(rows: string[]): Mask {
	const m = createMask(0, rows.length);
	rows.forEach((row, y) => {
		[...row].forEach((c, x) => {
			m.data[y * m.size + x] = c === '#' ? 1 : 0;
		});
	});
	return m;
}

/** Where along row `y` the edge crosses, between the cells' centres. */
function crossings(m: Mask, y: number): number[] {
	const out: number[] = [];
	for (let x = 0; x + 1 < m.size; x++) {
		const a = shareAt(m, y * m.size + x), b = shareAt(m, y * m.size + x + 1);
		if ((a >= 128) !== (b >= 128)) out.push(x + (127.5 - a) / (b - a));
	}
	return out;
}

function rowsOf(m: Mask): string[] {
	const out: string[] = [];
	for (let y = 0; y < m.size; y++) {
		let row = '';
		for (let x = 0; x < m.size; x++) row += m.data[y * m.size + x] ? '#' : '.';
		out.push(row);
	}
	return out;
}

describe('rectFrom', () => {
	it('takes its corners in any order and keeps every cell the drag touched', () => {
		const m = createMask(0, 10);
		expect(rectFrom({ x: 6.7, y: 5.2 }, { x: 2.1, y: 1.9 }, m)).toEqual({
			x0: 2,
			y0: 1,
			x1: 7,
			y1: 6
		});
	});

	it('clips to the mask instead of running off it', () => {
		const m = createMask(0, 10);
		expect(rectFrom({ x: -4, y: -9 }, { x: 3, y: 2 }, m)).toEqual({ x0: 0, y0: 0, x1: 3, y1: 2 });
		expect(rectFrom({ x: 8, y: 8 }, { x: 40, y: 40 }, m)).toEqual({
			x0: 8,
			y0: 8,
			x1: 10,
			y1: 10
		});
	});
});

describe('lift', () => {
	it('copies the cells and leaves the mask exactly as it was', () => {
		const m = maskOf(['....', '.##.', '.#..', '....']);
		const before = rowsOf(m);
		const sel = lift(m, { x0: 1, y0: 1, x1: 3, y1: 3 })!;
		expect([...sel.cells]).toEqual([1, 1, 1, 0]);
		expect(rowsOf(m)).toEqual(before);
		// Really a copy: painting on the mask afterwards must not reach the patch.
		m.data[1 * 4 + 1] = 0;
		expect(sel.cells[0]).toBe(1);
	});

	it('says no to a rectangle with no cells in it', () => {
		const m = createMask(0, 4);
		expect(lift(m, { x0: 2, y0: 2, x1: 2, y1: 3 })).toBeNull();
	});

	it('starts standing exactly where it was lifted', () => {
		expect(placementOf({ x0: 2, y0: 4, x1: 6, y1: 10 })).toEqual({
			cx: 4,
			cy: 7,
			width: 4,
			height: 6,
			angle: 0
		});
	});
});

describe('commit', () => {
	it('moves the cells and leaves paper behind', () => {
		const m = maskOf(['##..', '#...', '....', '....']);
		const sel = lift(m, { x0: 0, y0: 0, x1: 2, y1: 2 })!;
		sel.placement = moveBy(sel.placement, 2, 2);
		const { box } = commit(m, sel);
		expect(rowsOf(m)).toEqual(['....', '....', '..##', '..#.']);
		expect(box).toEqual({ x0: 0, y0: 0, x1: 4, y1: 4 });
	});

	it('keeps the overlap when the patch is dragged only a little', () => {
		const m = maskOf(['##..', '##..', '....', '....']);
		const sel = lift(m, { x0: 0, y0: 0, x1: 2, y1: 2 })!;
		sel.placement = moveBy(sel.placement, 1, 0);
		commit(m, sel);
		// The vacated column is written before the cells land, so the one column the
		// patch still covers is ink and not the hole it was lifted from.
		expect(rowsOf(m)).toEqual(['.##.', '.##.', '....', '....']);
	});

	it('leaves the picture as it was when the patch is put back where it came from', () => {
		const m = maskOf(['.#..', '.##.', '....', '....']);
		const sel = lift(m, { x0: 1, y0: 0, x1: 3, y1: 2 })!;
		// The box is what to repaint, not what ended up different: vacating cleared
		// the ink and the stamp wrote it back, so both passes touched those cells,
		// and the cell round them where the patch's side says where the edge lies.
		expect(commit(m, sel).box).toEqual({ x0: 0, y0: 0, x1: 4, y1: 3 });
		expect(rowsOf(m)).toEqual(['.#..', '.##.', '....', '....']);
	});

	it('marks every cell it touched, and the patch over the hole where they meet', () => {
		const m = maskOf(['##..', '##..', '....', '....']);
		const sel = lift(m, { x0: 0, y0: 0, x1: 2, y1: 2 })!;
		sel.placement = moveBy(sel.placement, 1, 0);
		const { marks } = commit(m, sel);
		// The column the patch still covers was vacated first and laid on after, and
		// symmetry has to be told the patch won there. Beside it, its side moved
		// only the edge, and that gives way to a patch.
		expect([...marks.slice(0, 4)]).toEqual([EDIT_CLEARED, EDIT_LAID, EDIT_LAID, EDIT_CLEARED]);
		expect([...marks.slice(8, 12)]).toEqual([EDIT_CLEARED, EDIT_CLEARED, EDIT_CLEARED, EDIT_CLEARED]);
		expect([...marks.slice(12, 16)]).toEqual([EDIT_NONE, EDIT_NONE, EDIT_NONE, EDIT_NONE]);
		// Cells the patch covered but did not change are marked all the same: the
		// hole's mirror image would otherwise be the only claim on them.
		const blank = maskOf(['##..', '##..', '....', '....']);
		const same = lift(blank, { x0: 0, y0: 0, x1: 2, y1: 2 })!;
		expect([...commit(blank, same).marks.slice(0, 2)]).toEqual([EDIT_LAID, EDIT_LAID]);
	});

	it('writes only 0 and 1, so a two-colour mask stays two-colour', () => {
		const m = maskOf(['####', '#..#', '#..#', '####']);
		const sel = lift(m, { x0: 0, y0: 0, x1: 4, y1: 4 })!;
		sel.placement = rotateTo({ ...sel.placement }, { x: 3, y: 2 });
		sel.placement = scaleTo(sel.placement, 'se', { x: 7, y: 7 }, true);
		commit(m, sel);
		expect(m.data.every((v) => v === 0 || v === 1)).toBe(true);
	});
});

describe('edges between the cells', () => {
	it('carries an edge along by a fraction of a cell', () => {
		const m = createMask(0, 40);
		dab(m, 20, 20, { radius: 6, value: 1 });
		const sel = lift(m, { x0: 10, y0: 10, x1: 30, y1: 30 })!;
		sel.placement = moveBy(sel.placement, 0.4, 0);
		commit(m, sel);
		const [left, right] = crossings(m, 20);
		expect(left).toBeCloseTo(14.4, 1);
		expect(right).toBeCloseTo(26.4, 1);
	});

	it('keeps a disc round when the patch is scaled up, and not a stair of its cells', () => {
		const m = createMask(0, 40);
		dab(m, 10, 10, { radius: 4, value: 1 });
		const sel = lift(m, { x0: 4, y0: 4, x1: 17, y1: 17 })!;
		sel.placement = { cx: 20, cy: 20, width: 32.5, height: 32.5, angle: 0 };
		commit(m, sel);
		// Radius 10 about 19.5.
		for (const y of [20, 22, 25]) {
			const chord = Math.sqrt(100 - (y - 19.5) ** 2), [left, right] = crossings(m, y);
			expect(Math.abs(left! - (19.5 - chord))).toBeLessThan(0.15);
			expect(Math.abs(right! - (19.5 + chord))).toBeLessThan(0.15);
		}
	});

	it('lays a turned patch on a strip with a straight side', () => {
		const m = createMask(0, 40);
		for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (y >= 12 && y < 28) m.data[y * 40 + x] = 1;
		const sel = lift(m, { x0: 0, y0: 0, x1: 10, y1: 10 })!;
		sel.placement = { cx: 20, cy: 20, width: 12, height: 12, angle: 0.3 };
		commit(m, sel);
		// The patch's left paper meets the strip along the turned square's side.
		const side = (y: number) => crossings(m, y)[0]!;
		const slope = (side(22) - side(18)) / 4;
		for (const y of [17, 19, 21, 23]) expect(Math.abs(side(y) - side(18) - slope * (y - 18))).toBeLessThan(0.05);
	});
});

describe('clear', () => {
	it('empties the area the selection was lifted from and nothing else', () => {
		const m = maskOf(['####', '####', '####', '####']);
		const sel = lift(m, { x0: 1, y0: 1, x1: 3, y1: 3 })!;
		sel.placement = moveBy(sel.placement, 1, 1);
		expect(clear(m, sel).box).toEqual({ x0: 1, y0: 1, x1: 3, y1: 3 });
		expect(rowsOf(m)).toEqual(['####', '#..#', '#..#', '####']);
	});
});

describe('stamp', () => {
	it('turns a quarter clockwise exactly, cell for cell', () => {
		const m = maskOf(['#...', '....', '....', '....']);
		const sel = lift(m, { x0: 0, y0: 0, x1: 4, y1: 4 })!;
		sel.placement = { ...sel.placement, angle: Math.PI / 2 };
		clear(m, sel);
		stamp(m, sel);
		// The top-left cell has come round to the top-right.
		expect(rowsOf(m)).toEqual(['...#', '....', '....', '....']);
	});

	it('comes back to itself after four quarter turns', () => {
		const rows = ['#.#.', '##..', '...#', '.#..'];
		const m = maskOf(rows);
		const sel = lift(m, { x0: 0, y0: 0, x1: 4, y1: 4 })!;
		for (let i = 0; i < 4; i++) {
			sel.placement = { ...sel.placement, angle: (Math.PI / 2) * (i + 1) };
			clear(m, sel);
			stamp(m, sel);
		}
		expect(rowsOf(m)).toEqual(rows);
	});

	it('doubles each cell when the patch is scaled by two', () => {
		const m = maskOf(['#...', '....', '....', '....']);
		const sel = lift(m, { x0: 0, y0: 0, x1: 2, y1: 2 })!;
		sel.placement = { cx: 2, cy: 2, width: 4, height: 4, angle: 0 };
		clear(m, sel);
		stamp(m, sel);
		expect(rowsOf(m)).toEqual(['##..', '##..', '....', '....']);
	});

	it('writes only the cells that are still on the mask', () => {
		const m = maskOf(['....', '....', '....', '....']);
		const sel = lift(m, { x0: 0, y0: 0, x1: 2, y1: 2 })!;
		sel.cells.fill(1);
		sel.placement = moveBy(sel.placement, -1, -1);
		stamp(m, sel);
		expect(rowsOf(m)).toEqual(['#...', '....', '....', '....']);
	});

	it('reports the box it covered, and the cell round it its side reaches, and nothing wider', () => {
		const m = createMask(0, 8);
		const sel = lift(m, { x0: 0, y0: 0, x1: 2, y1: 2 })!;
		sel.cells.fill(1);
		sel.placement = moveBy(sel.placement, 4, 4);
		expect(stamp(m, sel)).toEqual({ x0: 3, y0: 3, x1: 7, y1: 7 });
		expect(rowsOf(m).slice(3, 7)).toEqual(['........', '....##..', '....##..', '........']);
	});
});

describe('scaleTo', () => {
	it('leaves the opposite corner exactly where it was', () => {
		const start = placementOf({ x0: 2, y0: 2, x1: 6, y1: 6 });
		const anchor = cornerAt(start, 'nw');
		const scaled = scaleTo(start, 'se', { x: 10, y: 12 }, false);
		expect(cornerAt(scaled, 'nw').x).toBeCloseTo(anchor.x, 10);
		expect(cornerAt(scaled, 'nw').y).toBeCloseTo(anchor.y, 10);
		expect(cornerAt(scaled, 'se').x).toBeCloseTo(10, 10);
		expect(cornerAt(scaled, 'se').y).toBeCloseTo(12, 10);
	});

	it('keeps the shape unless free scaling is asked for', () => {
		const start = placementOf({ x0: 0, y0: 0, x1: 4, y1: 2 });
		const locked = scaleTo(start, 'se', { x: 8, y: 3 }, true);
		expect(locked.width / locked.height).toBeCloseTo(start.width / start.height, 10);
		const free = scaleTo(start, 'se', { x: 8, y: 3 }, false);
		expect(free.width).toBeCloseTo(8, 10);
		expect(free.height).toBeCloseTo(3, 10);
	});

	it('stops at one cell instead of folding through itself', () => {
		const start = placementOf({ x0: 0, y0: 0, x1: 4, y1: 4 });
		const crossed = scaleTo(start, 'se', { x: -10, y: -10 }, false);
		expect(crossed.width).toBe(MIN_SIZE);
		expect(crossed.height).toBe(MIN_SIZE);
	});

	it('drags the corner along the turned axes, not the mask’s', () => {
		const start = { cx: 4, cy: 4, width: 4, height: 2, angle: Math.PI / 2 };
		const anchor = cornerAt(start, 'nw');
		const scaled = scaleTo(start, 'se', cornerAt(start, 'se'), false);
		// Dragging a corner to where it already is changes nothing.
		expect(scaled.width).toBeCloseTo(start.width, 10);
		expect(scaled.height).toBeCloseTo(start.height, 10);
		expect(cornerAt(scaled, 'nw').x).toBeCloseTo(anchor.x, 10);
	});
});

describe('rotateTo', () => {
	it('is unturned when the handle points straight up', () => {
		const p = placementOf({ x0: 0, y0: 0, x1: 4, y1: 4 });
		expect(rotateTo(p, { x: 2, y: -6 }).angle).toBeCloseTo(0, 10);
	});

	it('turns a quarter when the handle is dragged to the right', () => {
		const p = placementOf({ x0: 0, y0: 0, x1: 4, y1: 4 });
		expect(rotateTo(p, { x: 9, y: 2 }).angle).toBeCloseTo(Math.PI / 2, 10);
	});

	it('turns about the centre and leaves the size alone', () => {
		const p = placementOf({ x0: 0, y0: 0, x1: 4, y1: 2 });
		const turned = rotateTo(p, { x: 8, y: 1 });
		expect(turned.cx).toBe(p.cx);
		expect(turned.cy).toBe(p.cy);
		expect(turned.width).toBe(p.width);
		expect(turned.height).toBe(p.height);
	});

	it('keeps the handle out beyond the edge however flat the patch is', () => {
		const p = { cx: 5, cy: 5, width: 6, height: MIN_SIZE, angle: 0 };
		const handle = rotateHandleAt(p, 3);
		expect(handle.x).toBeCloseTo(5, 10);
		expect(handle.y).toBeCloseTo(5 - (MIN_SIZE / 2 + 3), 10);
	});

	it('carries the handle round with the marquee', () => {
		const p = { cx: 5, cy: 5, width: 4, height: 4, angle: Math.PI / 2 };
		const handle = rotateHandleAt(p, 2);
		expect(handle.x).toBeCloseTo(9, 10);
		expect(handle.y).toBeCloseTo(5, 10);
	});
});

describe('contains and boundsOf', () => {
	it('knows the inside of a turned marquee', () => {
		const p = { cx: 5, cy: 5, width: 6, height: 2, angle: Math.PI / 2 };
		// Turned upright, so the long axis now runs down the mask.
		expect(contains(p, { x: 5, y: 7 })).toBe(true);
		expect(contains(p, { x: 7, y: 5 })).toBe(false);
	});

	it('bounds the turned corners and clips them to the mask', () => {
		const m = createMask(0, 10);
		const p = { cx: 5, cy: 5, width: 4, height: 4, angle: Math.PI / 4 };
		const bounds = boundsOf(p, m);
		const reach = Math.hypot(2, 2);
		expect(bounds.x0).toBe(Math.floor(5 - reach));
		expect(bounds.x1).toBe(Math.ceil(5 + reach));
		expect(corners(p)).toHaveLength(4);
	});
});

describe('isUnmoved', () => {
	it('knows a patch that has not been moved from one that has', () => {
		const m = maskOf(['####', '####', '####', '####']);
		const sel = lift(m, { x0: 1, y0: 1, x1: 3, y1: 3 })!;
		expect(isUnmoved(sel)).toBe(true);
		expect(isUnmoved({ ...sel, placement: moveBy(sel.placement, 1, 0) })).toBe(false);
		expect(isUnmoved({ ...sel, placement: { ...sel.placement, angle: 0.1 } })).toBe(false);
		expect(isUnmoved({ ...sel, placement: { ...sel.placement, width: 9 } })).toBe(false);
	});
});

describe('the keyboard’s own gestures', () => {
	it('sizes about the centre and never through zero', () => {
		const p = placementOf({ x0: 2, y0: 2, x1: 6, y1: 6 });
		const wider = resizeBy(p, 2, 0);
		expect([wider.width, wider.height, wider.cx, wider.cy]).toEqual([6, 4, p.cx, p.cy]);
		expect(resizeBy(p, -99, -99).width).toBe(MIN_SIZE);
	});

	it('turns by a step and leaves everything else alone', () => {
		const p = { cx: 5, cy: 5, width: 4, height: 2, angle: 0.5 };
		expect(turnBy(p, -0.25)).toEqual({ ...p, angle: 0.25 });
	});

	it('starts a keyboard selection over the middle of the mask', () => {
		const m = createMask(0, 40);
		expect(middleRect(m)).toEqual({ x0: 10, y0: 10, x1: 30, y1: 30 });
		// However small the mask, the frame has cells in it.
		expect(isEmptyRect(middleRect(createMask(0, 3)))).toBe(false);
	});
});

describe('fenceOf', () => {
	it('holds the cells whose centres a put-down selection covers', () => {
		const fence = fenceOf(placementOf({ x0: 2, y0: 3, x1: 6, y1: 5 }), 10);
		const held = [...fence].flatMap((v, i) => (v ? [`${i % 10},${Math.floor(i / 10)}`] : []));
		expect(held).toEqual(['2,3', '3,3', '4,3', '5,3', '2,4', '3,4', '4,4', '5,4']);
	});

	it('follows a turned selection rather than its bounding box', () => {
		const p = { cx: 10, cy: 10, width: 8, height: 8, angle: Math.PI / 4 };
		const fence = fenceOf(p, 20);
		expect(fence[10 * 20 + 10]).toBe(1);
		// The bounding box's corner, which the turned square does not reach.
		expect(fence[5 * 20 + 5]).toBe(0);
	});

	it('takes in the selection\'s images under symmetry, where its paint lands too', () => {
		const transforms = transformsFor({ curve: 'off', lobe: 'off', lobes: 'sym' });
		const fence = fenceOf(placementOf({ x0: 1, y0: 6, x1: 3, y1: 8 }), 10, transforms);
		expect(fence[6 * 10 + 1]).toBe(1);
		expect(fence[1 * 10 + 6]).toBe(1); // its transpose
		expect(fence.reduce((a, b) => a + b, 0)).toBe(8);
	});
});

describe('keepOutside', () => {
	it('puts back what a stroke painted past the fence, and keeps what it painted inside', () => {
		const m = createMask(0, 20);
		const before = { size: 20, data: m.data.slice() };
		const fence = fenceOf(placementOf({ x0: 0, y0: 0, x1: 10, y1: 20 }), 20);
		const box = stroke(m, { x: 2, y: 10 }, { x: 18, y: 10 }, { radius: 1, value: 1 });
		keepOutside(m, before, fence, box);
		expect(m.data[10 * 20 + 5]).toBe(1);
		expect(m.data[10 * 20 + 15]).toBe(0);
	});

	it("puts back Udtvær's level past the fence too", () => {
		const m = createMask(0, 20);
		m.level = new Uint8Array(400).fill(60);
		const before = { size: 20, data: m.data.slice(), level: m.level.slice() };
		const fence = fenceOf(placementOf({ x0: 0, y0: 0, x1: 10, y1: 20 }), 20);
		m.level.fill(90);
		keepOutside(m, before, fence, { x0: 0, y0: 0, x1: 20, y1: 20 });
		expect(m.level[10 * 20 + 5]).toBe(90);
		expect(m.level[10 * 20 + 15]).toBe(60);
	});
});
