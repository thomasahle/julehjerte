/**
 * The editor's zoom factor for one wheel event.
 *
 * A mouse-wheel notch reports deltaY 100 (pixels) or 3 (lines), a trackpad
 * pinch a stream of small pixel deltas. Small deltas zoom 1 % per pixel, so a
 * pinch keeps its feel; from 10 px up to one notch the step stays at 10 units,
 * and a coalesced multi-notch event counts 10 units per notch. The factor is
 * exponential, so a notch zooms in and out by the same ratio (about 10 %).
 */
const ZOOM_PER_UNIT = 0.01;
const NOTCH_UNITS = 10;
const NOTCH_PX = 100;
const PX_PER_LINE = 33;

export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
	const px = deltaMode === 1 ? deltaY * PX_PER_LINE : deltaY;
	if (!Number.isFinite(px)) return 1;
	const size = Math.abs(px);
	const units = Math.max(Math.min(size, NOTCH_UNITS), (size / NOTCH_PX) * NOTCH_UNITS);
	return Math.exp(-Math.sign(px) * units * ZOOM_PER_UNIT);
}
