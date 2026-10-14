import type { BezierSegment } from './bezierSegments';
import { heartPathReturns, type ReturnPoint } from './returnSearch';

/** Whole-cut return check in the editor's coordinate system. Crossing and
 * clearance between different cuts remain separate checks.
 *
 * The editor's minimum distance represents 1.5 heart units. Normalize around
 * the cut's start so both numerical tolerances and the one-unit endpoint
 * exemption stay fixed when the same template is resized or translated.
 */
export function hasSelfReturn(segments: readonly BezierSegment[], minimumDistance: number): boolean {
	const curves = segments.map(segment =>
		[segment.p0, segment.p1, segment.p2, segment.p3].map(point => [
			point.x,
			point.y
		] as ReturnPoint)
	);
	return heartPathReturns(curves, minimumDistance).length > 0;
}
