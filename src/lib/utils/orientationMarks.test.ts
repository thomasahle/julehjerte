import { describe, it, expect } from 'vitest';
import type { HeartDesign, Vec } from '$lib/types/heart';
import { gallerySvgs, loadHeart } from '$lib/laser/testHearts.test-helpers';
import { computeWeaveData } from '$lib/rendering/svgWeave';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { lobesShareTemplate, SHARED_TEMPLATE_LOBE } from '$lib/utils/symmetry';
import { getTemplateData, type TemplateLobe } from '$lib/utils/templateSvg';
import { heartScale } from '$lib/laser/unfold';
import {
	cutDistance,
	distanceToLines,
	dedupeMarks,
	markPathData,
	needsOrientationMarks,
	samplePathData,
	shownTemplateMarks,
	templateMarks,
	type PlacedMark
} from './orientationMarks';

/**
 * The hearts whose templates get marks: every one with a piece that is not
 * its own mirror image about its long axis. Kept as a list so a new or
 * redrawn gallery heart that changes it is noticed.
 */
const MARKED = [
	'5star', 'alhambra', 'amy-weave-1', 'amy-weave-2', 'angel', 'boelgebrud', 'boelger',
	'dagognat', 'david4', 'davidsstjerne-circ', 'fejlternet', 'fisk', 'fiskeskael', 'flower',
	'flyvendegaes', 'god-jul', 'h4h2', 'hanefod', 'hermanngitter', 'hjerte-i-hjerte-i-hjerte', 'hjerte-paa-hjerte',
	'hvirvel', 'jul', 'jul-2026', 'jul-tern',
	'juletrae', 'khatam', 'koelbuer', 'lilje1', 'lilje2', 'mor-far', 'mor-og-barn',
	'nemt-hjerte', 'ni-hjerter-i-tern', 'origami', 'permo-cirkler', 'permo-draaber', 'permo-kroge',
	'plus', 'plus3', 'potteplante',
	'puslespil', 'roed-blomst', 'roserude', 'santa', 'sildeben', 'simple-5star', 'skraa-kryds',
	'snowflake', 'squares', 'stjernegitter', 'sun', 'tak', 'triple-heart', 'tulipan', 'venus'
];

const allIds = Object.keys(gallerySvgs)
	.map((key) => key.split('/').pop()!.replace(/\.svg$/, ''))
	.sort();

describe('needsOrientationMarks', () => {
	it('marks exactly the hearts with a piece that can go in the wrong way round', { timeout: 120_000 }, () => {
		const marked = allIds.filter((id) => needsOrientationMarks(loadHeart(id)));
		expect(marked).toEqual(MARKED);
	});

	it('leaves the classic heart and other symmetric hearts alone', () => {
		for (const id of ['classic-3x3', 'stjerne', 'ramme', 'hjertekloever', 'circle']) {
			expect(needsOrientationMarks(loadHeart(id)), id).toBe(false);
		}
	});

	it('leaves two different but each symmetric halves alone (Drageskæl): every way in is right', () => {
		const design = loadHeart('drageskael');
		expect(lobesShareTemplate(design.fingers, design.gridSize)).toBe(false);
		expect(needsOrientationMarks(design)).toBe(false);
	});
});

// ---- The proof: a piece laid with its mark at the top of the heart is the woven lobe ----

/** The inverse of getTemplateData's map: points of `lobe`'s template back in
 * the editor's frame (measured once, as a detailed heart has thousands). */
function templateToEditor(design: HeartDesign, lobe: TemplateLobe): (p: Vec) => Vec {
	const rect = inferOverlapRect(design.fingers, design.gridSize);
	const R = getTemplateData(design, lobe).earRadius;
	return (p) => lobe === 'left'
		? { x: p.y - R + rect.left, y: p.x + rect.top }
		: { x: p.x + rect.left, y: p.y - R + rect.top };
}

/** heartSvg's view: the editor's frame turned 45° clockwise about the overlap's centre. */
function rendered(design: HeartDesign, p: Vec): Vec {
	const rect = inferOverlapRect(design.fingers, design.gridSize);
	const o = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
	const c = Math.SQRT1_2;
	return { x: o.x + (p.x - o.x) * c - (p.y - o.y) * c, y: o.y + (p.x - o.x) * c + (p.y - o.y) * c };
}

/**
 * The printed piece laid in `lobe`'s place with its mark where the mark says:
 * as printed when the mark is on the template's left side, turned over (x → W − x)
 * when it is on the right. Returns the map from printed template to editor frame.
 */
function pose(design: HeartDesign, printed: TemplateLobe, lobe: TemplateLobe, turned: boolean) {
	const W = getTemplateData(design, printed).templateWidth, toEditor = templateToEditor(design, lobe);
	return (p: Vec) => toEditor(turned ? { x: W - p.x, y: p.y } : p);
}

/** Every outline of the woven rendering's strips of `lobe`, both parities. */
function wovenStrips(design: HeartDesign, lobe: TemplateLobe) {
	const lines = [0, 1].flatMap((parity) => {
		const weave = computeWeaveData(design.fingers, design.gridSize, parity as 0 | 1);
		const strips = lobe === 'left' ? weave.leftOnTopStrips : weave.rightOnTopStrips;
		return strips.flatMap((s) => samplePathData(s.pathData, 12));
	});
	return lines;
}

function checkHeart(id: string) {
	const design = loadHeart(id);
	const shared = lobesShareTemplate(design.fingers, design.gridSize);
	const scale = heartScale(design, 80);
	const rect = inferOverlapRect(design.fingers, design.gridSize);
	const tol = 0.02 * Math.max(rect.width, rect.height);
	const square = [
		{ x: rect.left, y: rect.top },
		{ x: rect.left + rect.width, y: rect.top },
		{ x: rect.left + rect.width, y: rect.top + rect.height },
		{ x: rect.left, y: rect.top + rect.height }
	];
	const edges = square.map((a, i) => [a, square[(i + 1) % 4]!]);
	const result: Record<TemplateLobe, PlacedMark> = {} as never;

	for (const lobe of ['left', 'right'] as const) {
		const printed = shared ? SHARED_TEMPLATE_LOBE : lobe;
		const marks = templateMarks(design, printed, [lobe], scale);
		expect(marks).toHaveLength(1);
		const mark = marks[0]!;
		result[lobe] = mark;
		expect(mark.kind).toBe(lobe === 'left' ? 'circled' : 'plain');
		const W = getTemplateData(design, printed).templateWidth;
		const turned = mark.x > W / 2;

		// 1. Laid that way, the mark is at the top of the rendered heart:
		//    nearer the square's top corner (the cleft) than any other corner.
		const at = rendered(design, pose(design, printed, lobe, turned)(mark));
		const corners = square.map((c) => rendered(design, c));
		const top = corners.reduce((a, b) => (b.y < a.y ? b : a));
		const nearest = corners.reduce((a, b) =>
			Math.hypot(b.x - at.x, b.y - at.y) < Math.hypot(a.x - at.x, a.y - at.y) ? b : a
		);
		expect(nearest).toEqual(top);
		expect(Math.hypot(at.x - top.x, at.y - top.y)).toBeLessThan(10 / scale); // within 10 mm at 80 mm

		// 2. Laid that way, the piece's cuts are the woven lobe's: every strip
		//    outline the site renders lies on a cut or on the square's edge.
		const strips = wovenStrips(design, lobe);
		const cuts = (t: boolean) => {
			const f = pose(design, printed, lobe, t);
			return getTemplateData(design, printed)
				.cutPaths.flatMap((d) => samplePathData(d, 12))
				.map((line) => line.map(f))
				.concat(edges);
		};
		const away = (t: boolean) => {
			const c = cuts(t);
			let worst = 0;
			for (const line of strips) for (const p of line) worst = Math.max(worst, distanceToLines(p, c));
			return worst;
		};
		expect(away(turned)).toBeLessThan(tol);
		// …and the other way round it is not, unless the piece is its own
		// mirror image (Hanefod's left half): the mark is what tells them apart.
		const lines = getTemplateData(design, printed).cutPaths.flatMap((d) => samplePathData(d, 12));
		const symmetric = cutDistance(lines, lines.map((l) => l.map((p) => ({ x: W - p.x, y: p.y })))) < 0.02 * W;
		if (!symmetric) expect(away(!turned)).toBeGreaterThan(tol);
	}
	return { design, shared, marks: result };
}

describe('the marks match the woven heart', () => {
	it('Jul (two templates): each piece laid with its mark at the top weaves the site’s heart', () => {
		const { shared, marks } = checkHeart('jul');
		expect(shared).toBe(false);
		// Both marks by the template's left side, just below the ear base.
		const left = getTemplateData(loadHeart('jul'), 'left');
		expect(marks.left.x).toBeLessThan(left.templateWidth / 4);
		expect(marks.left.y).toBeGreaterThan(left.earRadius);
	});

	it('Kroge (one template, chiral): the left piece goes in turned over, so its ⊗ is on the other side', () => {
		const { design, shared, marks } = checkHeart('permo-kroge');
		expect(shared).toBe(true);
		const W = getTemplateData(design, SHARED_TEMPLATE_LOBE).templateWidth;
		expect(marks.right.x).toBeLessThan(W / 4);
		expect(marks.left.x).toBeGreaterThan((3 * W) / 4);
	});

	it('every marked gallery heart passes the same check', { timeout: 120_000 }, () => {
		for (const id of MARKED) checkHeart(id);
	});
});

describe('marks on screen and as paths', () => {
	it('a shared template shown once carries both marks; one ⊗ when they share the corner', () => {
		const kroge = loadHeart('permo-kroge');
		const k = shownTemplateMarks(kroge, 'left', heartScale(kroge, 80));
		expect(k.map((m) => m.kind).sort()).toEqual(['circled', 'plain']);
		const angel = loadHeart('angel'); // shared, the same piece both ways
		const a = shownTemplateMarks(angel, 'left', heartScale(angel, 80));
		expect(a.map((m) => m.kind)).toEqual(['circled']);
	});

	it('no marks for a symmetric heart', () => {
		const classic = loadHeart('classic-3x3');
		expect(shownTemplateMarks(classic, 'left', 0.3)).toEqual([]);
		expect(templateMarks(classic, 'right', ['left', 'right'], 0.3)).toEqual([]);
	});

	it('draws ⊗ as a cross and a circle, × as a cross', () => {
		const m: PlacedMark = { kind: 'circled', lobe: 'left', x: 10, y: 20, r: 2 };
		expect(markPathData(m).match(/M/g)).toHaveLength(3);
		expect(markPathData(m)).toContain('A 2 2');
		expect(markPathData({ ...m, kind: 'plain' })).not.toContain('A');
		expect(dedupeMarks([{ ...m, kind: 'plain' }, m])).toEqual([m]);
	});

	it('stays clear of every cut, about 3 mm across, at 40 mm for every marked heart', { timeout: 120_000 }, () => {
		for (const id of MARKED) {
			const design = loadHeart(id);
			const scale = heartScale(design, 40);
			for (const lobe of ['left', 'right'] as const) {
				const printed = lobesShareTemplate(design.fingers, design.gridSize) ? SHARED_TEMPLATE_LOBE : lobe;
				const [mark] = templateMarks(design, printed, [lobe], scale);
				const lines = getTemplateData(design, printed).cutPaths.flatMap((d) => samplePathData(d, 24));
				const clear = distanceToLines(mark!, lines) * scale - mark!.r * scale;
				expect(clear, `${id} ${lobe}`).toBeGreaterThan(0.35);
				expect(mark!.r * scale, id).toBeGreaterThanOrEqual(0.75);
			}
		}
	});
});
