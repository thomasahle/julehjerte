import { describe, expect, it } from 'vitest';
import { crossing, finished, prepare, rows, trace } from './drawings';
import { flatten } from './sketch';
import { translations } from '$lib/i18n';

const all = {
	'prepare 1': prepare(1),
	'prepare 2': prepare(2),
	'prepare 3': prepare(3),
	'prepare 4': prepare(4),
	'trace 1': trace(1),
	'trace 2': trace(2),
	'trace 3': trace(3),
	'trace 4': trace(4),
	'crossing red': crossing('red'),
	'crossing white': crossing('white'),
	'rows 1': rows(1),
	'rows 2': rows(2),
	'rows 3': rows(3),
	finished: finished()
};

describe('guide drawings', () => {
	for (const [name, drawing] of Object.entries(all)) {
		it(`${name} is drawn with whole numbers of ink`, () => {
			expect(drawing.shapes.length).toBeGreaterThan(4);
			for (const shape of drawing.shapes) {
				expect(shape.d).toMatch(/^M[-\d. MLZ]+$/);
				expect(shape.d).not.toMatch(/NaN|Infinity/);
			}
			for (const label of drawing.labels) {
				expect(Number.isFinite(label.x) && Number.isFinite(label.y)).toBe(true);
				if (label.key) expect(translations.da).toHaveProperty(label.text);
			}
		});
	}

	it('fits every drawing but the close-ups inside its frame', () => {
		for (const [name, drawing] of Object.entries(all)) {
			if (name.startsWith('crossing')) continue;
			const points = drawing.shapes.flatMap((shape) => flatten(shape.d, 1000).flatMap((line) => line.points));
			for (const [x, y] of points) {
				expect(x, name).toBeGreaterThanOrEqual(0);
				expect(x, name).toBeLessThanOrEqual(drawing.width);
				expect(y, name).toBeGreaterThanOrEqual(0);
				expect(y, name).toBeLessThanOrEqual(drawing.height);
			}
		}
	});

	it('turns a button\'s text with its button, and leaves the notes level', () => {
		const labels = Object.values(all).flatMap((drawing) => drawing.labels);
		for (const label of labels) {
			if (label.tone === 'button') expect(Math.abs(label.turn)).toBeGreaterThan(1);
			else expect(label.turn).toBe(0);
		}
		expect(labels.some((label) => label.tone === 'button')).toBe(true);
	});

	it('shows the template on the paper while the inner lines are cut', () => {
		expect(prepare(4).shapes.map((shape) => shape.fill)).toContain('white');
		expect(trace(4).shapes.map((shape) => shape.fill)).toContain('sheer');
	});

	it('keeps the heart in the same place through the three rows', () => {
		// The red half's round end is drawn second in each.
		const cap = [1, 2, 3].map((row) => rows(row).shapes[1].d);
		expect(cap[1]).toBe(cap[0]);
		expect(cap[2]).toBe(cap[0]);
	});

	it('is small enough to send with the page', () => {
		const bytes = Object.values(all).reduce((sum, drawing) => sum + drawing.shapes.reduce((n, shape) => n + shape.d.length, 0), 0);
		expect(bytes).toBeLessThan(70_000);
	});
});
