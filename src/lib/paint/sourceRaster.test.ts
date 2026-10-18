import { describe, expect, it } from 'vitest';
import { prepare } from '$inverse/core/engine.js';
import type { PreparedArtwork } from '$lib/inverse/client';
import { frameWeights, maskToArtwork } from '$lib/inverse/engine';
import { maskFromPrepared } from './importImage';
import { cloneMask, MASK_SIZE, solverRaster } from './mask';
import { createHistory, record, redo, undo } from './history';
import { stampCircle } from './tools';
import { NO_SYMMETRY, symmetrize } from './symmetry';
import { DEFAULT_FRAME } from './frame';

function imported(size = 337, partial = false) {
	const mask = Uint8Array.from({ length: size ** 2 }, (_, i) =>
		Number(i % size > 37 && i % size < 117 && Math.floor(i / size) > 61));
	const validMask = partial ? Uint8Array.from(mask, (_, i) => Number(i % size > 9)) : undefined;
	const prepared = { mask, resolution: size, validMask } as PreparedArtwork;
	return { prepared, mask: maskFromPrepared(prepared) };
}

describe('original sampling of an imported mask', () => {
	it('keeps the 400px painting surface but sends the exact original raster to the worker', () => {
		const { prepared, mask } = imported();
		expect(mask.size).toBe(MASK_SIZE);
		const input = maskToArtwork(cloneMask(mask));
		expect(input.resolution).toBe(337);
		expect(input.mask).toEqual(prepared.mask);
		const replay = prepare(input, { algorithm: 'direct' });
		expect(replay.preview.resolution).toBe(337);
		expect(replay.preview.mask).toEqual(prepared.mask);
		input.mask.fill(0);
		expect(solverRaster(mask).data).toEqual(prepared.mask);
		prepared.mask.fill(1);
		expect(solverRaster(mask).data.some(v => v === 0)).toBe(true);
	});

	it('uses every current painted pixel after an edit and restores original sampling on undo', () => {
		const { mask } = imported(), history = createHistory();
		record(history, { mask, symmetry: NO_SYMMETRY });
		stampCircle(mask, 3, 3, { radius: 0, value: 1 });
		const edited = maskToArtwork(mask);
		expect(edited.resolution).toBe(MASK_SIZE);
		expect(edited.mask).toEqual(mask.data);
		expect(edited.mask[3 * MASK_SIZE + 3]).toBe(1);
		const previous = undo(history, { mask, symmetry: NO_SYMMETRY })!;
		expect(maskToArtwork(previous.mask).resolution).toBe(337);
		const next = redo(history, previous)!;
		expect(maskToArtwork(next.mask).resolution).toBe(MASK_SIZE);
		expect(next.mask.sourceRaster?.data).not.toBe(mask.sourceRaster?.data);
	});

	it('notices same-colour painting into an unobserved source cell', () => {
		const { prepared, mask } = imported(337, true);
		const original = maskToArtwork(mask);
		expect(original.validMask).toEqual(prepared.validMask);
		expect(original.validMask).not.toBe(mask.sourceRaster?.validMask);
		stampCircle(mask, 3, 3, { radius: 0, value: 0 });
		const edited = maskToArtwork(mask);
		expect(edited.resolution).toBe(MASK_SIZE);
		expect(edited.validMask).toEqual(mask.validMask);
		expect(edited.validMask?.[3 * MASK_SIZE + 3]).toBe(1);
	});

	it('does not restore imported pixels over a symmetry edit', () => {
		const { mask } = imported();
		symmetrize(mask, ['transpose']);
		const input = maskToArtwork(mask);
		expect(input.resolution).toBe(MASK_SIZE);
		expect(input.mask).toEqual(mask.data);
	});

	it('evaluates free-border importance on the chosen raster, including coverage', () => {
		const { mask } = imported(337, true), frame = { ...DEFAULT_FRAME, mode: 'free' as const, size: .64 };
		const input = maskToArtwork(mask, frame);
		expect(input.weights).toEqual(frameWeights(mask.sourceRaster!, frame));
		expect(input.weights).toHaveLength(337 ** 2);
		expect(input.validMask).toEqual(mask.sourceRaster?.validMask);
	});

	it('does not retain missing detail from a downsampled import or change full-size imports', () => {
		for (const size of [400, 500]) {
			const { mask } = imported(size);
			expect(mask.sourceRaster).toBeUndefined();
			expect(maskToArtwork(mask).resolution).toBe(MASK_SIZE);
		}
	});
});
