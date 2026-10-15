import { describe, expect, it } from 'vitest';
import {
	CARD_WIDTH_MM,
	DEFAULT_PX_PER_MM,
	HOLD_IDLE,
	HOLD_MS,
	MAX_WIDTH_MM,
	MIN_VISIBLE_PX,
	MIN_WIDTH_MM,
	cardWidthPx,
	clampPosition,
	clampScale,
	clampView,
	dragView,
	fitView,
	holdCancel,
	holdProgress,
	holdStart,
	holdTick,
	parseTraceSettings,
	pinchView,
	pxPerMmFromCard,
	scaleAbout,
	scaleFromWidthMm,
	serializeTraceSettings,
	widthMmFromScale,
	type HoldState
} from './trace';

// A template 100 × 150 units, on a 1000 × 800 CSS px screen.
const template = { width: 100, height: 150 };
const viewport = { width: 1000, height: 800 };
const whole = { left: 0, top: 0, ...viewport };
const pxPerMm = 4;

describe('mm and px', () => {
	it('converts both ways', () => {
		expect(widthMmFromScale(100, 2, 4)).toBe(50);
		expect(scaleFromWidthMm(100, 50, 4)).toBe(2);
		const s = scaleFromWidthMm(120, 73, DEFAULT_PX_PER_MM);
		expect(widthMmFromScale(120, s, DEFAULT_PX_PER_MM)).toBeCloseTo(73);
	});

	it('assumes 96 CSS px to the inch until calibrated', () => {
		expect(DEFAULT_PX_PER_MM * 25.4).toBeCloseTo(96);
	});
});

describe('fitView', () => {
	it('fills 90 % of the area on the tighter axis and centres the template', () => {
		// Height is the limit: 0.9 * 800 / 150 = 4.8 → 120 mm at 4 px/mm, in range.
		const view = fitView(template, whole, viewport, pxPerMm);
		expect(view.s).toBeCloseTo(4.8);
		expect(view.y).toBeCloseTo((800 - 150 * 4.8) / 2);
		expect(view.x).toBeCloseTo((1000 - 100 * 4.8) / 2);
	});

	it('fits below the toolbar when given the free area', () => {
		const view = fitView(template, { left: 0, top: 100, width: 1000, height: 700 }, viewport, pxPerMm);
		expect(view.s).toBeCloseTo((0.9 * 700) / 150);
		expect(view.y).toBeCloseTo(100 + (700 - 150 * view.s) / 2);
	});

	it('never offers a template wider than the slider goes', () => {
		const big = { width: 4000, height: 3000 };
		const view = fitView(template, { left: 0, top: 0, ...big }, big, pxPerMm);
		expect(widthMmFromScale(template.width, view.s, pxPerMm)).toBeCloseTo(MAX_WIDTH_MM);
	});
});

describe('clamping', () => {
	it('holds the scale to 30–200 mm', () => {
		expect(widthMmFromScale(100, clampScale(0.01, 100, pxPerMm), pxPerMm)).toBeCloseTo(MIN_WIDTH_MM);
		expect(widthMmFromScale(100, clampScale(99, 100, pxPerMm), pxPerMm)).toBeCloseTo(MAX_WIDTH_MM);
		expect(clampScale(3, 100, pxPerMm)).toBe(3);
	});

	it(`keeps ${MIN_VISIBLE_PX} px of the template on screen`, () => {
		const s = 2; // 200 × 300 px
		const left = clampPosition({ x: -5000, y: -5000, s }, template, viewport);
		expect(left.x + 200).toBe(MIN_VISIBLE_PX);
		expect(left.y + 300).toBe(MIN_VISIBLE_PX);
		const right = clampPosition({ x: 5000, y: 5000, s }, template, viewport);
		expect(right.x).toBe(viewport.width - MIN_VISIBLE_PX);
		expect(right.y).toBe(viewport.height - MIN_VISIBLE_PX);
		const inside = clampPosition({ x: 10, y: 20, s }, template, viewport);
		expect(inside).toEqual({ x: 10, y: 20, s });
	});

	it('clamps scale before position', () => {
		const view = clampView({ x: 5000, y: 0, s: 100 }, template, viewport, pxPerMm);
		expect(widthMmFromScale(100, view.s, pxPerMm)).toBeCloseTo(MAX_WIDTH_MM);
		expect(view.x).toBe(viewport.width - MIN_VISIBLE_PX);
	});
});

describe('gestures', () => {
	const start = { x: 100, y: 100, s: 2 };

	it('drags by the pointer delta', () => {
		expect(dragView(start, { x: 0, y: 0 }, { x: 30, y: -20 }, template, viewport)).toEqual({
			x: 130,
			y: 80,
			s: 2
		});
	});

	it('pinches about the fingers’ midpoint', () => {
		// Fingers 100 px apart around (200, 200), spread to 200 px apart: double.
		const view = pinchView(
			start,
			[{ x: 150, y: 200 }, { x: 250, y: 200 }],
			[{ x: 100, y: 200 }, { x: 300, y: 200 }],
			template,
			viewport,
			pxPerMm
		);
		expect(view.s).toBeCloseTo(4);
		// The template point under (200, 200) stays there: (200-100)/2 = 50 units in.
		expect(view.x + 50 * view.s).toBeCloseTo(200);
		expect(view.y + 50 * view.s).toBeCloseTo(200);
	});

	it('moves with the midpoint when the distance holds', () => {
		const view = pinchView(
			start,
			[{ x: 0, y: 0 }, { x: 100, y: 0 }],
			[{ x: 10, y: 40 }, { x: 110, y: 40 }],
			template,
			viewport,
			pxPerMm
		);
		expect(view).toEqual({ x: 110, y: 140, s: 2 });
	});

	it('keeps a pinch inside the mm range', () => {
		const view = pinchView(
			start,
			[{ x: 0, y: 0 }, { x: 10, y: 0 }],
			[{ x: 0, y: 0 }, { x: 1000, y: 0 }],
			template,
			viewport,
			pxPerMm
		);
		expect(widthMmFromScale(100, view.s, pxPerMm)).toBeCloseTo(MAX_WIDTH_MM);
	});

	it('zooms about a fixed point', () => {
		const view = scaleAbout(start, 3, { x: 150, y: 175 }, template, viewport, pxPerMm);
		expect(view.s).toBe(3);
		// (150-100)/2 = 25 units, (175-100)/2 = 37.5 units: still under the point.
		expect(view.x + 25 * 3).toBeCloseTo(150);
		expect(view.y + 37.5 * 3).toBeCloseTo(175);
	});
});

describe('calibration', () => {
	it('reads px per mm off the card outline', () => {
		expect(pxPerMmFromCard(CARD_WIDTH_MM * 6)).toBeCloseTo(6);
		expect(cardWidthPx(6)).toBeCloseTo(513.6);
	});

	it('keeps the template’s mm width across a calibration', () => {
		const before = scaleFromWidthMm(100, 80, DEFAULT_PX_PER_MM);
		const mm = widthMmFromScale(100, before, DEFAULT_PX_PER_MM);
		const after = scaleFromWidthMm(100, mm, pxPerMmFromCard(500));
		expect(widthMmFromScale(100, after, pxPerMmFromCard(500))).toBeCloseTo(80);
		expect(after * 100).toBeCloseTo((80 * 500) / CARD_WIDTH_MM);
	});
});

describe('settings', () => {
	it('round-trips', () => {
		const raw = serializeTraceSettings({ pxPerMm: 5.5, widthMm: 90 });
		expect(JSON.parse(raw)).toEqual({ pxPerMm: 5.5, widthMm: 90 });
		expect(parseTraceSettings(raw)).toEqual({ pxPerMm: 5.5, widthMm: 90 });
	});

	it('leaves pxPerMm out until calibrated, and rounds the width', () => {
		expect(JSON.parse(serializeTraceSettings({ widthMm: 87.4 }))).toEqual({ widthMm: 87 });
	});

	it.each([null, undefined, '', 'not json', '42', 'null', '[]', '"x"'])('ignores %j', (raw) => {
		expect(parseTraceSettings(raw)).toEqual({});
	});

	it('drops bad fields one by one', () => {
		expect(parseTraceSettings('{"pxPerMm":"5","widthMm":80}')).toEqual({ widthMm: 80 });
		expect(parseTraceSettings('{"pxPerMm":0.1,"widthMm":null}')).toEqual({});
		expect(parseTraceSettings('{"pxPerMm":1e9}')).toEqual({});
		expect(parseTraceSettings('{"pxPerMm":5,"widthMm":"wide"}')).toEqual({ pxPerMm: 5 });
	});

	it('clamps a stored width into the slider’s range', () => {
		expect(parseTraceSettings('{"widthMm":5}')).toEqual({ widthMm: MIN_WIDTH_MM });
		expect(parseTraceSettings('{"widthMm":900}')).toEqual({ widthMm: MAX_WIDTH_MM });
	});
});

describe('the unlock hold', () => {
	it('completes after HOLD_MS of continuous hold', () => {
		let state: HoldState = holdStart(HOLD_IDLE, 1000);
		state = holdTick(state, 1000 + HOLD_MS - 1);
		expect(state.phase).toBe('holding');
		expect(holdProgress(state, 1000 + HOLD_MS / 2)).toBeCloseTo(0.5);
		state = holdTick(state, 1000 + HOLD_MS);
		expect(state).toEqual({ phase: 'done' });
		expect(holdProgress(state, 0)).toBe(1);
	});

	it('is reset by a cancel, so a second short tap starts from zero', () => {
		let state: HoldState = holdStart(HOLD_IDLE, 0);
		state = holdCancel(holdTick(state, 1500));
		expect(state).toEqual(HOLD_IDLE);
		expect(holdProgress(state, 1500)).toBe(0);
		state = holdStart(state, 1600);
		expect(holdTick(state, 1600 + HOLD_MS - 100).phase).toBe('holding');
		expect(holdTick(state, 1600 + HOLD_MS).phase).toBe('done');
	});

	it('is not restarted by a second finger or key repeat', () => {
		const first = holdStart(HOLD_IDLE, 0);
		expect(holdStart(first, 1900)).toBe(first);
		expect(holdTick(holdStart(first, 1900), HOLD_MS).phase).toBe('done');
	});

	it('ignores ticks and cancels when not holding', () => {
		expect(holdTick(HOLD_IDLE, 1e9)).toBe(HOLD_IDLE);
		expect(holdCancel({ phase: 'done' })).toEqual({ phase: 'done' });
	});
});
