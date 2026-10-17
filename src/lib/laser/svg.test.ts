import { describe, expect, it } from 'vitest';
import { SHEETS } from './sheet';
import { planLaserSheet } from './export';
import { serializeLaserSvg } from './svg';
import { loadHeart } from './testHearts';

function parse(text: string): Document {
	const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
	expect(doc.querySelector('parsererror')).toBeNull();
	return doc;
}

const classic = loadHeart('classic-3x3');
const options = { title: 'Klassisk', description: 'https://juleflet.dk/hjerte/classic-3x3/ · 80 mm' };

describe('serializeLaserSvg', () => {
	const plan = planLaserSheet(classic, { widthMm: 80, count: 2, sheet: SHEETS.A4, lobe: 'left' });

	it('is in millimetres: one user unit per mm', () => {
		const svg = parse(serializeLaserSvg(plan, options)).documentElement;
		expect(svg.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
		expect(svg.getAttribute('width')).toBe('210mm');
		expect(svg.getAttribute('height')).toBe('297mm');
		expect(svg.getAttribute('viewBox')).toBe('0 0 210 297');
		expect(svg.querySelector('title')!.textContent).toBe('Klassisk');
		expect(svg.querySelector('desc')!.textContent).toContain('juleflet.dk');
	});

	it('puts every outline and cut in the red hairline group, and nothing else', () => {
		const doc = parse(serializeLaserSvg(plan, options));
		const cut = doc.getElementById('cut')!;
		expect(cut.getAttribute('stroke')).toBe('#ff0000');
		expect(cut.getAttribute('stroke-width')).toBe('0.01');
		expect(cut.getAttribute('fill')).toBe('none');
		// Two pieces, each an outline and two cuts.
		expect(cut.querySelectorAll('path')).toHaveLength(6);
		expect(doc.getElementById('score')).toBeNull();
		expect(doc.querySelectorAll('text, rect, [transform]')).toHaveLength(0);
		expect([...doc.querySelectorAll('[fill]')].every((el) => el.getAttribute('fill') === 'none')).toBe(true);
	});

	it('draws nothing on the fold: the file is cut lines only', () => {
		const doc = parse(serializeLaserSvg(plan, options));
		expect(doc.querySelectorAll('g')).toHaveLength(1);
		// The first piece sits at the 5 mm margin, so its fold would be at 5 + 3·80/2.
		const ds = [...doc.querySelectorAll('path')].map((p) => p.getAttribute('d'));
		expect(ds).not.toContain('M 5 125 L 85 125');
		expect(ds.some((d) => /^M [\d.]+ 125 L [\d.]+ 125$/.test(d!))).toBe(false);
	});

	it('bakes the offsets in, at three decimals, and never repeats a path', () => {
		const doc = parse(serializeLaserSvg(planLaserSheet(loadHeart('stjerne'), { widthMm: 70, count: 6, sheet: SHEETS.A3, lobe: 'left' }), options));
		const ds = [...doc.querySelectorAll('path')].map((p) => p.getAttribute('d')!);
		expect(new Set(ds).size).toBe(ds.length);
		for (const d of ds) {
			for (const n of d.match(/-?\d+(\.\d+)?/g)!) expect(n.split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
		}
		expect(ds[0]).toMatch(/^M 5 40 A 35 35 0 0 1 75 40 L 75 180 A 35 35 0 0 1 5 180 Z$/);
	});

	it('draws a preview with classes and no laser colours', () => {
		const doc = parse(serializeLaserSvg(plan, { ...options, look: 'preview' }));
		expect(doc.documentElement.getAttribute('width')).toBeNull();
		expect(doc.querySelector('rect.sheet')).not.toBeNull();
		expect(doc.querySelector('g.cut')!.getAttribute('stroke')).toBeNull();
		expect(doc.querySelectorAll('g')).toHaveLength(1);
	});
});
