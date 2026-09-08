import { describe, it, expect } from 'vitest';
import { createMask, maskMismatch, type Mask } from './mask';
import {
	axisVector,
	checkerPhase,
	clampFrameCells,
	clampFrameSize,
	DEFAULT_FRAME,
	FRAME_AXES,
	frameHandles,
	handlePoint,
	insideCell,
	insideShape,
	mismatchInside,
	shapeCells,
	shapeOutline,
	sizeFromHandle,
	solveTargetMask,
	substituteCheckerBand,
	type Frame,
	type FrameShape
} from './frame';

const SHAPES: FrameShape[] = ['diamond', 'circle', 'hexagon'];

function frame(shape: FrameShape, size = 0.64, mode: Frame['mode'] = 'free'): Frame {
	return { mode, shape, size };
}

/** The extent of a shape along the square's own axes, measured on a fine grid. */
function span(shape: FrameShape, size: number, steps = 2000): { x: number; y: number } {
	let minX = 1;
	let maxX = 0;
	let minY = 1;
	let maxY = 0;
	for (let iy = 0; iy < steps; iy++) {
		const v = (iy + 0.5) / steps;
		for (let ix = 0; ix < steps; ix++) {
			const u = (ix + 0.5) / steps;
			if (!insideShape(shape, size, u, v)) continue;
			minX = Math.min(minX, u);
			maxX = Math.max(maxX, u);
			minY = Math.min(minY, v);
			maxY = Math.max(maxY, v);
		}
	}
	return { x: maxX - minX, y: maxY - minY };
}

describe('the protected shape', () => {
	it('is centred and spans exactly the size in the square s own axes', () => {
		for (const shape of SHAPES) {
			for (const size of [0.3, 0.64, 0.84]) {
				const measured = span(shape, size, 800);
				expect(measured.x).toBeGreaterThan(size - 0.01);
				expect(measured.x).toBeLessThanOrEqual(size + 0.001);
				expect(measured.y).toBeGreaterThan(size - 0.01);
				expect(measured.y).toBeLessThanOrEqual(size + 0.001);
			}
		}
	});

	it('holds the centre and drops the corners of the square', () => {
		for (const shape of SHAPES) {
			expect(insideShape(shape, 0.64, 0.5, 0.5)).toBe(true);
			expect(insideShape(shape, 0.64, 0.01, 0.01)).toBe(false);
			expect(insideShape(shape, 0.64, 0.99, 0.99)).toBe(false);
		}
	});

	it('is a rude along the square s edges: an inset square in mask coordinates', () => {
		// 0.64 is Codex's 18% inset, so the band is 0.18 of the square on each edge.
		expect(insideShape('diamond', 0.64, 0.181, 0.5)).toBe(true);
		expect(insideShape('diamond', 0.64, 0.179, 0.5)).toBe(false);
		expect(insideShape('diamond', 0.64, 0.181, 0.181)).toBe(true);
		expect(insideShape('diamond', 0.64, 0.181, 0.179)).toBe(false);
	});

	it('gives the hexagon a flat top and bottom in the heart', () => {
		// The heart's up axis is the mask's diagonal towards (0,0). A flat edge
		// crosses it at the apothem, and the edge is flat: two points either side of
		// the axis at the same height are both inside.
		const up = axisVector('up');
		const d = 0.4483 * 0.64; // r·√3/2 for a bounding box of 0.64
		const foot = { x: 0.5 + up.x * d * 0.99, y: 0.5 + up.y * d * 0.99 };
		expect(insideShape('hexagon', 0.64, foot.x, foot.y)).toBe(true);
		// A step sideways along the heart's own left-right axis stays inside the
		// flat edge; a step further up leaves it.
		const right = axisVector('right');
		const slid = { x: foot.x + right.x * 0.05, y: foot.y + right.y * 0.05 };
		expect(insideShape('hexagon', 0.64, slid.x, slid.y)).toBe(true);
		const above = { x: 0.5 + up.x * d * 1.05, y: 0.5 + up.y * d * 1.05 };
		expect(insideShape('hexagon', 0.64, above.x, above.y)).toBe(false);
	});

	it('marks the same cells as the outline encloses', () => {
		// A circle of span 0.64 covers π·0.32² of the unit square.
		const cells = shapeCells(frame('circle'), 200);
		let inside = 0;
		for (const flag of cells) inside += flag;
		expect(inside / cells.length).toBeCloseTo(Math.PI * 0.32 * 0.32, 2);
	});

	it('describes its outline as a polygon or a circle', () => {
		expect(shapeOutline('circle', 0.64)).toEqual({ kind: 'circle', cx: 0.5, cy: 0.5, r: 0.32 });
		const rude = shapeOutline('diamond', 0.64);
		expect(rude.kind).toBe('polygon');
		if (rude.kind === 'polygon') expect(rude.points).toHaveLength(4);
		const hex = shapeOutline('hexagon', 0.64);
		expect(hex.kind).toBe('polygon');
		if (hex.kind === 'polygon') {
			expect(hex.points).toHaveLength(6);
			// Every vertex is on the outline: just inside is in, just outside is out.
			for (const p of hex.points) {
				const inX = 0.5 + (p.x - 0.5) * 0.98;
				const inY = 0.5 + (p.y - 0.5) * 0.98;
				expect(insideShape('hexagon', 0.64, inX, inY)).toBe(true);
				const outX = 0.5 + (p.x - 0.5) * 1.02;
				const outY = 0.5 + (p.y - 0.5) * 1.02;
				expect(insideShape('hexagon', 0.64, outX, outY)).toBe(false);
			}
		}
	});
});

describe('the drag handles', () => {
	it('sit on the outline, on the heart s four axes', () => {
		for (const shape of SHAPES) {
			for (const { axis, point } of frameHandles(frame(shape))) {
				const inX = 0.5 + (point.x - 0.5) * 0.98;
				const inY = 0.5 + (point.y - 0.5) * 0.98;
				expect([axis, insideShape(shape, 0.64, inX, inY)]).toEqual([axis, true]);
				const outX = 0.5 + (point.x - 0.5) * 1.02;
				const outY = 0.5 + (point.y - 0.5) * 1.02;
				expect([axis, insideShape(shape, 0.64, outX, outY)]).toEqual([axis, false]);
			}
		}
	});

	it('give back the size they were placed for', () => {
		for (const shape of SHAPES) {
			for (const size of [0.3, 0.5, 0.64, 0.84]) {
				for (const axis of FRAME_AXES) {
					const point = handlePoint(frame(shape, size), axis);
					expect(sizeFromHandle(shape, axis, point)).toBeCloseTo(size, 10);
				}
			}
		}
	});

	it('keep the shape centred: only the distance along the axis counts', () => {
		const point = handlePoint(frame('circle'), 'right');
		const sideways = axisVector('up');
		const nudged = { x: point.x + sideways.x * 0.1, y: point.y + sideways.y * 0.1 };
		expect(sizeFromHandle('circle', 'right', nudged)).toBeCloseTo(0.64, 10);
	});

	it('stop at the ends of the slider s own range', () => {
		expect(sizeFromHandle('circle', 'right', { x: 1.4, y: -0.4 })).toBe(0.84);
		expect(sizeFromHandle('circle', 'right', { x: 0.5, y: 0.5 })).toBe(0.3);
		expect(clampFrameSize(2)).toBe(0.84);
		expect(clampFrameSize(Number.NaN)).toBe(DEFAULT_FRAME.size);
		expect(clampFrameCells(9)).toBe(5);
		expect(clampFrameCells(1)).toBe(3);
		expect(clampFrameCells(4.4)).toBe(4);
	});
});

/** A checker of `cells × cells` blocks over the whole square, at one phase. */
function checkerMask(size: number, cells: number, phase: 0 | 1): Mask {
	const m = createMask(0, size);
	const block = size / cells;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			m.data[y * size + x] = ((Math.floor(x / block) + Math.floor(y / block) + phase) & 1) as 0 | 1;
		}
	}
	return m;
}

describe('the solve mask', () => {
	const size = 120;

	it('keeps every cell of the protected motif', () => {
		const painted = createMask(0, size);
		for (let i = 0; i < painted.data.length; i++) painted.data[i] = (i * 7919) % 3 === 0 ? 1 : 0;
		const f = frame('diamond');
		const solve = substituteCheckerBand(painted, f, 4);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				if (!insideCell(f, size, x, y)) continue;
				expect(solve.data[y * size + x]).toBe(painted.data[y * size + x]);
			}
		}
	});

	it('weaves the band as a checker of the requested cell count', () => {
		const f = frame('circle');
		for (const cells of [3, 4, 5]) {
			const solve = substituteCheckerBand(createMask(0, size), f, cells);
			const block = size / cells;
			const phase = solve.data[0]!;
			for (let y = 0; y < size; y++) {
				for (let x = 0; x < size; x++) {
					if (insideCell(f, size, x, y)) continue;
					const want = (Math.floor(x / block) + Math.floor(y / block) + phase) & 1;
					expect(solve.data[y * size + x]).toBe(want);
				}
			}
		}
	});

	it('picks the phase that continues the colours the band already has', () => {
		const f = frame('diamond');
		for (const phase of [0, 1] as const) {
			// A band that is already exactly one phase of the checker: the rule has an
			// unambiguous answer, and it is that phase.
			const painted = checkerMask(size, 4, phase);
			expect(checkerPhase(painted, f, 4)).toBe(phase);
			const solve = substituteCheckerBand(painted, f, 4);
			expect([...solve.data]).toEqual([...painted.data]);
		}
	});

	it('leaves the visitor s own mask alone', () => {
		const painted = createMask(1, size);
		const solve = solveTargetMask(painted, frame('hexagon'), 4);
		solve.data[0] = 0;
		expect(painted.data[0]).toBe(1);
	});

	it('is the mask itself, copied, while the band is fixed', () => {
		const painted = createMask(0, size);
		painted.data[5] = 1;
		const solve = solveTargetMask(painted, frame('diamond', 0.64, 'fixed'), 4);
		expect([...solve.data]).toEqual([...painted.data]);
	});
});

describe('the two mismatch numbers', () => {
	const size = 100;
	const f = frame('diamond');

	it('reports nothing in the motif when only the band differs', () => {
		const a = createMask(0, size);
		const b = createMask(0, size);
		let changed = 0;
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				if (insideCell(f, size, x, y)) continue;
				b.data[y * size + x] = 1;
				changed++;
			}
		}
		expect(mismatchInside(a.data, b.data, size, f)).toBe(0);
		expect(maskMismatch(a.data, b.data)).toBeCloseTo(changed / (size * size), 10);
	});

	it('reads higher than the whole square when the error is in the motif', () => {
		// The failure MOTIF-BORDER.md warns about: a big correct band hides a wrong
		// centre, so the centre has to be counted on its own.
		const a = createMask(0, size);
		const b = createMask(0, size);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				if (insideCell(f, size, x, y)) b.data[y * size + x] = 1;
			}
		}
		expect(mismatchInside(a.data, b.data, size, f)).toBe(1);
		expect(maskMismatch(a.data, b.data)).toBeLessThan(0.5);
	});

	it('refuses two masks that are not the same square', () => {
		expect(() => mismatchInside(new Uint8Array(4), new Uint8Array(9), 3, f)).toThrow();
	});
});
