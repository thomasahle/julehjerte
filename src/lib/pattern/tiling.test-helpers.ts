/**
 * A tile as one of our hearts, for the pattern tests, so they can ask of a
 * tile's cuts (`patternCuts`) what they ask of any heart: red cuts, the woven
 * picture. The Escher tab itself makes Tegn's fingers with
 * `generateEditorFingers` (./editorBridge).
 */
import type { BezierSegment, HeartDesign } from '$lib/types/heart';
import { segmentsToPathData } from '$lib/geometry/bezierSegments';
import { normalizeHeartDesign } from '$lib/utils/heartDesign';
import { patternCuts, type PatternTile } from './tiling';

const SMOOTH_COS = Math.cos((10 * Math.PI) / 180);
function isSmoothJoin(a: BezierSegment, b: BezierSegment): boolean {
	const t1 = { x: a.p3.x - a.p2.x, y: a.p3.y - a.p2.y };
	const t2 = { x: b.p1.x - b.p0.x, y: b.p1.y - b.p0.y };
	const l1 = Math.hypot(t1.x, t1.y);
	const l2 = Math.hypot(t2.x, t2.y);
	if (l1 < 1e-9 || l2 < 1e-9) return false;
	return (t1.x * t2.x + t1.y * t2.y) / (l1 * l2) > SMOOTH_COS;
}

function rawFinger(segments: BezierSegment[], lobe: 'left' | 'right', index: number) {
	const nodeTypes: Record<string, 'corner' | 'smooth'> = { '0': 'corner', [String(segments.length)]: 'corner' };
	for (let i = 1; i < segments.length; i++) nodeTypes[String(i)] = isSmoothJoin(segments[i - 1]!, segments[i]!) ? 'smooth' : 'corner';
	return { id: `${lobe === 'left' ? 'L' : 'R'}-cut-${index}`, lobe, pathData: segmentsToPathData(segments), nodeTypes };
}

/**
 * The tile as one of our hearts, through `normalizeHeartDesign` like every
 * other heart (it adds the square's edges and moves everything into pixels).
 */
export function patternToDesign(tile: PatternTile, opts: { name: string; author?: string }): HeartDesign {
	const { left, right } = patternCuts(tile);
	const design = normalizeHeartDesign({
		id: '',
		name: opts.name,
		author: opts.author ?? '',
		weaveParity: 1,
		gridSize: { x: right.length + 1, y: left.length + 1 },
		// A moved pattern can have a strip more one way than the other: the square stays square.
		...(right.length === left.length ? {} : { overlapAspectRatio: 1 }),
		fingers: [...left.map((s, i) => rawFinger(s, 'left', i)), ...right.map((s, i) => rawFinger(s, 'right', i))]
	});
	if (!design) throw new Error('The pattern did not make a heart.');
	return design;
}
