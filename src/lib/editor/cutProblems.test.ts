import { describe, expect, it, vi } from 'vitest';
import classicSvg from '../../../static/hearts/classic-3x3.svg?raw';
import santaSvg from '../../../static/hearts/santa.svg?raw';
import dagognatSvg from '../../../static/hearts/dagognat.svg?raw';
import boelgerSvg from '../../../static/hearts/boelger.svg?raw';
import type { Finger, Vec } from '$lib/types/heart';
import { parseHeartFromSVG } from '$lib/utils/heartDesign';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { idForBoundary } from './cutIds';
import {
	candidateProblem,
	clearanceMargin,
	closeProblem,
	cutsProblem,
	dragProblem,
	fingersProblem,
	foldProblem,
	judgeOnce,
	makesRedCuts,
	overridesProblem,
	redCount,
	sameCuts,
	wasClose,
	type DragJudge,
	type JudgedHeart
} from './cutProblems';

/** A gallery heart as Tegn has it: its cuts named from one outer edge to the other, edges included. */
function tegn(svg: string, name: string): JudgedHeart {
	const design = parseHeartFromSVG(svg, name)!;
	const lobe = (l: 'left' | 'right') =>
		design.fingers
			.filter((f) => f.lobe === l)
			.sort((a, b) => (l === 'left' ? a.segments[0]!.p0.y - b.segments[0]!.p0.y : a.segments[0]!.p0.x - b.segments[0]!.p0.x))
			.map((f, i) => ({ ...f, id: idForBoundary(l, i) }));
	const fingers = [...lobe('left'), ...lobe('right')];
	return { fingers, gridSize: design.gridSize, rect: inferOverlapRect(fingers, design.gridSize) };
}

const classic = tegn(classicSvg, 'classic-3x3.svg');
const santa = tegn(santaSvg, 'santa.svg');
const dagognat = tegn(dagognatSvg, 'dagognat.svg');
const boelger = tegn(boelgerSvg, 'boelger.svg');

const cut = (heart: JudgedHeart, id: string) => heart.fingers.find((f) => f.id === id)!;
const moved = (f: Finger, d: Vec): Finger => ({
	...f,
	segments: f.segments.map((s) => ({
		p0: { x: s.p0.x + d.x, y: s.p0.y + d.y },
		p1: { x: s.p1.x + d.x, y: s.p1.y + d.y },
		p2: { x: s.p2.x + d.x, y: s.p2.y + d.y },
		p3: { x: s.p3.x + d.x, y: s.p3.y + d.y }
	}))
});
/** A cut through these points, straight from each to the next. */
const through = (id: string, lobe: Finger['lobe'], points: Vec[]): Finger => ({
	id,
	lobe,
	segments: points.slice(1).map((p3, k) => ({ p0: points[k]!, p1: points[k]!, p2: p3, p3 }))
});
const inner = (heart: JudgedHeart) =>
	new Map(heart.fingers.filter((f) => !/-0$/.test(f.id) && f.id !== `L-${heart.gridSize.y}` && f.id !== `R-${heart.gridSize.x}`).map((f) => [f.id, f]));
const drag = (start: Finger[], cutId: string | null = 'L-1'): DragJudge => ({ cut: cutId, start, close: new Map() });

describe("a gallery heart's own cuts", () => {
	it('pass the checks, but for the Julemand, one of whose cuts crosses itself', () => {
		expect(overridesProblem(classic, inner(classic))).toBeNull();
		expect(overridesProblem(dagognat, inner(dagognat))).toBeNull();
		expect(overridesProblem(boelger, inner(boelger))).toBeNull();
		expect(overridesProblem(santa, inner(santa))).toBe('self');
		const own = [...inner(santa).values()].filter((f) => candidateProblem(santa, f.id, f) !== null).map((f) => [f.id, candidateProblem(santa, f.id, f)]);
		expect(own).toEqual([['L-2', 'self']]);
	});

	it('are red as the editor counts them', () => {
		expect([classic, dagognat, boelger, santa].map((h) => redCount(h.fingers, h.gridSize))).toEqual([0, 0, 0, 2]);
		expect([classic, dagognat, boelger, santa].map((h) => clearanceMargin(h.fingers, h.gridSize))).toEqual([3.375, 4.5, 4.5, 4.5]);
	});
});

describe('a cut an edit would make', () => {
	it('crosses the next cut where an end goes past its end, and leaves the square only as an outer edge', () => {
		expect(candidateProblem(classic, 'L-1', moved(cut(classic, 'L-1'), { x: 0, y: 80 }))).toBe('cross');
		expect(candidateProblem(classic, 'L-1', moved(cut(classic, 'L-1'), { x: 0, y: -80 }))).toBe('cross');
		expect(candidateProblem(classic, 'L-0', moved(cut(classic, 'L-0'), { x: 0, y: -10 }))).toBe('outside');
		expect(candidateProblem(classic, 'R-3', moved(cut(classic, 'R-3'), { x: 10, y: 0 }))).toBe('outside');
		// moved a little, it is fine
		expect(candidateProblem(classic, 'L-1', moved(cut(classic, 'L-1'), { x: 0, y: 20 }))).toBeNull();
	});

	it('leaves the square where it bulges out of it, its ends in place', () => {
		const r1 = cut(classic, 'R-1');
		const seg = r1.segments[0]!;
		const bulging = { ...r1, segments: [{ ...seg, p1: { x: seg.p1.x - 120, y: seg.p1.y - 60 }, p2: { x: seg.p2.x - 120, y: seg.p2.y + 60 } }] };
		expect(candidateProblem(classic, 'R-1', bulging)).toBe('outside');
	});

	it('crosses itself where one stretch of it runs over another', () => {
		const zigzag = through('L-1', 'left', [{ x: 412.5, y: 262.5 }, { x: 250, y: 262.5 }, { x: 300, y: 230 }, { x: 300, y: 290 }, { x: 187.5, y: 262.5 }]);
		expect(candidateProblem(classic, 'L-1', zigzag)).toBe('self');
	});

	it('is judged by its quick checks before any crossing, every cut of the edit first', () => {
		const l1 = cut(classic, 'L-1');
		const seg = l1.segments[0]!;
		// L-1 bent down across L-2, its ends where they were: only the crossings find it
		const across = { ...l1, segments: [{ ...seg, p1: { x: seg.p1.x - 50, y: 440 }, p2: { x: seg.p2.x + 50, y: 440 } }] };
		expect(candidateProblem(classic, 'L-1', across, undefined, undefined, 'quick')).toBeNull();
		expect(candidateProblem(classic, 'L-1', across)).toBe('cross');
		const r1 = cut(classic, 'R-1');
		const out = moved(r1, { x: 0, y: 0 });
		out.segments[0] = { ...out.segments[0]!, p1: { x: 120, y: 300 }, p2: { x: 120, y: 300 } };
		const both = new Map([
			['L-1', across],
			['R-1', out]
		]);
		expect(overridesProblem(classic, new Map([['L-1', across]]))).toBe('cross');
		expect(overridesProblem(classic, both)).toBe('outside');
		expect(cutsProblem(classic, both.values(), both)).toBe('outside');
	});

	it('is judged among a whole set of cuts on its own grid', () => {
		expect(fingersProblem(classic, classic.fingers, classic.gridSize)).toBeNull();
		const across = classic.fingers.map((f) => (f.id === 'L-1' ? moved(f, { x: 0, y: 80 }) : f));
		expect(fingersProblem(classic, across, classic.gridSize)).toBe('cross');
		expect(fingersProblem(dagognat, dagognat.fingers, dagognat.gridSize)).toBeNull();
	});
});

describe('a drag', () => {
	const margin = clearanceMargin(classic.fingers, classic.gridSize);
	const near = (gap: number) => moved(cut(classic, 'L-1'), { x: 0, y: 75 - gap });

	it('may not take a cut closer to the next than the margin, unless it was that close as it began', () => {
		const tooClose = new Map([['L-1', near(margin / 2)]]);
		expect(closeProblem(classic, drag(classic.fingers), tooClose)).toBe('close');
		expect(dragProblem(classic, drag(classic.fingers), tooClose)).toBe('close');
		const closeAlready = classic.fingers.map((f) => (f.id === 'L-1' ? near(1) : f));
		expect(closeProblem(classic, drag(closeAlready), tooClose)).toBeNull();
		// a crossing comes first
		expect(dragProblem(classic, drag(classic.fingers), new Map([['L-1', near(-10)]]))).toBe('cross');
		expect(dragProblem(classic, drag(classic.fingers), new Map([['L-1', near(margin * 2)]]))).toBeNull();
	});

	it('works out once whether two cuts were close as it began, and keeps that for the drag', () => {
		const judge = drag(classic.fingers);
		expect(wasClose(classic, judge, 'L-2', 'L-1')).toBe(false);
		expect([...judge.close]).toEqual([['L-1 L-2', false]]);
		// the cuts it began with no longer matter for that pair
		judge.start = classic.fingers.map((f) => (f.id === 'L-1' ? near(1) : f));
		expect(wasClose(classic, judge, 'L-1', 'L-2')).toBe(false);
		expect(closeProblem(classic, judge, new Map([['L-1', near(margin / 2)]]))).toBe('close');
		expect(wasClose(classic, drag(judge.start), 'L-1', 'L-2')).toBe(true);
	});

	it('may not fold the dragged cut closer to itself than the margin, unless it was folded so as it began', () => {
		// back and over itself, half the margin from where it went the other way
		const y = 262.5;
		const folded = through('L-1', 'left', [{ x: 412.5, y }, { x: 250, y }, { x: 300, y: y + margin / 2 }, { x: 187.5, y: y + margin / 2 }]);
		const overrides = new Map([['L-1', folded]]);
		expect(candidateProblem(classic, 'L-1', folded)).toBeNull();
		expect(foldProblem(classic, drag(classic.fingers), overrides)).toBe('close');
		expect(foldProblem(classic, drag(classic.fingers, 'L-2'), overrides)).toBeNull();
		expect(foldProblem(classic, drag(classic.fingers, null), overrides)).toBeNull();
		expect(foldProblem(classic, drag(classic.fingers.map((f) => (f.id === 'L-1' ? folded : f))), overrides)).toBeNull();
	});

	it("judges each place its search tries once, from a plain copy of the point", () => {
		const at = vi.fn((p: Vec) => new Map([['L-1', moved(cut(classic, 'L-1'), p)]]));
		const problemOf = vi.fn((o: Map<string, Finger>) => dragProblem(classic, drag(classic.fingers), o));
		const judge = judgeOnce(at, problemOf);
		const point = { x: 0, y: 80 };
		const first = judge(point);
		expect(first.problem).toBe('cross');
		expect(judge({ x: 0, y: 80 })).toBe(first);
		expect(at).toHaveBeenCalledTimes(1);
		expect(at.mock.calls[0]![0]).not.toBe(point);
		expect(at.mock.calls[0]![0]).toEqual(point);
		expect(judge({ x: 0, y: 10 }).problem).toBeNull();
		expect(problemOf).toHaveBeenCalledTimes(2);
	});
});

describe('red cuts an edit makes', () => {
	const margin = clearanceMargin(classic.fingers, classic.gridSize);
	it('are only those the heart has not now', () => {
		const next = classic.fingers.map((f) => (f.id === 'L-1' ? moved(f, { x: 0, y: 75 - margin / 2 }) : f));
		expect(makesRedCuts(classic, next)).toBe(true);
		expect(makesRedCuts(classic, classic.fingers.map((f) => (f.id === 'L-1' ? moved(f, { x: 0, y: 10 }) : f)))).toBe(false);
		// the Julemand's red cuts, its own, are none it makes
		expect(makesRedCuts(santa, santa.fingers)).toBe(false);
		expect(makesRedCuts(santa, santa.fingers.map((f) => ({ ...f })))).toBe(false);
	});
});

describe('the same cuts', () => {
	it('are the same to a millionth of a pixel, in the same order, by the same names', () => {
		expect(sameCuts(dagognat.fingers, dagognat.fingers.map((f) => moved(f, { x: 5e-7, y: -5e-7 })))).toBe(true);
		expect(sameCuts(dagognat.fingers, dagognat.fingers.map((f) => moved(f, { x: 2e-6, y: 0 })))).toBe(false);
		expect(sameCuts(dagognat.fingers, dagognat.fingers.slice(1))).toBe(false);
		expect(sameCuts(dagognat.fingers, [...dagognat.fingers].reverse())).toBe(false);
		expect(sameCuts(classic.fingers, classic.fingers.map((f) => (f.id === 'R-1' ? { ...f, id: 'R-9' } : f)))).toBe(false);
	});
});
