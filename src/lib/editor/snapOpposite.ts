import type { Finger, LobeId, Vec } from '$lib/types/heart';
import { fingerToSegments } from '$lib/geometry/bezierSegments';
import { vecDist } from '$lib/geometry/vec';

/**
 * Snap-to-opposite-lobe anchor points (GitHub issue #2): while an anchor is dragged it can
 * snap to the nearest anchor of any curve in the other lobe so matching curves line up.
 */

/** Snap radius in heart units (the overlap square is 100 x 100). */
export const SNAP_OPPOSITE_UNITS = 12;

/** The snap radius in editor pixels for an overlap rectangle of the given size. */
export function snapOppositeRadiusPx(overlap: { width: number; height: number }): number {
	return (SNAP_OPPOSITE_UNITS * (overlap.width + overlap.height)) / 200;
}

export function oppositeLobe(lobe: LobeId): LobeId {
	return lobe === 'left' ? 'right' : 'left';
}

/** Every anchor (segment start and end point) of the curves in `lobe`. */
export function lobeAnchors(fingers: Finger[], lobe: LobeId): Vec[] {
	const anchors: Vec[] = [];
	for (const finger of fingers) {
		if (finger.lobe !== lobe) continue;
		const segs = fingerToSegments(finger);
		if (!segs.length) continue;
		anchors.push(segs[0]!.p0);
		for (const seg of segs) anchors.push(seg.p3);
	}
	return anchors;
}

/**
 * The anchor of any curve in the lobe opposite to `lobe` that is nearest to `pos`, or null when
 * none is within `threshold`. `pos`, the anchors and `threshold` must share one coordinate
 * system (the editor's internal pixels, i.e. the same as a drag position).
 */
export function findNearestOppositeAnchor(fingers: Finger[], lobe: LobeId, pos: Vec, threshold: number): Vec | null {
	let best: Vec | null = null;
	let bestDist = threshold;
	for (const anchor of lobeAnchors(fingers, oppositeLobe(lobe))) {
		const d = vecDist(anchor, pos);
		if (d <= bestDist) {
			bestDist = d;
			best = { x: anchor.x, y: anchor.y };
		}
	}
	return best;
}
