/**
 * Slivers between the two lobes' cuts, for Tegn's random buttons ($lib/editor/randomHeart and the Escher
 * tab's random tile): a left and a right cut may cross, but where they nearly follow each other, or lie on
 * each other for a stretch, the paper between them is a sliver too thin to cut or weave, and on the screen
 * a hairline. The red cuts (`findFingersWithIssues`) only compare cuts of one lobe.
 */
import type { Finger, Vec } from '$lib/types/heart';

/** Points along a cut, about every `step` units, for the closeness check below. */
function samplePoints(finger: Finger, step: number): Vec[] {
	const points: Vec[] = [];
	for (const seg of finger.segments) {
		const length = Math.hypot(seg.p3.x - seg.p0.x, seg.p3.y - seg.p0.y) + Math.hypot(seg.p1.x - seg.p0.x, seg.p1.y - seg.p0.y);
		const count = Math.max(4, Math.ceil(length / step));
		for (let i = 0; i < count; i++) {
			const t = i / count;
			const u = 1 - t;
			points.push({
				x: u * u * u * seg.p0.x + 3 * u * u * t * seg.p1.x + 3 * u * t * t * seg.p2.x + t * t * t * seg.p3.x,
				y: u * u * u * seg.p0.y + 3 * u * u * t * seg.p1.y + 3 * u * t * t * seg.p2.y + t * t * t * seg.p3.y
			});
		}
	}
	return points;
}

/**
 * Whether a left cut runs alongside a right cut, closer than `close` for longer than `run`: the two
 * halves' cuts may cross, but where they nearly follow each other the paper between them is a sliver
 * too thin to cut or weave, and on the screen a hairline.
 */
export function halvesRunTogether(fingers: Finger[], close: number, run: number): boolean {
	const step = close / 2;
	const inner = (f: Finger) => f.segments.some((s) => s.p1.x !== s.p0.x || s.p1.y !== s.p0.y);
	const right = fingers.filter((f) => f.lobe === 'right' && inner(f)).flatMap((f) => samplePoints(f, step));
	for (const finger of fingers.filter((f) => f.lobe === 'left' && inner(f))) {
		let together = 0;
		for (const p of samplePoints(finger, step)) {
			const near = right.some(
				(q) => Math.abs(q.x - p.x) < close && Math.abs(q.y - p.y) < close && Math.hypot(q.x - p.x, q.y - p.y) < close
			);
			together = near ? together + step : 0;
			if (together > run) return true;
		}
	}
	return false;
}

/**
 * Whether no left cut runs alongside a right cut: within 1.5 red-cut margins for 10 margins, which two
 * cuts crossing at less than about 18° do. The wedges of an ordinary curved crossing pass.
 */
export function halvesCrossCleanly(fingers: Finger[], margin: number): boolean {
	return !halvesRunTogether(fingers, 1.5 * margin, 10 * margin);
}
