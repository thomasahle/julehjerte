import { describe, expect, it } from 'vitest';
import type { HeartDesign, Vec } from '$lib/types/heart';
import { getTemplateData } from '$lib/utils/templateSvg';
import { LaserExportError, reversePath, unfoldPiece, type LaserPath, type LaserSegment } from './unfold';
import heartDesigns from '$lib/data/heart-designs.json';
import { gallerySvgs, loadHeart } from './testHearts';

const WIDTH = 80;
const EPS = 1e-9;

/** The midpoint of a half-circle arc, by SVG's own rules: sweep 1 runs the positive angle way. */
function arcMidpoint(from: Vec, seg: Extract<LaserSegment, { kind: 'A' }>): Vec {
	const c = { x: (from.x + seg.to.x) / 2, y: (from.y + seg.to.y) / 2 };
	const start = Math.atan2(from.y - c.y, from.x - c.x);
	const mid = start + (seg.sweep === 1 ? Math.PI / 2 : -Math.PI / 2);
	return { x: c.x + seg.r * Math.cos(mid), y: c.y + seg.r * Math.sin(mid) };
}

/** Start, every segment's end, in order. */
function nodes(path: LaserPath): Vec[] {
	return [path.start, ...path.segments.map((s) => s.to)];
}

function expectClose(a: Vec, b: Vec): void {
	expect(a.x).toBeCloseTo(b.x, 9);
	expect(a.y).toBeCloseTo(b.y, 9);
}

describe.each(['classic-3x3', 'jul', 'stjerne', 'hanefod'])('unfoldPiece on %s', (name) => {
	const design = loadHeart(name);

	for (const lobe of ['left', 'right'] as const) {
		const piece = unfoldPiece(design, lobe, WIDTH);
		const template = getTemplateData(design, lobe);
		const scale = piece.widthMm / template.templateWidth;
		const R = template.earRadius * scale;
		const H = template.templateHeight * scale;

		it(`${lobe}: the outline closes, with its ears bulging out to y = 0 and y = 2H`, () => {
			const { outline } = piece;
			expect(outline.closed).toBe(true);
			expect(piece.heightMm).toBeCloseTo(2 * H, 9);
			expect(outline.segments.map((s) => s.kind)).toEqual(['A', 'L', 'A']);
			expectClose(outline.start, { x: 0, y: R });
			const [top, side, bottom] = outline.segments as [
				Extract<LaserSegment, { kind: 'A' }>,
				LaserSegment,
				Extract<LaserSegment, { kind: 'A' }>
			];
			expectClose(arcMidpoint(outline.start, top), { x: piece.widthMm / 2, y: 0 });
			expectClose(side.to, { x: piece.widthMm, y: 2 * H - R });
			expectClose(arcMidpoint(side.to, bottom), { x: piece.widthMm / 2, y: 2 * H });
			// Z closes the left side back to the start.
			expect(bottom.to.x).toBe(0);
		});

		it(`${lobe}: every cut runs from y = R through the fold once to y = 2H − R, mirrored`, () => {
			expect(piece.cuts.length).toBe((lobe === 'left' ? design.gridSize.y : design.gridSize.x) - 1);
			for (const cut of piece.cuts) {
				const points = nodes(cut);
				expect(points[0]!.y).toBe(R);
				expect(points[points.length - 1]!.y).toBeCloseTo(2 * H - R, 9);

				const onFold = points.map((p, i) => [p, i] as const).filter(([p]) => Math.abs(p.y - H) < EPS);
				expect(onFold).toHaveLength(1);
				const foldIndex = onFold[0]![1];
				expect(points.slice(0, foldIndex).every((p) => p.y < H)).toBe(true);
				expect(points.slice(foldIndex + 1).every((p) => p.y > H)).toBe(true);

				// The second half, read backwards and mirrored, is the first half exactly.
				const half = cut.segments.length / 2;
				expect(Number.isInteger(half)).toBe(true);
				const first: LaserPath = { start: cut.start, segments: cut.segments.slice(0, half), closed: false };
				const second: LaserPath = { start: points[half]!, segments: cut.segments.slice(half), closed: false };
				const back = reversePath(second);
				const mirror = (p: Vec) => ({ x: p.x, y: 2 * H - p.y });
				expect(back.segments.map((s) => s.kind)).toEqual(first.segments.map((s) => s.kind));
				expectClose(mirror(back.start), first.start);
				back.segments.forEach((seg, i) => {
					const orig = first.segments[i]!;
					expectClose(mirror(seg.to), orig.to);
					if (seg.kind === 'C' && orig.kind === 'C') {
						expectClose(mirror(seg.c1), orig.c1);
						expectClose(mirror(seg.c2), orig.c2);
					}
				});
			}
		});
	}
});

describe('strip width', () => {
	it('is a third of the width on the classic 3 × 3', () => {
		const design = loadHeart('classic-3x3');
		for (const lobe of ['left', 'right'] as const) {
			const piece = unfoldPiece(design, lobe, 90);
			expect(piece.widthMm).toBeCloseTo(90, 9);
			expect(piece.stripWidthMm).toBeCloseTo(30, 9);
		}
	});

	it('is the same on both pieces of a non-square grid, whose wider piece is the width', () => {
		const design = loadHeart('amy-weave-1');
		expect(design.gridSize).toEqual({ x: 8, y: 7 });
		const left = unfoldPiece(design, 'left', 80);
		const right = unfoldPiece(design, 'right', 80);
		// Left: gridSize.y = 7 strips across; right: gridSize.x = 8.
		expect(right.widthMm).toBeCloseTo(80, 9);
		expect(left.widthMm).toBeCloseTo((80 * 7) / 8, 9);
		expect(left.stripWidthMm).toBeCloseTo(10, 9);
		expect(right.stripWidthMm).toBeCloseTo(10, 9);
		expect(left.cuts).toHaveLength(6);
		expect(right.cuts).toHaveLength(7);
	});
});

describe('every gallery heart', () => {
	// The designs the site ships (heart-designs.json, rounded to 3 decimals), not
	// the SVGs they came from: the rounding is what the download dialog unfolds.
	const shipped = Object.values(heartDesigns as unknown as Record<string, HeartDesign>);

	it.each(shipped.map((design) => [design.id, design] as const))('%s unfolds', (_id, design) => {
		for (const lobe of ['left', 'right'] as const) {
			const piece = unfoldPiece(design, lobe, WIDTH);
			expect(piece.cuts.length).toBe((lobe === 'left' ? design.gridSize.y : design.gridSize.x) - 1);
		}
	});

	it('covers every gallery SVG', () => {
		const names = Object.keys(gallerySvgs).map((path) => path.split('/').pop()!.replace(/\.svg$/, ''));
		expect(shipped.map((design) => design.id).sort()).toEqual(expect.arrayContaining(names.sort()));
	});
});

describe('Bølgebrud, whose rounded fingers span 450.001 units', () => {
	const design = (heartDesigns as unknown as Record<string, HeartDesign>)['boelgebrud']!;

	it.each([40, 60, 80, 120])('unfolds at %i mm, both lobes, its cuts closing on the fold', (width) => {
		for (const lobe of ['left', 'right'] as const) {
			const piece = unfoldPiece(design, lobe, width);
			const template = getTemplateData(design, lobe);
			const scale = piece.widthMm / template.templateWidth;
			const R = template.earRadius * scale;
			const H = template.templateHeight * scale;
			for (const cut of piece.cuts) {
				const points = nodes(cut);
				expect(points[0]!.y).toBe(R);
				expect(points.filter((p) => p.y === H)).toHaveLength(1);
				expect(points[points.length - 1]!.y).toBeCloseTo(2 * H - R, 9);
			}
		}
	});
});

describe('a cut that cannot be cut', () => {
	/** The classic heart with one left-lobe cut ending 20 px short of the fold. */
	function shortened(): HeartDesign {
		const design = loadHeart('classic-3x3');
		const template = getTemplateData(design, 'left');
		const foldX = template.overlapLeft;
		const fingers = design.fingers.map((finger) => ({
			...finger,
			segments: finger.segments.map((seg) => ({ ...seg }))
		}));
		// The left lobe's fold is the overlap's left edge (x = rect.left).
		const target = fingers.find(
			(f) =>
				f.lobe === 'left' &&
				f.segments.length &&
				Math.abs(f.segments[f.segments.length - 1]!.p3.x - foldX) < 1e-6 &&
				Math.abs(f.segments[0]!.p0.y - template.overlapTop) > 1
		)!;
		const last = target.segments[target.segments.length - 1]!;
		last.p3 = { x: last.p3.x + 20, y: last.p3.y };
		return { ...design, fingers };
	}

	it('throws a LaserExportError', () => {
		expect(() => unfoldPiece(shortened(), 'left', WIDTH)).toThrow(LaserExportError);
	});
});
