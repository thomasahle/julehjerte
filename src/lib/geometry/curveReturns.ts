import type { BezierSegment } from './bezierSegments';
import { ReturnCurve, pathReturns, type ReturnPoint } from './returnSearch';

/** Whole-cut return check in the editor's coordinate system. Crossing and
 * clearance between different cuts remain separate checks.
 *
 * The editor's minimum distance represents 1.5 heart units. Normalize around
 * the cut's start so both numerical tolerances and the one-unit endpoint
 * exemption stay fixed when the same template is resized or translated.
 */
export function hasSelfReturn(segments: readonly BezierSegment[], minimumDistance: number): boolean {
	if (!segments.length || !(minimumDistance > 0) || !Number.isFinite(minimumDistance)) return false;
	const scale = 1.5 / minimumDistance;
	const origin = segments[0].p0;
	const curves = segments.map(segment => new ReturnCurve(
		[segment.p0, segment.p1, segment.p2, segment.p3].map(point => [
			(point.x - origin.x) * scale,
			(point.y - origin.y) * scale
		] as ReturnPoint)
	));
	return pathReturns(curves, { margin: 1.5, tolerance: 0.01, endpointTolerance: 1 }).length > 0;
}
