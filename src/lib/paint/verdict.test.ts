import { describe, expect, it } from 'vitest';
import { givesWay, isMediocre } from './verdict';

describe('isMediocre', () => {
	it('judges the share the panel prints, rounded to a tenth of a percent', () => {
		expect(isMediocre({ mismatch: 0.0104 })).toBe(false);
		expect(isMediocre({ mismatch: 0.0106 })).toBe(true);
		expect(isMediocre({ mismatch: 0.003 })).toBe(false);
	});

	it('reads the motif mismatch when there is one', () => {
		expect(isMediocre({ mismatch: 0.002, motifMismatch: 0.02 })).toBe(true);
		expect(isMediocre({ mismatch: 0.02, motifMismatch: 0.002 })).toBe(false);
	});
});

describe('givesWay', () => {
	const fitted = (mismatch: number) => ({ mismatch, kind: 'smooth' as const }), exact = (mismatch: number) => ({ mismatch, kind: 'exact' as const });

	it('lets a heart only close give way to one that is not', () => {
		expect(givesWay(exact(0.015), fitted(0.005))).toBe(true);
		expect(givesWay(exact(0.005), fitted(0.003))).toBe(false);
	});

	it('lets the fitted heart, standing in while the exact search looked, give way to an exact one', () => {
		// Rød blomst: the fitter's 0.7 %, the exact template's 0.2 %; and an exact one a little further.
		expect(givesWay(fitted(0.007), exact(0.002))).toBe(true);
		expect(givesWay(fitted(0.002), exact(0.004))).toBe(true);
		// A bauble photograph: both only close, the exact one nearer.
		expect(givesWay(fitted(0.014), exact(0.012))).toBe(true);
		// Both only close, the exact one further: the fitted heart stays.
		expect(givesWay(fitted(0.007), exact(0.03))).toBe(false);
		expect(givesWay(fitted(0.014), exact(0.016))).toBe(false);
	});
});
