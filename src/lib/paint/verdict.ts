/**
 * Above this share of cells the panel says so: the heart is close, not right.
 *
 * 1 % is where the difference stops being arithmetic and becomes something you
 * can point at. On a printed heart of 400 cells a side, one cell in a hundred
 * is a seam wide enough to see once the paper is woven — the moment the visitor
 * would rather be told than left to find out on the table. Under it the panel
 * says nothing extra, as it always did.
 *
 * There is no engine number to borrow here, and it is worth saying which one
 * this is *not*: `ENFORCE_COST_LIMIT` (0.03, `toHeartDesign.ts`) bounds how far
 * the symmetry correction may move a design from the uncorrected one. That is a
 * budget on our own correction, not an allowance on how far the found heart may
 * sit from the mask the visitor painted, and it says nothing about this number.
 */
export const MEDIOCRE_MISMATCH = 0.01;

/**
 * Whether a found heart is only close. The verdict is read off the number the
 * panel prints, not off the raw share.
 *
 * The summary rounds to one decimal of a percent, so 0.996 % and 1.004 % both
 * come out as "1,0%". Comparing the raw fraction gave the second of those the
 * "close, but not right" line and a third button and the first of them nothing
 * at all — two hearts showing the same number and disagreeing about it, which
 * is exactly the confusion the line was added to remove. So the same rounding
 * that reaches the screen decides.
 */
export function isMediocre(report: { mismatch: number; motifMismatch?: number }): boolean {
	const difference = report.motifMismatch ?? report.mismatch;
	return Math.round(1000 * difference) > 1000 * MEDIOCRE_MISMATCH;
}

type Shown = { mismatch: number; motifMismatch?: number; kind?: 'exact' | 'smooth' };

/**
 * Whether a second template, arriving while another is shown, takes its place.
 * A heart only close (the panel's "close, but not right") gives way to one that
 * is not: the photographs whose sides the exact search reads deeper than their
 * edge come out over 1 %, the fitter's under it. The fitter's, shown while the
 * exact search was still looking, gives way too: it only stood in for an exact
 * one (Rød blomst: the fitter's corners at 0.7 % after 20 s, the exact template
 * at 0.2 % after 42 s), also when both are only close and the exact one is no
 * further from the mask (a bauble photograph: the fitter's 1.4 % after 10 s,
 * the network's exact template 1.2 % after 52 s, which had stayed hidden).
 */
export function givesWay(shown: Shown, found: Shown): boolean {
	const standIn = shown.kind === 'smooth' && found.kind === 'exact';
	if (standIn && (found.motifMismatch ?? found.mismatch) <= (shown.motifMismatch ?? shown.mismatch)) return true;
	return !isMediocre(found) && (isMediocre(shown) || standIn);
}
