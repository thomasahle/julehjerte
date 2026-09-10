import { describe, expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import catalog from '$lib/data/heart-designs.json';
import type { HeartDesign } from '$lib/types/heart';
import { reverseSegments, splitBezierAt } from '$lib/geometry/bezierSegments';
import { heartPaintPaths } from './heartPaint';
import { computeWeaveData } from './svgWeave';
import { renderHeartSvgMarkup } from './heartSvg';

const classic = catalog['classic-3x3'] as HeartDesign;
const weaveOf = (d: HeartDesign) => computeWeaveData(d.fingers, d.gridSize, d.weaveParity ?? 0);
const paintOf = (d: HeartDesign) => heartPaintPaths(d.fingers, weaveOf(d));

function overlapPixels(d: HeartDesign, joined: boolean) {
	const weave = weaveOf(d), o = weave.overlap;
	const path = joined ? paintOf(d).right : [...weave.rightOnTopStrips, ...weave.leftOnTopStrips].map(s => s.pathData).join(' ');
	return new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o.left} ${o.top} ${o.width} ${o.height}"><rect x="${o.left}" y="${o.top}" width="${o.width}" height="${o.height}" fill="white"/><path d="${path}" fill="black" fill-rule="evenodd"/></svg>`, { fitTo: { mode: 'width', value: 384 } }).render().pixels;
}

function expectSameWeave(d: HeartDesign) {
	expect(paintOf(d).joined).toBe(!['amy-pattern', 'triple-heart'].includes(d.id));
	const before = overlapPixels(d, false), after = overlapPixels(d, true);
	const height = before.length / 4 / 384;
	let difference = 0, stablePixelDrift = 0;
	for (let i = 0; i < before.length; i += 4) {
		const delta = Math.abs(before[i]! - after[i]!);
		difference += delta;
		if (delta <= 1) continue;
		const x = (i / 4) % 384, y = Math.floor(i / 4 / 384);
		if (x === 0 || y === 0 || x === 383 || y === height - 1) continue;
		let uniform = before[i] === 0 || before[i] === 255;
		for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
			if (before[i + 4 * (dy * 384 + dx)] !== before[i]) uniform = false;
		}
		if (uniform) stablePixelDrift = Math.max(stablePixelDrift, delta);
	}
	// Extending the path's bounds changes resvg's curve tessellation slightly.
	// Permit subpixel edge antialiasing, but no drift in uniform regions; also
	// bound total coverage change to 0.05% of the overlap, including its border.
	expect(stablePixelDrift).toBe(0);
	expect(difference / (255 * before.length / 4)).toBeLessThan(0.0005);
}

describe('continuous lobe and weave fills', () => {
	for (const [id, raw] of Object.entries(catalog)) {
		it(`preserves both weave phases of ${id}`, () => {
			for (const weaveParity of [0, 1] as const) expectSameWeave({ ...raw, weaveParity } as HeartDesign);
		});
	}

	it('handles reversed, subdivided boundaries and rectangular overlaps without changing cuts', () => {
		const d = structuredClone(classic);
		for (const finger of d.fingers) {
			finger.segments = reverseSegments(finger.segments.flatMap(s => splitBezierAt(s, 0.37)));
			finger.segments = finger.segments.map(s => {
				const scale = (p: { x: number; y: number }) => ({ x: 300 + (p.x - 300) * 0.7, y: p.y });
				return { p0: scale(s.p0), p1: scale(s.p1), p2: scale(s.p2), p3: scale(s.p3) };
			});
		}
		const original = JSON.stringify(d);
		expectSameWeave(d);
		expect(JSON.stringify(d)).toBe(original);
	});

	it('keeps clipping when an unfinished curve leaves the overlap', () => {
		const d = structuredClone(classic), o = weaveOf(d).overlap;
		d.fingers[0]!.segments[0]!.p1.y = o.top - 100;
		expect(paintOf(d).joined).toBe(false);
		expect(renderHeartSvgMarkup(d, { left: 'white', right: 'red' })).toContain('clip-path=');
	});

	it('preserves the weave if the top boundary is curved or missing', () => {
		const d = structuredClone(classic), o = weaveOf(d).overlap;
		const top = d.fingers.find(f => f.lobe === 'left' && f.segments[0]!.p0.y === o.top)!;
		top.segments[0]!.p1.y += 1;
		expectSameWeave(d);
		d.fingers = d.fingers.filter(f => f !== top);
		expectSameWeave(d);
	});

	it('uses the joined contour in exported previews, with an optional outline', () => {
		const d = structuredClone(classic), paint = paintOf(d);
		const svg = renderHeartSvgMarkup(d, { left: '#ffff00', right: '#003366' }, { outline: { color: '#123456' } });
		expect(svg).toContain(`d="${paint.right}" fill="#003366" fill-rule="evenodd"`);
		expect(svg).not.toContain('clip-path=');
		expect(svg).toContain('stroke="#123456"');
	});
});
