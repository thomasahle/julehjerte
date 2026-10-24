import { describe, expect, it } from 'vitest';
import type { HeartDesign, Vec } from '$lib/types/heart';
import { normalizeHeartDesign } from '$lib/utils/heartDesign';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { maskMismatch } from './mask';
import { rasterizeDesign } from './rasterize';
import { mirrorLobe, readTemplateImage, type TemplatePixels } from './templateImage';

/** A 3×3 heart with one wavy and one straight cut in each lobe. */
const design = normalizeHeartDesign({
	id: 'test',
	name: 'Test',
	author: '',
	gridSize: { x: 3, y: 3 },
	fingers: [
		{ id: 'L1', lobe: 'left', pathData: 'M 100 30 C 70 18 40 48 0 36' },
		{ id: 'L2', lobe: 'left', pathData: 'M 100 66.7 L 0 66.7' },
		{ id: 'R1', lobe: 'right', pathData: 'M 33.3 100 L 33.3 0' },
		{ id: 'R2', lobe: 'right', pathData: 'M 70 100 C 58 70 82 40 64 0' }
	]
})!;

type Stroke = Vec[];

function cubicPoints(p0: Vec, p1: Vec, p2: Vec, p3: Vec, n = 24): Vec[] {
	const out: Vec[] = [];
	for (let i = 0; i <= n; i++) {
		const t = i / n;
		const u = 1 - t;
		out.push({
			x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
			y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
		});
	}
	return out;
}

function arc(c: Vec, r: number, from: number, to: number, n = 48): Vec[] {
	return Array.from({ length: n + 1 }, (_, i) => {
		const a = from + ((to - from) * i) / n;
		return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
	});
}

/** Black strokes, anti-aliased, on white paper. */
function draw(width: number, height: number, strokes: Stroke[], lineWidth: number): TemplatePixels {
	const ink = new Float32Array(width * height);
	const half = lineWidth / 2;
	for (const stroke of strokes) {
		for (let i = 0; i + 1 < stroke.length; i++) {
			const a = stroke[i];
			const b = stroke[i + 1];
			const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - half - 1));
			const x1 = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x) + half + 1));
			const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - half - 1));
			const y1 = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y) + half + 1));
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const len2 = dx * dx + dy * dy || 1;
			for (let y = y0; y <= y1; y++) {
				for (let x = x0; x <= x1; x++) {
					const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
					const d = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
					const v = Math.max(0, Math.min(1, half + 0.5 - d));
					if (v > ink[y * width + x]) ink[y * width + x] = v;
				}
			}
		}
	}
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		const v = 255 - Math.round(235 * ink[i]);
		data.set([v, v, v, 255], 4 * i);
	}
	return { width, height, data };
}

/**
 * The heart's template as flettedehjerter.dk draws it: the left lobe lying with
 * its ear to the left and the right lobe standing with its ear up, each as it
 * sits in the heart, side by side.
 */
function drawTemplate(d: HeartDesign, side: number): TemplatePixels {
	const rect = inferOverlapRect(d.fingers, d.gridSize);
	const k = side / rect.width;
	const margin = 12;
	const left = { x: margin + side / 2, y: margin + side / 2 };
	const right = { x: left.x + side + 0.2 * side, y: left.y };
	const strokes: Stroke[] = [];
	const square = (o: Vec): Stroke => [o, { x: o.x + side, y: o.y }, { x: o.x + side, y: o.y + side }, { x: o.x, y: o.y + side }, o];
	strokes.push(square(left), arc({ x: left.x, y: left.y + side / 2 }, side / 2, Math.PI / 2, (3 * Math.PI) / 2));
	strokes.push(square(right), arc({ x: right.x + side / 2, y: right.y }, side / 2, Math.PI, 2 * Math.PI));
	for (const f of d.fingers) {
		const o = f.lobe === 'left' ? left : right;
		const map = (p: Vec): Vec => ({ x: o.x + (p.x - rect.left) * k, y: o.y + (p.y - rect.top) * k });
		strokes.push(f.segments.flatMap((s) => cubicPoints(map(s.p0), map(s.p1), map(s.p2), map(s.p3))));
	}
	return draw(Math.ceil(right.x + side + margin), Math.ceil(left.y + side + margin), strokes, 1.6);
}

describe('readTemplateImage', () => {
	it('reads a drawn template back as the same heart', () => {
		const read = readTemplateImage(drawTemplate(design, 180));
		expect(read).not.toBeNull();
		expect(read!.layout).toBe('in-place');
		expect(read!.design.gridSize).toEqual({ x: 3, y: 3 });
		expect(read!.lobes.map((l) => l.lobe)).toEqual(['left', 'right']);
		expect(read!.confidence).toBeGreaterThan(0.5);
		const truth = rasterizeDesign(design, 200);
		const mine = rasterizeDesign(read!.design, 200);
		expect(maskMismatch(mine.data, truth.data)).toBeLessThan(0.015);
		// Turning a lobe over is a different heart, and the reader did not.
		expect(maskMismatch(rasterizeDesign(mirrorLobe(read!.design, 'left'), 200).data, truth.data)).toBeGreaterThan(0.03);
	});

	it('declines a picture that is not a template', () => {
		const box: Stroke = [
			{ x: 20, y: 20 },
			{ x: 200, y: 20 },
			{ x: 200, y: 140 },
			{ x: 20, y: 140 },
			{ x: 20, y: 20 }
		];
		const ring = arc({ x: 290, y: 80 }, 50, 0, 2 * Math.PI);
		expect(readTemplateImage(draw(360, 170, [box, ring, [{ x: 30, y: 80 }, { x: 190, y: 80 }]], 1.6))).toBeNull();
		expect(readTemplateImage({ width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4).fill(255) })).toBeNull();
	});
});
