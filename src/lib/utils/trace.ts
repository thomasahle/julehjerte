/**
 * The arithmetic behind "Tegn af fra skærmen" — docs/redesign/TRACE.md.
 *
 * TraceMode.svelte draws one lobe's template on a white screen so a visitor can
 * trace it through thin paper. Everything that decides *where* and *how big*
 * lives here, as plain functions over numbers, so it can be tested without a
 * DOM: fitting the template to the screen, keeping it on screen while it is
 * dragged and pinched, converting between CSS pixels and millimetres, the
 * credit-card calibration, the remembered settings, and the two-second hold
 * that unlocks the screen.
 *
 * Coordinates: a template is drawn in its own units (`templateWidth` ×
 * `templateHeight` from getTemplateData) and placed by one transform
 * `translate(x, y) scale(s)`, so `s` is CSS px per template unit and (x, y) is
 * the template's top-left corner in CSS px from the viewport's top-left.
 */

/** Narrowest and widest template the slider offers, in millimetres. */
export const MIN_WIDTH_MM = 30;
export const MAX_WIDTH_MM = 200;

/**
 * What a CSS pixel measures until the visitor calibrates. CSS defines 96 px to
 * the inch, but no phone or tablet honours that physically, which is why the
 * readout says "ca." until a card has been measured.
 */
export const DEFAULT_PX_PER_MM = 96 / 25.4;

/** ISO/IEC 7810 ID-1, the size of every payment card. */
export const CARD_WIDTH_MM = 85.6;
export const CARD_HEIGHT_MM = 53.98;
export const CARD_CORNER_MM = 3.18;

/**
 * Plausible CSS px per mm for a real screen. The densest phones come out near
 * 7 and old desktop monitors near 3; anything far outside is a corrupt stored
 * value, not a screen, and is ignored.
 */
export const MIN_PX_PER_MM = 1.5;
export const MAX_PX_PER_MM = 12;

/** How much of the template must stay on screen, so it can always be grabbed back. */
export const MIN_VISIBLE_PX = 40;

/** "Tilpas" fills this share of the free area, leaving a margin to grab. */
export const FIT_FRACTION = 0.9;

/** How long the unlock button has to be held. */
export const HOLD_MS = 2000;

export const STORAGE_KEY = 'juleflet:trace';

export interface TraceView {
	x: number;
	y: number;
	s: number;
}

export interface Size {
	width: number;
	height: number;
}

/** A rectangle in CSS px, e.g. the part of the viewport below the toolbar. */
export interface Area {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface Point {
	x: number;
	y: number;
}

/** Template width in mm at scale `s`. */
export function widthMmFromScale(templateWidth: number, s: number, pxPerMm: number): number {
	return (templateWidth * s) / pxPerMm;
}

/** The scale at which the template is `widthMm` wide. */
export function scaleFromWidthMm(templateWidth: number, widthMm: number, pxPerMm: number): number {
	return (widthMm * pxPerMm) / templateWidth;
}

export function clampWidthMm(widthMm: number): number {
	return Math.min(MAX_WIDTH_MM, Math.max(MIN_WIDTH_MM, widthMm));
}

/** `s`, held to the 30–200 mm range of template widths. */
export function clampScale(s: number, templateWidth: number, pxPerMm: number): number {
	const min = scaleFromWidthMm(templateWidth, MIN_WIDTH_MM, pxPerMm);
	const max = scaleFromWidthMm(templateWidth, MAX_WIDTH_MM, pxPerMm);
	return Math.min(max, Math.max(min, s));
}

/**
 * Keep at least MIN_VISIBLE_PX of the template inside the viewport on both
 * axes, so a fling cannot lose it off the edge. A template smaller than that
 * margin only has to stay wholly on screen.
 */
export function clampPosition(view: TraceView, template: Size, viewport: Size): TraceView {
	const w = template.width * view.s;
	const h = template.height * view.s;
	const keepX = Math.min(MIN_VISIBLE_PX, w);
	const keepY = Math.min(MIN_VISIBLE_PX, h);
	return {
		s: view.s,
		x: Math.min(viewport.width - keepX, Math.max(keepX - w, view.x)),
		y: Math.min(viewport.height - keepY, Math.max(keepY - h, view.y))
	};
}

/** Scale first, then position — every gesture ends here. */
export function clampView(view: TraceView, template: Size, viewport: Size, pxPerMm: number): TraceView {
	const s = clampScale(view.s, template.width, pxPerMm);
	return clampPosition({ ...view, s }, template, viewport);
}

/**
 * "Tilpas": the largest scale that fits the template into FIT_FRACTION of
 * `area`, centred in it — then held to the mm range, so a huge tablet does not
 * offer a template wider than the slider can show.
 */
export function fitView(template: Size, area: Area, viewport: Size, pxPerMm: number): TraceView {
	const raw = Math.min(
		(area.width * FIT_FRACTION) / template.width,
		(area.height * FIT_FRACTION) / template.height
	);
	const s = clampScale(raw, template.width, pxPerMm);
	return clampPosition(centreIn(template, s, area), template, viewport);
}

/** The template at scale `s`, centred in `area`. */
export function centreIn(template: Size, s: number, area: Area): TraceView {
	return {
		s,
		x: area.left + (area.width - template.width * s) / 2,
		y: area.top + (area.height - template.height * s) / 2
	};
}

/**
 * Change the scale to `s` while the point at `about` (in CSS px) stays put —
 * the wheel zooms about the cursor and the slider about the template's centre.
 */
export function scaleAbout(
	view: TraceView,
	s: number,
	about: Point,
	template: Size,
	viewport: Size,
	pxPerMm: number
): TraceView {
	const next = clampScale(s, template.width, pxPerMm);
	const k = next / view.s;
	return clampPosition(
		{ s: next, x: about.x - (about.x - view.x) * k, y: about.y - (about.y - view.y) * k },
		template,
		viewport
	);
}

/** The template's centre in CSS px. */
export function viewCentre(view: TraceView, template: Size): Point {
	return { x: view.x + (template.width * view.s) / 2, y: view.y + (template.height * view.s) / 2 };
}

/** One finger (or the mouse) moved from `from` to `to` since the gesture began at `start`. */
export function dragView(
	start: TraceView,
	from: Point,
	to: Point,
	template: Size,
	viewport: Size
): TraceView {
	return clampPosition(
		{ s: start.s, x: start.x + to.x - from.x, y: start.y + to.y - from.y },
		template,
		viewport
	);
}

/**
 * Two fingers: the scale follows the change in their distance and the template
 * point that was under their midpoint follows the midpoint, so pinching and
 * moving at once both work. Always computed from the gesture's start, never
 * incrementally, so rounding cannot drift.
 */
export function pinchView(
	start: TraceView,
	from: [Point, Point],
	to: [Point, Point],
	template: Size,
	viewport: Size,
	pxPerMm: number
): TraceView {
	const d0 = distance(from[0], from[1]);
	const d1 = distance(to[0], to[1]);
	const ratio = d0 > 0 ? d1 / d0 : 1;
	const s = clampScale(start.s * ratio, template.width, pxPerMm);
	const k = s / start.s;
	const m0 = midpoint(from[0], from[1]);
	const m1 = midpoint(to[0], to[1]);
	return clampPosition(
		{ s, x: m1.x - (m0.x - start.x) * k, y: m1.y - (m0.y - start.y) * k },
		template,
		viewport
	);
}

function distance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** The wheel's zoom factor for one event: a notch of 100 px is about 20 %. */
export function wheelFactor(deltaY: number): number {
	return Math.exp(-deltaY * 0.002);
}

/**
 * Calibration: the visitor sizes an outline until it matches a real card, so
 * the outline's long side in CSS px is 85.6 mm on this screen.
 */
export function pxPerMmFromCard(cardWidthPx: number): number {
	return cardWidthPx / CARD_WIDTH_MM;
}

export function cardWidthPx(pxPerMm: number): number {
	return CARD_WIDTH_MM * pxPerMm;
}

/** The card slider's range in CSS px, matching the plausible px-per-mm range. */
export const MIN_CARD_PX = Math.round(cardWidthPx(MIN_PX_PER_MM));
export const MAX_CARD_PX = Math.round(cardWidthPx(MAX_PX_PER_MM));

/**
 * What is remembered between visits. `pxPerMm` is absent until the visitor has
 * calibrated, which is how the readout knows to say "ca.".
 */
export interface TraceSettings {
	pxPerMm?: number;
	widthMm?: number;
}

/** Anything unreadable or out of range is dropped field by field, never thrown. */
export function parseTraceSettings(raw: string | null | undefined): TraceSettings {
	if (!raw) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (typeof parsed !== 'object' || parsed === null) return {};
	const { pxPerMm, widthMm } = parsed as Record<string, unknown>;
	const settings: TraceSettings = {};
	if (isFiniteNumber(pxPerMm) && pxPerMm >= MIN_PX_PER_MM && pxPerMm <= MAX_PX_PER_MM) {
		settings.pxPerMm = pxPerMm;
	}
	if (isFiniteNumber(widthMm)) settings.widthMm = clampWidthMm(widthMm);
	return settings;
}

export function serializeTraceSettings(settings: TraceSettings): string {
	const out: TraceSettings = {};
	if (settings.pxPerMm !== undefined) out.pxPerMm = settings.pxPerMm;
	if (settings.widthMm !== undefined) out.widthMm = Math.round(clampWidthMm(settings.widthMm));
	return JSON.stringify(out);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

/** Both are settings the visitor chose, so no consent question; blocked storage just forgets. */
export function loadTraceSettings(): TraceSettings {
	try {
		return parseTraceSettings(window.localStorage.getItem(STORAGE_KEY));
	} catch {
		return {};
	}
}

export function saveTraceSettings(settings: TraceSettings): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, serializeTraceSettings(settings));
	} catch {
		// Storage full or blocked: the next visit starts from "Tilpas" again.
	}
}

/**
 * The unlock button's hold, as a state machine over timestamps: the component
 * feeds it pointer events and a timer and asks whether it is done. A short tap
 * — or paper brushing the corner — never gets there.
 */
export type HoldState = { phase: 'idle' } | { phase: 'holding'; since: number } | { phase: 'done' };

export const HOLD_IDLE: HoldState = { phase: 'idle' };

/** A second finger, or a key's auto-repeat, does not restart a hold in progress. */
export function holdStart(state: HoldState, now: number): HoldState {
	return state.phase === 'holding' ? state : { phase: 'holding', since: now };
}

export function holdCancel(state: HoldState): HoldState {
	return state.phase === 'holding' ? HOLD_IDLE : state;
}

/** Advance the clock: a hold that has lasted `duration` is done. */
export function holdTick(state: HoldState, now: number, duration = HOLD_MS): HoldState {
	if (state.phase !== 'holding') return state;
	return now - state.since >= duration ? { phase: 'done' } : state;
}

/** 0 → 1 over the hold, for the progress ring. */
export function holdProgress(state: HoldState, now: number, duration = HOLD_MS): number {
	if (state.phase === 'done') return 1;
	if (state.phase === 'idle') return 0;
	return Math.min(1, Math.max(0, (now - state.since) / duration));
}
