/**
 * Overlap rectangle utilities for determining the weave area of a heart design.
 * Consolidated from multiple files to avoid duplication.
 */

import type { Finger, GridSize, Vec } from '$lib/types/heart';
import { STRIP_WIDTH, CENTER } from '$lib/constants';
import { median } from '$lib/utils/math';

export interface OverlapRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

/**
 * Get the centered rectangle parameters for a given grid size.
 * This is the "default" overlap area when no fingers have been drawn.
 */
export function getCenteredRectParams(
	gridSize: GridSize,
	center: Vec = CENTER
): OverlapRect {
	const width = gridSize.x * STRIP_WIDTH;
	const height = gridSize.y * STRIP_WIDTH;
	const left = center.x - width / 2;
	const top = center.y - height / 2;
	return {
		left,
		top,
		right: left + width,
		bottom: top + height,
		width,
		height
	};
}

/**
 * Infer the overlap rectangle from the finger paths.
 * Uses the median of all finger endpoints to determine the boundaries.
 * Falls back to getCenteredRectParams if no valid fingers are provided.
 */
export function inferOverlapRect(
	fingers: Finger[],
	gridSize: GridSize,
	center: Vec = CENTER
): OverlapRect {
	const leftCandidates: number[] = [];
	const rightCandidates: number[] = [];
	const topCandidates: number[] = [];
	const bottomCandidates: number[] = [];

	for (const finger of fingers) {
		const segs = finger.segments;
		if (!segs.length) continue;
		const start = segs[0]!.p0;
		const end = segs[segs.length - 1]!.p3;

		if (finger.lobe === 'left') {
			leftCandidates.push(Math.min(start.x, end.x));
			rightCandidates.push(Math.max(start.x, end.x));
		} else {
			topCandidates.push(Math.min(start.y, end.y));
			bottomCandidates.push(Math.max(start.y, end.y));
		}
	}

	const fallback = getCenteredRectParams(gridSize, center);
	const left = leftCandidates.length ? median(leftCandidates) : fallback.left;
	let right = rightCandidates.length ? median(rightCandidates) : fallback.right;
	const top = topCandidates.length ? median(topCandidates) : fallback.top;
	let bottom = bottomCandidates.length ? median(bottomCandidates) : fallback.bottom;

	// Snap to expected dimensions if within tolerance (3px)
	const expectedW = gridSize.x * STRIP_WIDTH;
	const expectedH = gridSize.y * STRIP_WIDTH;
	if (Math.abs(right - left - expectedW) <= 3) right = left + expectedW;
	if (Math.abs(bottom - top - expectedH) <= 3) bottom = top + expectedH;

	return {
		left,
		right,
		top,
		bottom,
		width: right - left,
		height: bottom - top
	};
}
