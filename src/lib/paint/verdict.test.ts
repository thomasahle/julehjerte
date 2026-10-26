import { describe, expect, it } from 'vitest';
import { isMediocre } from './verdict';

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
