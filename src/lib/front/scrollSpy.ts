/**
 * The gallery bar's scroll-spy rule (docs/redesign/GALLERY-BAR.md): which
 * category chip is current for a given scroll position.
 *
 * Kept free of the DOM so the rule can be tested on plain numbers; the bar
 * measures the sections and the page and only asks this module for the answer.
 */

/**
 * The gap between the bar's bottom edge and a section that a chip's anchor
 * lands on — the `+ 8px` in the sections' `scroll-margin-top`. The spy has to
 * use the same line: a section that has just been jumped to sits exactly this
 * far below the bar and must count as current, not as the next one down.
 */
export const ANCHOR_GAP = 8;

/**
 * Sub-pixel slack. Scroll offsets are rounded and section tops are not, so a
 * section an anchor has just landed on can sit a fraction of a pixel below the
 * line it was aimed at.
 */
const SLACK = 1;

/**
 * The index of the current section, or -1 when none is.
 *
 * @param tops each section's top edge in viewport px, in page order
 * @param line the viewport y a section has to reach to become current: the
 *   bar's bottom edge plus ANCHOR_GAP
 * @param atPageBottom the page is scrolled as far down as it goes. The last
 *   sections are often too short to ever reach the line, and without this
 *   their chips could never light up — so at the bottom the last one wins.
 */
export function activeSection(tops: number[], line: number, atPageBottom = false): number | -1 {
	if (tops.length === 0) return -1;
	if (atPageBottom) return tops.length - 1;
	let active = -1;
	for (let i = 0; i < tops.length; i++) {
		// Sections are in page order, so the first one still below the line
		// ends the search.
		if (tops[i] > line + SLACK) break;
		active = i;
	}
	return active;
}

/**
 * The current section for the bar: nothing while the bar has not stuck yet
 * (the visitor is still on the hero, even where the first row already sits
 * right under the bar), and at least the first section once it has. A chip
 * jump to the first category lands just past the point where the bar sticks
 * (CategorySection's scroll-margin), where that category's row may still
 * be hanging lower than the line on the hill; it is the row being read all
 * the same, so its chip must be current.
 */
export function currentSection(
	tops: number[],
	line: number,
	stuck: boolean,
	atPageBottom = false
): number | -1 {
	if (!stuck || tops.length === 0) return -1;
	return Math.max(0, activeSection(tops, line, atPageBottom));
}

/**
 * Whether the page is scrolled to its very bottom (within the same slack, for
 * browsers that stop a fraction of a pixel short).
 */
export function isAtPageBottom(scrollY: number, viewportHeight: number, scrollHeight: number): boolean {
	// A page that does not scroll at all is not "at the bottom": its last
	// section is simply on screen, and the ordinary rule already applies.
	if (scrollHeight <= viewportHeight) return false;
	return scrollY + viewportHeight >= scrollHeight - SLACK;
}

/**
 * How far to scroll the chip row (positive: to the right) so the current chip
 * is fully inside the row's visible part, `viewLeft`..`viewRight` (the row's
 * box less its focus-ring padding); 0 when it already is. A chip that is cut
 * off on either side is brought to the view's left edge: the row snaps chip
 * starts (`scroll-snap-align: start`), and a position that only just shows a
 * chip on the right would snap back to the previous start, cutting it off
 * again. The browser clamps the last chips to the end of the row.
 */
export function chipRowScroll(
	chipLeft: number,
	chipRight: number,
	viewLeft: number,
	viewRight: number
): number {
	if (chipLeft >= viewLeft && chipRight <= viewRight) return 0;
	return chipLeft - viewLeft;
}
