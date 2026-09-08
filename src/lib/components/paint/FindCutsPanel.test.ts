/**
 * A mediocre result has to say so — PAINT.md §2.
 *
 * The panel's found face used to print a percentage and stop, and 0.4 % and
 * 1.7 % read exactly alike to anyone who has not woven one of these. The rule
 * that turns the number into a sentence is a threshold and a choice of which of
 * the two numbers to apply it to, and both are easy to get backwards: the
 * whole-square figure is the flattering one whenever there is a woven band to
 * dilute the middle, so a heart that is 4.6 % wrong in the motif can pass the
 * square at 1.9 %. So this mounts the real panel and reads what it says.
 */
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import FindCutsPanel from './FindCutsPanel.svelte';
import { defaultAdvanced } from '$lib/inverse/engine';
import { DEFAULT_FRAME } from '$lib/paint/frame';
import { NO_SYMMETRY } from '$lib/paint/symmetry';
import type { PaintResult } from '$lib/editor/session.svelte';
import type { HeartDesign } from '$lib/types/heart';

type Props = Parameters<typeof FindCutsPanel>[1];

const DESIGN: HeartDesign = {
	id: 'test',
	name: 'Test',
	author: '',
	gridSize: { x: 3, y: 3 },
	fingers: []
};

function result(report: Partial<PaintResult['report']> = {}): PaintResult {
	return {
		design: DESIGN,
		report: { cuts: [3, 3], clearanceMm: 4, mismatch: 0.004, identical: false, ...report }
	};
}

function render(overrides: Partial<Props> = {}) {
	const found: string[] = [];
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(FindCutsPanel, {
		target,
		props: {
			symmetry: { ...NO_SYMMETRY },
			status: 'done',
			error: null,
			result: result(),
			showingResult: true,
			honoured: null,
			frame: { ...DEFAULT_FRAME },
			showMotif: false,
			onShowMotif: () => {},
			elapsed: 0,
			stage: '',
			advanced: defaultAdvanced({ ...NO_SYMMETRY }),
			onAdvanced: () => {},
			onResetAdvanced: () => {},
			canFind: true,
			onFind: () => found.push('again'),
			onCancel: () => {},
			onOpenInDraw: () => {},
			onBackToMask: () => {},
			lang: 'da',
			...overrides
		} as Props
	});
	flushSync();
	const again = [...target.querySelectorAll<HTMLButtonElement>('.actions button')].find(
		(b) => b.textContent?.trim() === 'Find snit igen'
	);
	return {
		found,
		again,
		text: target.textContent ?? '',
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

/** The opening words of the "close, but not right" line, in Danish. */
const MEDIOCRE = 'Mønsteret er tæt på';

describe('FindCutsPanel', () => {
	it('says nothing extra about a result under one per cent', () => {
		const panel = render({ result: result({ mismatch: 0.009 }) });
		try {
			expect(panel.text).not.toContain(MEDIOCRE);
			expect(panel.again).toBeUndefined();
		} finally {
			panel.cleanup();
		}
	});

	it('calls a result over one per cent close, and offers the search again', () => {
		const panel = render({ result: result({ mismatch: 0.017 }) });
		try {
			expect(panel.text).toContain(MEDIOCRE);
			panel.again?.click();
			flushSync();
			expect(panel.found).toEqual(['again']);
		} finally {
			panel.cleanup();
		}
	});

	// The panel prints one decimal of a percent, so a verdict read off the raw
	// fraction can disagree with the number beside it: 0.996 % and 1.004 % are both
	// "1,0%" on screen, and only the second is over 0.01. Two hearts showing the
	// same number and given different verdicts is the confusion the line exists to
	// end, so the printed number is what decides.
	it('agrees with the number it prints on either side of one per cent', () => {
		for (const mismatch of [0.00996, 0.01004]) {
			const panel = render({ result: result({ mismatch }) });
			try {
				expect(panel.text).toContain('1,0%');
				expect(panel.text).not.toContain(MEDIOCRE);
				expect(panel.again).toBeUndefined();
			} finally {
				panel.cleanup();
			}
		}
	});

	it('speaks up as soon as the printed number passes one per cent', () => {
		const panel = render({ result: result({ mismatch: 0.0106 }) });
		try {
			expect(panel.text).toContain('1,1%');
			expect(panel.text).toContain(MEDIOCRE);
		} finally {
			panel.cleanup();
		}
	});

	it('judges a free band by the motif and not by the whole square', () => {
		// MOTIF-BORDER.md's three-cell house: the square passes, the middle does not.
		const panel = render({
			result: result({ mismatch: 0.0189, motifMismatch: 0.046 }),
			frame: { ...DEFAULT_FRAME, mode: 'free' }
		});
		try {
			expect(panel.text).toContain(MEDIOCRE);
		} finally {
			panel.cleanup();
		}
	});

	it('lets a good motif inside a poorly woven band pass', () => {
		const panel = render({
			result: result({ mismatch: 0.03, motifMismatch: 0.002 }),
			frame: { ...DEFAULT_FRAME, mode: 'free' }
		});
		try {
			expect(panel.text).not.toContain(MEDIOCRE);
			expect(panel.again).toBeUndefined();
		} finally {
			panel.cleanup();
		}
	});
});
