import { describe, it, expect, beforeEach } from 'vitest';
import type { HeartDesign } from '$lib/types/heart';
import { createMask } from '$lib/paint/mask';
import {
	clearMask,
	handoffToDraw,
	markMaskDirty,
	resetSession,
	restore,
	serialize,
	session,
	setMask,
	takeHandoff
} from './session.svelte';

const design = { id: 'h', name: 'Stjerne fra billede', author: '', gridSize: { x: 4, y: 4 }, fingers: [] } satisfies HeartDesign;

beforeEach(() => {
	resetSession();
});

describe('the session', () => {
	it('starts empty, with no symmetry and nothing found', () => {
		expect(session.mask).toBeNull();
		expect(session.status).toBe('idle');
		expect(session.symmetry).toEqual({ curve: 'off', lobe: 'off', lobes: 'off' });
		expect(session.found).toBeNull();
	});

	it('takes a new mask with the symmetry that came with it, and calls it clean', () => {
		const found = { curve: 'sym', lobe: 'sym', lobes: 'sym' } as const;
		setMask(createMask(0), { sourceName: 'stjerne.png', symmetry: found, found });
		expect(session.sourceName).toBe('stjerne.png');
		expect(session.symmetry).toEqual(found);
		expect(session.found).toEqual(found);
		expect(session.maskDirty).toBe(false);
	});

	it('forgets what was found in the old mask when a new one arrives without a detection', () => {
		// The "fundet" pills describe the picture they were detected in. A mask that
		// comes with none of its own — "Mal på hjertet", or Ryd — must not keep them:
		// they would tag the three rows after a mask that is gone. The visitor's own
		// choice of rows is a setting, not a finding, and does stay.
		const found = { curve: 'sym', lobe: 'sym', lobes: 'sym' } as const;
		setMask(createMask(0), { sourceName: 'stjerne.png', symmetry: found, found });
		setMask(createMask(0));
		expect(session.found).toBeNull();
		expect(session.symmetry).toEqual(found);
	});

	it('forgets the last result when the mask is replaced', () => {
		session.result = { design, report: { cuts: [4, 4], clearanceMm: 3, mismatch: 0.02, identical: true } };
		session.status = 'done';
		setMask(createMask(0));
		expect(session.result).toBeNull();
		expect(session.status).toBe('idle');
	});

	it('remembers that the visitor has painted until the mask is replaced', () => {
		setMask(createMask(0), { sourceName: 'stjerne.png' });
		markMaskDirty();
		expect(session.maskDirty).toBe(true);
		clearMask();
		expect(session.maskDirty).toBe(false);
		expect(session.sourceName).toBeNull();
	});

	it('copies the settings it is given, so the caller cannot change them behind its back', () => {
		const symmetry = { curve: 'off', lobe: 'off', lobes: 'sym' } as const;
		setMask(createMask(0), { symmetry });
		expect(session.symmetry).not.toBe(symmetry);
	});
});

describe('the handoff to Tegn', () => {
	it('hands the heart over exactly once', () => {
		handoffToDraw(design);
		expect(takeHandoff()).toBe(design);
		expect(takeHandoff()).toBeNull();
	});

	it('is empty until Find snit has found something', () => {
		expect(takeHandoff()).toBeNull();
	});
});

describe('serialize and restore', () => {
	it('put back the mask, the symmetry and where it came from', () => {
		const mask = createMask(0, 400);
		mask.data[17] = 1;
		mask.data[159999] = 1;
		setMask(mask, {
			sourceName: 'stjerne.png',
			symmetry: { curve: 'off', lobe: 'sym', lobes: 'sym' },
			found: { curve: 'off', lobe: 'sym', lobes: 'sym' }
		});
		const saved = JSON.parse(JSON.stringify(serialize()));

		resetSession();
		expect(restore(saved)).toBe(true);
		expect(session.sourceName).toBe('stjerne.png');
		expect(session.symmetry).toEqual({ curve: 'off', lobe: 'sym', lobes: 'sym' });
		expect(session.found).toEqual({ curve: 'off', lobe: 'sym', lobes: 'sym' });
		expect([...session.mask!.data]).toEqual([...mask.data]);
	});

	it('survives a session with no mask', () => {
		expect(restore(serialize())).toBe(true);
		expect(session.mask).toBeNull();
	});

	it('leaves the session alone when the data is not a session', () => {
		setMask(createMask(1, 400), { sourceName: 'keep.png' });
		expect(restore(null)).toBe(false);
		expect(restore({ symmetry: { curve: 'yes' } })).toBe(false);
		expect(restore({ symmetry: { curve: 'off', lobe: 'off', lobes: 'off' }, mask: { size: 400, cells: '!' } })).toBe(
			false
		);
		expect(session.sourceName).toBe('keep.png');
		expect(session.mask?.data[0]).toBe(1);
	});
});
