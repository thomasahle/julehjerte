import { describe, it, expect } from 'vitest';
import { rectifyMotif } from '$inverse/locator/locator.js';
import type { Point } from '$lib/inverse/client';
import { rectifyQuad } from './rectify';

/**
 * The half pixel is the whole of the conversion, and it is exactly the kind of
 * constant that survives being wrong: a crop half a pixel off a 3000 px
 * photograph looks perfect, and only shows up as the live preview jumping when
 * the engine's mask replaces it. So the claim is not "it subtracts 0.5" — that
 * is the implementation read back — but "the corners of the picture, given to
 * `rectifyQuad`, hand `rectifyMotif` back the picture": if the offset were 0,
 * or +0.5, or applied to one axis, the round trip would land off by a pixel and
 * the border rows would repeat or vanish.
 */

const W = 32;
const H = 24;

/** A picture where every pixel's colour says which pixel it is. */
function ramp(width: number, height: number): {
	width: number;
	height: number;
	data: Uint8ClampedArray;
} {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = 4 * (y * width + x);
			data[i] = Math.round((255 * x) / (width - 1));
			data[i + 1] = Math.round((255 * y) / (height - 1));
			data[i + 2] = (x + y) % 2 ? 255 : 0;
			data[i + 3] = 255;
		}
	}
	return { width, height, data };
}

/** The four corners of the whole picture, in the dialog's pixel-edge frame. */
const WHOLE: Point[] = [
	[0, 0],
	[W, 0],
	[W, H],
	[0, H]
];

describe('rectifyQuad', () => {
	it('moves the corners from pixel edges to pixel centres', () => {
		expect(rectifyQuad(WHOLE)).toEqual([
			[-0.5, -0.5],
			[W - 0.5, -0.5],
			[W - 0.5, H - 0.5],
			[-0.5, H - 0.5]
		]);
	});

	it('copies rather than shifting the corners the dialog is still drawing', () => {
		const corners: Point[] = [
			[10, 20],
			[30, 20],
			[30, 40],
			[10, 40]
		];
		rectifyQuad(corners);
		expect(corners[0]).toEqual([10, 20]);
	});

	it('hands the whole picture back pixel for pixel', () => {
		// A square picture, so the rectified square has the same grid: cell (x, y)
		// of the output must be pixel (x, y) of the input, not a blend of two.
		const source = ramp(W, W);
		const whole: Point[] = [
			[0, 0],
			[W, 0],
			[W, W],
			[0, W]
		];
		const crop = rectifyMotif(source, rectifyQuad(whole), { size: W });
		expect(Array.from(crop.data)).toEqual(Array.from(source.data));
	});

	it('is off by a pixel without the half — which is what makes it worth a test', () => {
		const source = ramp(W, W);
		const whole: Point[] = [
			[0, 0],
			[W, 0],
			[W, W],
			[0, W]
		];
		const naive = rectifyMotif(source, [...whole.map((p) => [...p])], { size: W });
		expect(Array.from(naive.data)).not.toEqual(Array.from(source.data));
	});

	it('keeps a crop of the middle on the pixels it names', () => {
		// The sixteen-by-sixteen block whose top-left pixel is (8, 4), asked for at
		// sixteen pixels across: every output pixel lands on one input pixel's
		// centre, so a correct conversion copies the block and a conversion half a
		// pixel out blends each pixel with its neighbour.
		const n = 16;
		const source = ramp(W, H);
		const block: Point[] = [
			[8, 4],
			[8 + n, 4],
			[8 + n, 4 + n],
			[8, 4 + n]
		];
		const crop = rectifyMotif(source, rectifyQuad(block), { size: n });
		for (let y = 0; y < n; y++) {
			for (let x = 0; x < n; x++) {
				const from = 4 * ((4 + y) * W + 8 + x);
				expect(Array.from(crop.data.slice(4 * (y * n + x), 4 * (y * n + x) + 4))).toEqual(
					Array.from(source.data.slice(from, from + 4))
				);
			}
		}
	});

	it('leaves a folded quadrilateral for the locator to refuse', () => {
		// The dialog leans on this: an invalid crop throws rather than rectifying
		// to something, so the preview keeps its last good frame.
		const source = ramp(W, H);
		const bowtie: Point[] = [
			[0, 0],
			[W, 0],
			[0, H],
			[W, H]
		];
		expect(() => rectifyMotif(source, rectifyQuad(bowtie), { size: 16 })).toThrow(TypeError);
	});
});
