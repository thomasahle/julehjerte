import { describe, it, expect } from 'vitest';
import type { Point, PreparedArtwork } from '$lib/inverse/client';
import { MASK_SIZE } from './mask';
import {
	decodeImageFile,
	ImportError,
	isConvexQuad,
	MAX_FILE_BYTES,
	maskFromPrepared,
	orderQuad
} from './importImage';

/** The four corners of a heart standing upright: cleft, right, tip, left. */
const UPRIGHT: Point[] = [
	[100, 20],
	[180, 100],
	[100, 180],
	[20, 100]
];

/** Only `mask` and `resolution` are read; the rest of the engine's answer is not. */
function prepared(mask: Uint8Array, resolution: number): PreparedArtwork {
	return { mask, resolution } as PreparedArtwork;
}

describe('orderQuad', () => {
	it('leaves corners already in order alone', () => {
		expect(orderQuad(UPRIGHT)).toEqual(UPRIGHT);
	});

	it('keeps the first click first and sends the rest round clockwise', () => {
		// Clicked cleft, tip, right, left — the right quadrilateral, out of order.
		const zigzag: Point[] = [UPRIGHT[0]!, UPRIGHT[2]!, UPRIGHT[1]!, UPRIGHT[3]!];
		expect(orderQuad(zigzag)).toEqual(UPRIGHT);
	});

	it('turns an anticlockwise round trip the right way', () => {
		const anticlockwise: Point[] = [UPRIGHT[0]!, UPRIGHT[3]!, UPRIGHT[2]!, UPRIGHT[1]!];
		expect(orderQuad(anticlockwise)).toEqual(UPRIGHT);
	});

	it('starts where the visitor started, not at the topmost corner', () => {
		// A heart photographed on its side: the cleft is not the highest corner,
		// and only the visitor knows which corner it is.
		const tilted: Point[] = [
			[20, 100],
			[100, 20],
			[180, 100],
			[100, 180]
		];
		expect(orderQuad(tilted)).toEqual(tilted);
		expect(orderQuad([tilted[0]!, tilted[2]!, tilted[1]!, tilted[3]!])).toEqual(tilted);
	});

	it('copies rather than reorders in place', () => {
		const source: Point[] = UPRIGHT.map((p) => [...p] as Point);
		const ordered = orderQuad(source);
		ordered[0]![0] = -1;
		expect(source[0]![0]).toBe(100);
	});

	it('passes an incomplete click sequence through', () => {
		const two: Point[] = [UPRIGHT[0]!, UPRIGHT[1]!];
		expect(orderQuad(two)).toEqual(two);
	});
});

describe('isConvexQuad', () => {
	it('accepts a quadrilateral in perimeter order, either way round', () => {
		expect(isConvexQuad(UPRIGHT)).toBe(true);
		expect(isConvexQuad([...UPRIGHT].reverse())).toBe(true);
	});

	it('rejects a bow tie', () => {
		expect(isConvexQuad([UPRIGHT[0]!, UPRIGHT[1]!, UPRIGHT[3]!, UPRIGHT[2]!])).toBe(false);
	});

	it('rejects three collinear corners, which the engine cannot invert', () => {
		expect(
			isConvexQuad([
				[0, 0],
				[50, 0],
				[100, 0],
				[50, 100]
			])
		).toBe(false);
	});

	it('rejects an unfinished or unfinite quad', () => {
		expect(isConvexQuad(UPRIGHT.slice(0, 3))).toBe(false);
		expect(isConvexQuad([UPRIGHT[0]!, UPRIGHT[1]!, UPRIGHT[2]!, [NaN, NaN]])).toBe(false);
	});
});

describe('maskFromPrepared', () => {
	it('keeps a mask the engine already answered at our resolution', () => {
		const cells = new Uint8Array(MASK_SIZE * MASK_SIZE);
		cells[0] = 1;
		cells[cells.length - 1] = 1;
		const mask = maskFromPrepared(prepared(cells, MASK_SIZE));
		expect(mask.size).toBe(MASK_SIZE);
		expect(mask.data).toEqual(cells);
	});

	it('resamples a smaller answer up to the painting resolution', () => {
		// A 2 × 2 checkerboard becomes four quadrants of the mask.
		const mask = maskFromPrepared(prepared(Uint8Array.from([0, 1, 1, 0]), 2));
		expect(mask.size).toBe(MASK_SIZE);
		const at = (x: number, y: number) => mask.data[y * MASK_SIZE + x];
		expect(at(10, 10)).toBe(0);
		expect(at(MASK_SIZE - 10, 10)).toBe(1);
		expect(at(10, MASK_SIZE - 10)).toBe(1);
		expect(at(MASK_SIZE - 10, MASK_SIZE - 10)).toBe(0);
	});

	it('gives an empty mask when the answer does not describe a square', () => {
		const mask = maskFromPrepared(prepared(new Uint8Array(5), 3));
		expect(mask.size).toBe(MASK_SIZE);
		expect(mask.data.some((v) => v !== 0)).toBe(false);
	});
});

describe('decodeImageFile', () => {
	/** A file the browser would hand us, without the bytes we never read. */
	function file(name: string, type: string, size: number): File {
		return { name, type, size } as File;
	}

	it('refuses a file over the size limit before decoding it', async () => {
		const big = file('heart.png', 'image/png', MAX_FILE_BYTES + 1);
		await expect(decodeImageFile(big)).rejects.toThrow(ImportError);
		await expect(decodeImageFile(big)).rejects.toMatchObject({ kind: 'tooLarge' });
	});

	it('refuses a format the engine has no reader for', async () => {
		await expect(decodeImageFile(file('heart.gif', 'image/gif', 1000))).rejects.toMatchObject({
			kind: 'unsupported'
		});
	});

	it('sends SVG to the engine as text, so it traces the curves', async () => {
		const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'waves.svg', {
			type: 'image/svg+xml'
		});
		const decoded = await decodeImageFile(svg);
		expect(decoded.input.type).toBe('svg');
		expect(decoded.pixels).toBeNull();
		URL.revokeObjectURL(decoded.url);
	});
});
