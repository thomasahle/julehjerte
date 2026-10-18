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
import { describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import FindCutsPanel from './FindCutsPanel.svelte';
import { defaultAdvanced } from '$lib/inverse/engine';
import { IDLE_PROGRESS, reduceAll } from '$lib/paint/searchProgress';
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
			showMotif: false,
			onShowMotif: () => {},
			elapsed: 0,
			progress: IDLE_PROGRESS,
			advanced: defaultAdvanced(),
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
		/** The mounted markup, for the tests that read structure and not only words. */
		root: target,
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
	for (const lang of ['da', 'en'] as const) {
		it(`describes matching as an optional bounded preference (${lang})`, () => {
			const changed = vi.fn();
			const panel = render({ lang, status: 'idle', showingResult: false, result: null, onAdvanced: changed });
			try {
				const checkbox = panel.root.querySelector<HTMLInputElement>('input[aria-describedby="matching-sheets-hint"]')!;
				expect(checkbox.checked).toBe(true);
				expect(checkbox.closest('label')?.textContent).toContain(lang === 'en' ? 'Prefer' : 'Foretræk');
				expect(panel.root.querySelector('#matching-sheets-hint')?.textContent).toContain(lang === 'en' ? '1 percentage point' : '1 procentpoint');
				checkbox.click();
				expect(changed).toHaveBeenCalledWith({ ...defaultAdvanced(), matchingSheets: false });
			} finally { panel.cleanup(); }
		});
	}
	for (const lang of ['da', 'en'] as const) for (const free of [false, true]) {
		it(`shows a one-cut result without inventing clearance (${lang}, ${free ? 'free' : 'fixed'} border)`, () => {
			const panel = render({ lang, result: result({ cuts: [1, 1], clearanceMm: null, ...(free ? { motifMismatch: 0.004, borderChange: 0.12 } : {}) }) });
			try {
				expect(panel.text).toContain(lang === 'en' ? '1 + 1 cuts' : '1 + 1 snit');
				expect(panel.text).toContain(lang === 'en' ? '0.4%' : '0,4%');
				expect(panel.text).not.toMatch(/mm|null|NaN|Infinity/);
				const open = [...panel.root.querySelectorAll('button')].find(b => b.textContent?.trim() === (lang === 'en' ? 'Open in Draw' : 'Åbn i Tegn'));
				expect(open).toBeDefined();
				expect(open?.disabled).toBe(false);
			} finally { panel.cleanup(); }
		});
	}

	it('says nothing extra about a result under one per cent', () => {
		const panel = render({ result: result({ mismatch: 0.009 }) });
		try {
			expect(panel.text).not.toContain(MEDIOCRE);
			expect(panel.again).toBeUndefined();
		} finally {
			panel.cleanup();
		}
	});

	for (const lang of ['da', 'en'] as const) {
		for (const mismatch of [0.004, 0.017]) {
			it(`reports missing motif details even with low average error (${lang}, ${mismatch})`, () => {
				const open = vi.fn();
				const panel = render({ lang, result: result({ mismatch, missingFeatures: true }), onOpenInDraw: open });
				try {
					expect(panel.root.querySelector('[role=status]')?.textContent).toContain(
						lang === 'en' ? 'Some details of the motif are missing.' : 'Nogle detaljer i motivet mangler.'
					);
					const button = [...panel.root.querySelectorAll('button')].find(b => b.textContent?.trim() === (lang === 'en' ? 'Open in Draw' : 'Åbn i Tegn'))!;
					expect(button.disabled).toBe(false);
					button.click();
					expect(open).toHaveBeenCalledOnce();
				} finally { panel.cleanup(); }
			});
		}
		it(`does not invent a feature failure for clean or older results (${lang})`, () => {
			for (const missingFeatures of [false, undefined]) {
				const panel = render({ lang, result: result({ missingFeatures }) });
				try {
					expect(panel.text).not.toContain(lang === 'en' ? 'Some details of the motif are missing.' : 'Nogle detaljer i motivet mangler.');
				} finally { panel.cleanup(); }
			}
		});
	}

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
			result: result({ mismatch: 0.0189, motifMismatch: 0.046 })
		});
		try {
			expect(panel.text).toContain(MEDIOCRE);
		} finally {
			panel.cleanup();
		}
	});

	it('lets a good motif inside a poorly woven band pass', () => {
		const panel = render({
			result: result({ mismatch: 0.03, motifMismatch: 0.002 })
		});
		try {
			expect(panel.text).not.toContain(MEDIOCRE);
			expect(panel.again).toBeUndefined();
		} finally {
			panel.cleanup();
		}
	});
});

/**
 * The searching face — PAINT.md §2.
 *
 * It used to be a bar, a counter and one phrase, while the engine was reporting
 * which strip counts it was trying and how wrong each of them still was. What
 * follows drives the panel with the same events the engine sends, through the
 * same reducer the page uses, and reads what it says.
 */
describe('FindCutsPanel while searching', () => {
	it('offers the graceful stop handler while a solve is running', () => {
		const useBest = vi.fn();
		const panel = render({ status: 'searching', showingResult: false, result: null, onUseBest: useBest });
		try {
			const button = [...panel.root.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Brug det bedste nu');
			expect(button?.disabled).toBe(false);
			button?.click();
			expect(useBest).toHaveBeenCalledOnce();
		} finally { panel.cleanup(); }
	});

	it('keeps Cancel available while the stopped result is being finalized', () => {
		const useBest = vi.fn(), cancel = vi.fn();
		const panel = render({ status: 'searching', showingResult: false, result: null, onUseBest: useBest, onCancel: cancel, stopping: true, lang: 'en' });
		try {
			const buttons = [...panel.root.querySelectorAll('button')];
			const stop = buttons.find(b => b.textContent?.trim() === 'Finishing the best result …');
			expect(stop?.disabled).toBe(true);
			stop?.click();
			expect(useBest).not.toHaveBeenCalled();
			const abort = buttons.find(b => b.textContent?.trim() === 'Cancel');
			expect(abort?.disabled).toBe(false);
			abort?.click();
			expect(cancel).toHaveBeenCalledOnce();
		} finally { panel.cleanup(); }
	});

	it('labels a stopped result and retains the ordinary mismatch warning', () => {
		const panel = render({ result: result({ stoppedEarly: true, mismatch: .08 }) });
		try {
			expect(panel.text).toContain('Bedste resultat fra den stoppede søgning.');
			expect(panel.text).toContain(MEDIOCRE);
		} finally { panel.cleanup(); }
	});

	function searching(...events: Parameters<typeof reduceAll>[0]) {
		return render({
			status: 'searching',
			result: null,
			showingResult: false,
			elapsed: 12,
			progress: reduceAll(events)
		});
	}

	it('names the stage and the numbers behind it', () => {
		const panel = searching(
			{ stage: 'directInitializing', counts: [4, 4], error: 0.08 },
			{ stage: 'directRefining', counts: [4, 4], step: 0, error: 0.02 },
			{ stage: 'directRefining', counts: [4, 4], step: 40, error: 0.013 }
		);
		try {
			expect(panel.text).toContain('Tilpasser kurverne');
			expect(panel.text).toContain('12 s');
			expect(panel.text).toContain('5 + 5 strimler');
			// "buddets afvigelse ca.", not "afvigelse": this is the refiner's own
			// coarse measure of the candidate under the gradient, and the answer's
			// "forskel fra masken" is measured on the finished heart. On Uret v2 the
			// two differ by about a factor of two, so they must not read as one
			// number that moved.
			expect(panel.text).toContain('buddets afvigelse ca. 1,3 %');
			expect(panel.text).toContain('og faldende');
		} finally {
			panel.cleanup();
		}
	});

	it('converts unequal cut counts to paper strips in both progress displays', () => {
		const panel = searching(
			{ stage: 'directInitializing', counts: [2, 3], error: 0.08 },
			{ stage: 'directRefining', counts: [2, 3], step: 0, error: 0.02 }
		);
		try {
			expect(panel.text).toContain('3 + 4 strimler');
			expect(panel.root.querySelector('.attempt-counts')?.textContent?.trim()).toBe('3 + 4');
		} finally {
			panel.cleanup();
		}
	});

	it('drops the live number once the fitter has moved past refinement', () => {
		// Sharing and polishing improve the answer and report no error, so the last
		// checkpoint's number would stand on screen — under a stage line saying
		// something else is happening — until the answer contradicted it.
		const panel = searching(
			{ stage: 'directRefining', counts: [4, 4], step: 40, error: 0.013 },
			{ stage: 'directPolishing' }
		);
		try {
			expect(panel.text).toContain('Finpudser kurverne');
			expect(panel.text).toContain('5 + 5 strimler');
			expect(panel.text).not.toContain('buddets afvigelse');
			// The attempt keeps the number it reached, in the past tense the list is.
			expect(panel.root.querySelector('.attempt-error')?.textContent?.trim()).toBe('1,3 %');
			expect(panel.root.querySelector('.attempt.running')).toBeNull();
		} finally {
			panel.cleanup();
		}
	});

	it('has words for the matching search as well', () => {
		// `preferMatchingSolution` runs whenever "Mellem lapper: Sym" is on, which
		// is the common case; without a sentence of its own the panel dropped to
		// "Arbejder …" in the middle of the ordinary fitter route.
		const panel = searching({ stage: 'directMatching' });
		try {
			expect(panel.text).toContain('Prøver samme skabelon til begge sider');
			expect(panel.text).not.toContain('Arbejder');
		} finally {
			panel.cleanup();
		}
	});

	it('lists the attempts with the running one marked', () => {
		const panel = searching(
			{ stage: 'directInitializing', counts: [4, 4], error: 0.08 },
			{ stage: 'directInitializing', counts: [5, 5], error: 0.12 },
			{ stage: 'directInitializing', counts: [6, 6], error: 0.15 },
			{ stage: 'directRefining', counts: [4, 4], step: 0, error: 0.02 },
			{ stage: 'directRefining', counts: [5, 5], step: 0, error: 0.031 }
		);
		try {
			const rows = [...panel.root.querySelectorAll('.attempt')];
			expect(rows.map((r) => r.querySelector('.attempt-counts')?.textContent?.trim())).toEqual([
				'5 + 5',
				'6 + 6',
				'7 + 7'
			]);
			expect(rows.map((r) => r.querySelector('.attempt-error')?.textContent?.trim())).toEqual([
				'2,0 %',
				'3,1 %',
				// Announced but not reached — and most never are, since the count
				// search announces every pair it scored and the refiner is handed
				// three. The row says that much and no more, and it says it in words:
				// the seed error behind it is a third measurement again.
				'ikke prøvet'
			]);
			expect(rows.map((r) => r.className.includes('running'))).toEqual([false, true, false]);
			// The dot is the only thing that tells done from running, so both carry
			// the word for a screen reader — and a waiting row does not, because its
			// visible text is already that word.
			expect(rows.map((r) => r.querySelector('.sr-only')?.textContent)).toEqual([
				'færdig',
				'i gang',
				undefined
			]);
		} finally {
			panel.cleanup();
		}
	});

	it('shows the MILP its own numbers instead of an attempts list', () => {
		const panel = searching(
			{ stage: 'model', variables: 4000, constraints: 9000 },
			{ stage: 'solving', round: 2, remaining: 30, validatedIncumbent: true },
			{ stage: 'solving', round: 2, nodes: 900, gap: 0.03 }
		);
		try {
			expect(panel.text).toContain('Løser');
			expect(panel.text).toContain('runde 2');
			expect(panel.text).toContain('afstand til bedst mulige 3,0 %');
			expect(panel.text).toContain('1 gyldig kandidat');
			expect(panel.root.querySelector('.attempt')).toBeNull();
		} finally {
			panel.cleanup();
		}
	});

	it('announces the stage and nothing that ticks', () => {
		// A search runs for up to three minutes. The stage changes a handful of
		// times and is news; the seconds and the error change several times a
		// second and would be read over each other for the whole search.
		const panel = searching({ stage: 'directPolishing' });
		try {
			const live = [...panel.root.querySelectorAll('[role="status"]')];
			expect(live).toHaveLength(1);
			expect(live[0].textContent).toContain('Finpudser kurverne');
			expect(live[0].textContent).not.toContain('12 s');
		} finally {
			panel.cleanup();
		}
	});

	it('offers Afbryd and, until the engine can stop gracefully, nothing else', () => {
		const panel = searching({ stage: 'directRefining', counts: [4, 4], error: 0.02 });
		try {
			const buttons = [...panel.root.querySelectorAll('.actions button')].map((b) =>
				b.textContent?.trim()
			);
			expect(buttons).toEqual(['Afbryd']);
			// PAINT.md §12 (b): "Brug det bedste nu" appears only once the engine can
			// hand back its best validated candidate instead of being terminated.
			expect(panel.text).not.toContain('Brug det bedste nu');
		} finally {
			panel.cleanup();
		}
	});

	it('speaks English too', () => {
		const panel = render({
			status: 'searching',
			result: null,
			showingResult: false,
			elapsed: 12,
			lang: 'en',
			progress: reduceAll([
				{ stage: 'directInitializing', counts: [4, 4], error: 0.08 },
				{ stage: 'directInitializing', counts: [5, 5], error: 0.12 },
				{ stage: 'directRefining', counts: [4, 4], step: 0, error: 0.02 },
				{ stage: 'directRefining', counts: [4, 4], step: 40, error: 0.013 }
			])
		});
		try {
			expect(panel.text).toContain('Refining the curves');
			expect(panel.text).toContain('5 + 5 strips');
			expect(panel.text).toContain('the candidate about 1.3 % off');
			expect(panel.text).toContain('and falling');
			expect(panel.text).toContain('not tried');
			expect(panel.text).toContain('Attempts');
			expect(panel.text).toContain('Cancel');
		} finally {
			panel.cleanup();
		}
	});
});
