/**
 * Timing for the hanging hearts' sway — HangingHeart.svelte, docs/redesign/DESIGN.md §3.
 *
 * Every heart runs the same `sway` keyframes and gets a per-heart offset so
 * neighbours are out of step. The offset has to be spent as a **negative**
 * `animation-delay`: a positive delay leaves the element at its own transform
 * (rotate(0), which is outside the keyframes) until the delay elapses and then
 * snaps it onto the first keyframe — the visible "teleport". A negative delay
 * instead starts the animation that far into its cycle, so the very first frame
 * is already on the curve and nothing jumps.
 */

/** Length of one sway keyframe run, in seconds. Mirrors HangingHeart's CSS. */
export const SWAY_DURATION_S = 7;

/**
 * The `animation-delay` value that starts the sway `offset` seconds into its
 * cycle. Always zero or negative, so a caller can never reintroduce the jump.
 *
 * The offset is wrapped into one full `alternate` period (two keyframe runs,
 * there and back) — the exact same phase *and* direction of travel, just with a
 * bounded number in the markup. Non-finite offsets fall back to `0s`.
 */
export function swayAnimationDelay(offset: number): string {
	if (!Number.isFinite(offset)) return '0s';

	const period = SWAY_DURATION_S * 2;
	const phase = ((offset % period) + period) % period;
	if (phase === 0) return '0s';

	// Millisecond resolution is well under one animation frame, and keeps the
	// inline style free of float noise like `-4.199999999999999s`.
	return `-${Number(phase.toFixed(3))}s`;
}
