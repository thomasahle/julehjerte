/**
 * SVG-based heart weave rendering utilities.
 * This module provides functions to render woven hearts using pure SVG,
 * without Paper.js boolean operations.
 */

import type { Finger, GridSize, LobeId } from '$lib/types/heart';
import { fingerToSegments, segmentsToPathData, type BezierSegment } from '$lib/geometry/bezierSegments';
import { inferOverlapRect, type OverlapRect } from '$lib/utils/overlapRect';

/**
 * Convert bezier segments to SVG path commands (forward direction).
 */
function segmentsToForwardPath(segments: BezierSegment[]): string {
	return segmentsToPathData(segments);
}

/**
 * Convert bezier segments to SVG path commands (backward/reversed direction).
 * Reverses both the order of segments and the control points within each segment.
 */
function segmentsToBackwardPath(segments: BezierSegment[]): string {
	if (!segments.length) return '';

	// Start from the last segment's end point
	const lastSeg = segments[segments.length - 1]!;
	const parts = new Array<string>(segments.length + 1);
	parts[0] = ` L ${lastSeg.p3.x} ${lastSeg.p3.y}`;

	// Go through segments in reverse, with reversed control points
	for (let i = segments.length - 1; i >= 0; i--) {
		const seg = segments[i]!;
		// Reversed bezier: p3->p2->p1->p0
		parts[segments.length - i] = ` C ${seg.p2.x} ${seg.p2.y} ${seg.p1.x} ${seg.p1.y} ${seg.p0.x} ${seg.p0.y}`;
	}
	return parts.join('');
}

/**
 * Build an SVG path for a closed ribbon between two finger curves.
 * Uses actual bezier curves instead of sampled polylines for smooth rendering.
 * The ribbon goes forward along fingerA, then backward along fingerB.
 */
function buildRibbonPath(fingerA: Finger, fingerB: Finger): string {
	const segsA = fingerToSegments(fingerA);
	const segsB = fingerToSegments(fingerB);

	if (!segsA.length || !segsB.length) return '';

	// Build path: forward along A using bezier curves
	let d = segmentsToForwardPath(segsA);

	// Then backward along B using reversed bezier curves
	d += segmentsToBackwardPath(segsB);

	// Close the path
	d += ' Z';

	return d;
}

/**
 * Get sorted fingers for a given lobe, ordered by their position.
 */
function getSortedFingers(fingers: Finger[], lobe: LobeId): Finger[] {
	return fingers
		.filter(f => f.lobe === lobe)
		.map(finger => {
			const segs = fingerToSegments(finger);
			const p0 = segs[0]?.p0 ?? { x: 0, y: 0 };
			return { finger, p0 };
		})
		.sort((a, b) => (lobe === 'left' ? a.p0.y - b.p0.y : a.p0.x - b.p0.x))
		.map(({ finger }) => finger);
}

/**
 * Build strip paths for a lobe.
 * Returns an array of { index, pathData } for each strip.
 */
function buildStrips(
	fingers: Finger[],
	lobe: LobeId,
	parity: 0 | 1 = 0
): Array<{ index: number; pathData: string }> {
	const sorted = getSortedFingers(fingers, lobe);
	const strips: Array<{ index: number; pathData: string }> = [];

	for (let i = 0; i < sorted.length - 1; i++) {
		// Only include strips matching the parity
		if (i % 2 !== parity) continue;

		const pathData = buildRibbonPath(sorted[i], sorted[i + 1]);
		if (pathData) {
			strips.push({ index: i, pathData });
		}
	}

	return strips;
}

/**
 * Build the SVG path for a lobe shape (semi-circle ear + rectangle).
 *
 * For the left lobe: ear is on the left side (semi-circle facing left)
 * For the right lobe: ear is on the top (semi-circle facing up)
 */
function buildLobeClipPath(
	lobe: LobeId,
	overlap: OverlapRect
): string {
	const { left, top, width, height } = overlap;

	if (lobe === 'left') {
		// Left lobe: semi-circle on the left + overlap rectangle
		// The ear extends to the LEFT of the rectangle
		const earRadius = height / 2;
		const earCenterX = left;
		const earCenterY = top + height / 2;

		// Path: Start at top of ear, arc to bottom of ear, then rectangle right side
		// Arc from (left, top) around the left to (left, bottom), large arc, counter-clockwise
		return `
			M ${left} ${top}
			A ${earRadius} ${earRadius} 0 1 0 ${left} ${top + height}
			L ${left + width} ${top + height}
			L ${left + width} ${top}
			Z
		`.trim().replace(/\s+/g, ' ');
	} else {
		// Right lobe: semi-circle on top + overlap rectangle
		// The ear extends ABOVE the rectangle
		const earRadius = width / 2;

		// Path: Start at left of ear, arc to right of ear, then rectangle bottom
		// Arc from (left, top) around the top to (right, top), large arc, clockwise
		return `
			M ${left} ${top}
			A ${earRadius} ${earRadius} 0 1 1 ${left + width} ${top}
			L ${left + width} ${top + height}
			L ${left} ${top + height}
			Z
		`.trim().replace(/\s+/g, ' ');
	}
}

/**
 * Compute the overlap rectangle from fingers and grid size.
 */
function computeOverlap(fingers: Finger[], gridSize: GridSize): OverlapRect {
	return inferOverlapRect(fingers, gridSize);
}

/**
 * Data structure representing a computed weave ready for SVG rendering.
 */
export interface WeaveData {
	overlap: OverlapRect;
	leftLobeClip: string;
	rightLobeClip: string;
	/** Strips that should be rendered in the right color on top of the left base */
	rightOnTopStrips: Array<{ index: number; pathData: string; lobe: LobeId }>;
	/** Strips that should be rendered in the left color on top of the right base (in overlap) */
	leftOnTopStrips: Array<{ index: number; pathData: string; lobe: LobeId }>;
}

/**
 * Compute all the data needed to render the weave pattern.
 */
export function computeWeaveData(
	fingers: Finger[],
	gridSize: GridSize,
	weaveParity: 0 | 1 = 0
): WeaveData {
	const overlap = computeOverlap(fingers, gridSize);

	const leftLobeClip = buildLobeClipPath('left', overlap);
	const rightLobeClip = buildLobeClipPath('right', overlap);

	// Build strips for both lobes
	// The weave pattern uses evenodd fill rule:
	// - Areas inside exactly 1 strip: filled with right color
	// - Areas inside 2 strips (overlapping): not filled (left color shows through)
	// - This creates the checkerboard weave effect

	// Match Paper.js: left strips use parity 0, right strips use weaveParity
	const leftStrips = buildStrips(fingers, 'left', 0);
	const rightStrips = buildStrips(fingers, 'right', weaveParity);

	return {
		overlap,
		leftLobeClip,
		rightLobeClip,
		rightOnTopStrips: rightStrips.map(s => ({ ...s, lobe: 'right' as LobeId })),
		leftOnTopStrips: leftStrips.map(s => ({ ...s, lobe: 'left' as LobeId }))
	};
}

/**
 * Get the SVG path data for a finger curve.
 */
