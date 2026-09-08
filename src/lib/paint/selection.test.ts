import { describe, expect, it } from 'vitest';
import { createMask, type Mask } from './mask';
import {
	MIN_SIZE,
	boundsOf,
	clear,
	commit,
	contains,
	cornerAt,
	corners,
	lift,
	moveBy,
	placementOf,
	rectFrom,
	rotateHandleAt,
	rotateTo,
	scaleTo,
	stamp
} from './selection';

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
		const box = commit(m, sel);
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
		// the ink and the stamp wrote it back, so both passes touched those cells.
		expect(commit(m, sel)).toEqual({ x0: 1, y0: 0, x1: 3, y1: 2 });
		expect(rowsOf(m)).toEqual(['.#..', '.##.', '....', '....']);
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

describe('clear', () => {
	it('empties the area the selection was lifted from and nothing else', () => {
		const m = maskOf(['####', '####', '####', '####']);
		const sel = lift(m, { x0: 1, y0: 1, x1: 3, y1: 3 })!;
		sel.placement = moveBy(sel.placement, 1, 1);
		expect(clear(m, sel)).toEqual({ x0: 1, y0: 1, x1: 3, y1: 3 });
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

	it('reports the box it changed and nothing wider', () => {
		const m = createMask(0, 8);
		const sel = lift(m, { x0: 0, y0: 0, x1: 2, y1: 2 })!;
		sel.cells.fill(1);
		sel.placement = moveBy(sel.placement, 4, 4);
		expect(stamp(m, sel)).toEqual({ x0: 4, y0: 4, x1: 6, y1: 6 });
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
