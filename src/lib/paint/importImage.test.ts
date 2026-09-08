import { describe, it, expect } from 'vitest';
import type { PreparedArtwork } from '$lib/inverse/client';
import { MASK_SIZE } from './mask';
import { decodeImageFile, ImportImageError, MAX_FILE_BYTES, maskFromPrepared } from './importImage';

/** A `prepared` with just the fields `maskFromPrepared` reads. */
function prepared(mask: Uint8Array, resolution: number): PreparedArtwork {
	return {
		vector: '',
		boundaries: '',
		mask,
		resolution,
		metadata: { curves: 0, width: 100 }
	};
}

/** A mask with a single 1 at (x, y), so a resize's placement is visible. */
function dot(size: number, x: number, y: number): Uint8Array {
	const data = new Uint8Array(size * size);
	data[y * size + x] = 1;
	return data;
}

describe('decodeImageFile', () => {
	// The two guards that fire before any decoding, so they run without a browser
	// that can make an ImageBitmap.
	it('refuses a file over the size limit', async () => {
		const big = new File([new Uint8Array(4)], 'big.png', { type: 'image/png' });
		Object.defineProperty(big, 'size', { value: MAX_FILE_BYTES + 1 });
		await expect(decodeImageFile(big)).rejects.toThrow(ImportImageError);
		await expect(decodeImageFile(big)).rejects.toMatchObject({ key: 'paintImportTooLarge' });
	});

	it('refuses a type the browser is not asked to decode', async () => {
		// SVG among them: the engine takes it as text, and rasterising it here
		// would throw the vector boundaries away.
		for (const type of ['image/svg+xml', 'application/json', '']) {
			const file = new File(['x'], 'thing', { type });
			await expect(decodeImageFile(file)).rejects.toMatchObject({
				key: 'paintImportUnsupported'
			});
		}
	});
});

describe('maskFromPrepared', () => {
	it('gives a full-size mask whatever resolution the engine chose', () => {
		for (const resolution of [64, 200, MASK_SIZE]) {
			const mask = maskFromPrepared(prepared(new Uint8Array(resolution * resolution), resolution));
			expect(mask.size).toBe(MASK_SIZE);
			expect(mask.data.length).toBe(MASK_SIZE * MASK_SIZE);
		}
	});

	it('copies a mask that is already the right size, cell for cell', () => {
		const source = dot(MASK_SIZE, 17, 300);
		const mask = maskFromPrepared(prepared(source, MASK_SIZE));
		expect(mask.data).toEqual(source);
		// A copy, not the engine's own array: painting must not write into it.
		expect(mask.data).not.toBe(source);
	});

	it('keeps a cell where it was when it scales up', () => {
		// (1, 3) of a 4 × 4 grid is the second column and fourth row, so it lands
		// in the second and fourth quarter of the mask.
		const mask = maskFromPrepared(prepared(dot(4, 1, 3), 4));
		const at = (x: number, y: number) => mask.data[y * MASK_SIZE + x];
		expect(at(150, 350)).toBe(1);
		expect(at(50, 350)).toBe(0);
		expect(at(150, 50)).toBe(0);
	});

	it('refuses a mask whose length does not match its resolution', () => {
		expect(() => maskFromPrepared(prepared(new Uint8Array(10), 400))).toThrow(ImportImageError);
	});
});
