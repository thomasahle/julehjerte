import { describe, it, expect } from 'vitest';
import { drawHeart, heartLayout } from './drawHeart';
import { createMask, type Mask } from './mask';

/** The heart's reach from the square's centre, in units of the square's side. */
const REACH = Math.SQRT1_2 / 2 + 0.5;
const BOTTOM = Math.SQRT1_2;

/** Where the drawn heart's outermost points land on a canvas of `size` pixels. */
function edges(size: number) {
	const { cx, cy, scale } = heartLayout(size);
	return {
		left: cx - REACH * scale,
		right: cx + REACH * scale,
		top: cy - REACH * scale,
		bottom: cy + BOTTOM * scale,
		scale
	};
}

describe('heartLayout', () => {
	it('fits the whole heart on the canvas', () => {
		const { left, right, top, bottom } = edges(200);
		expect(left).toBeGreaterThan(0);
		expect(top).toBeGreaterThan(0);
		expect(right).toBeLessThan(200);
		expect(bottom).toBeLessThan(200);
	});

	it('centres it, which the lobes make an off-centre square', () => {
		const { left, right, top, bottom } = edges(200);
		expect(left).toBeCloseTo(200 - right, 6);
		expect(top).toBeCloseTo(200 - bottom, 6);
		// The lobes rise higher than the tip falls, so the square's centre sits
		// below the canvas's — a layout that simply centred the square would push
		// the cleft off the top edge.
		expect(heartLayout(200).cy).toBeGreaterThan(100);
	});

	it("leaves the SVG heart's 2.1% of air on the long side", () => {
		const { left, right, scale } = edges(200);
		expect(left).toBeCloseTo(0.021 * (right - left), 4);
		// The heart is wider than it is tall, so width is what the padding is of.
		expect(right - left).toBeCloseTo(2 * REACH * scale, 6);
	});

	it('scales linearly, so the same mask reads the same at any size', () => {
		const small = heartLayout(100);
		const large = heartLayout(400);
		expect(large.scale).toBeCloseTo(4 * small.scale, 6);
		expect(large.cy / 400).toBeCloseTo(small.cy / 100, 6);
	});
});

/*
 * Orientation is the claim worth pinning here, and the one nothing else pins:
 * the dialog's preview and the paint canvas must agree with `rasterizeDesign`
 * and `PaperHeartSVG` about which part of the mask ends up where. A transposed
 * or mirrored turn would leave every `heartLayout` test above green while
 * quietly swapping the two lobes everywhere a mask is shown.
 *
 * The frame, from `drawHeart` itself: before the 45° turn the woven square is
 * [-½, ½]² with the mask's (0, 0) at its top-left corner, the left lobe bulges
 * out of the square's left edge and the right lobe out of its top edge. The turn
 * is clockwise on screen, so those two lobes rise to either side of the cleft
 * and each quadrant of the mask lands on the side of the diamond between the two
 * corners it lies between.
 */

const SIZE = 120;
const WHITE = '255,255,255';
const RED = '255,0,0';

/** A mask whose only ink is one quadrant, so where it lands says everything. */
function quadrantMask(qx: 0 | 1, qy: 0 | 1): Mask {
	const mask = createMask(0, 8);
	for (let y = 0; y < 8; y++) {
		for (let x = 0; x < 8; x++) {
			if (Math.floor(x / 4) === qx && Math.floor(y / 4) === qy) mask.data[y * 8 + x] = 1;
		}
	}
	return mask;
}

function context(): CanvasRenderingContext2D {
	const canvas = document.createElement('canvas');
	canvas.width = SIZE;
	canvas.height = SIZE;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('no 2d context: is the `canvas` package installed?');
	return ctx;
}

function paint(mask: Mask, right = '#ff0000'): CanvasRenderingContext2D {
	const ctx = context();
	drawHeart(ctx, mask, { left: '#ffffff', right }, SIZE);
	return ctx;
}

/** The colour at a point named in the design's own frame, before the turn. */
function at(ctx: CanvasRenderingContext2D, x: number, y: number): string {
	const { cx, cy, scale } = heartLayout(SIZE);
	// The same turn `drawHeart` applies, so a test point can be named where the
	// drawing names it rather than in canvas pixels worked out by hand.
	const px = cx + (x - y) * Math.SQRT1_2 * scale;
	const py = cy + (x + y) * Math.SQRT1_2 * scale;
	const [r, g, b] = ctx.getImageData(Math.round(px), Math.round(py), 1, 1).data;
	return `${r},${g},${b}`;
}

describe('drawHeart', () => {
	it('puts a quadrant of the mask on the side of the diamond it belongs to', () => {
		// The quadrant x > ½, y < ½ lies between the square's top corner and its
		// right corner, so it must land on the diamond's upper right — and on
		// none of the other three quarters.
		const ctx = paint(quadrantMask(1, 0));
		expect(at(ctx, 0.25, -0.25)).toBe(RED);
		expect(at(ctx, -0.25, -0.25)).toBe(WHITE);
		expect(at(ctx, -0.25, 0.25)).toBe(WHITE);
		expect(at(ctx, 0.25, 0.25)).toBe(WHITE);
	});

	it('does not transpose the mask, which the other quadrant would hide', () => {
		// Transposing swaps exactly these two quadrants, and both are off the
		// diagonal, so inking one and reading the other catches it.
		const ctx = paint(quadrantMask(0, 1));
		expect(at(ctx, -0.25, 0.25)).toBe(RED);
		expect(at(ctx, 0.25, -0.25)).toBe(WHITE);
	});

	it('hangs the left colour on the left lobe and the right colour on the right', () => {
		// The lobes are outside the square, so an empty mask is enough: the left
		// lobe is the half-disc on the square's left edge, which the turn carries
		// to the heart's upper left, and the right lobe the one on its top edge.
		const ctx = paint(createMask(0, 8));
		expect(at(ctx, -0.75, 0)).toBe(WHITE);
		expect(at(ctx, 0, -0.75)).toBe(RED);
	});

	it('draws no mask at all rather than the last colour, for a colour it cannot read', () => {
		// Assigning an unparseable value to `fillStyle` is ignored, so a probe
		// that did not check would paint this mask in the red of the call before
		// it — a wrong drawing with nothing to show it was wrong.
		expect(at(paint(createMask(1, 8)), 0, 0)).toBe(RED);
		expect(at(paint(createMask(1, 8), 'not a colour'), 0, 0)).not.toBe(RED);
	});
});
