/**
 * From a heart and the dialog's settings to a laid-out sheet and a file —
 * docs/redesign/LASER.md. The dialog (LaserDialog.svelte) only holds the
 * settings and hands them here, so everything it shows can be tested without it.
 */
import type { HeartDesign } from '$lib/types/heart';
import { lobesShareTemplate } from '$lib/utils/symmetry';
import { serializeLaserDxf } from './dxf';
import { layoutSheet, type LaserSheet, type SheetSize } from './sheet';
import { serializeLaserSvg } from './svg';
import { unfoldPiece, type UnfoldedPiece } from './unfold';

export type LaserFormat = 'svg' | 'dxf';

export const LASER_FORMATS: readonly LaserFormat[] = ['svg', 'dxf'];

export const LASER_MIME: Record<LaserFormat, string> = {
	svg: 'image/svg+xml',
	dxf: 'application/dxf'
};

export const MIN_WIDTH_MM = 40;
export const MAX_WIDTH_MM = 200;
export const WIDTH_STEP_MM = 5;
export const DEFAULT_WIDTH_MM = 80;
export const MIN_HEARTS = 1;
export const MAX_HEARTS = 20;

/** Smallest and largest custom sheet: a beer mat, and a big laser bed. */
export const MIN_SHEET_MM = 50;
export const MAX_SHEET_MM = 2000;

export interface LaserRequest {
	widthMm: number;
	hearts: number;
	sheet: SheetSize;
}

export interface LaserPlan extends LaserSheet {
	/** The two pieces of one heart, left lobe first. */
	pair: [UnfoldedPiece, UnfoldedPiece];
	heartsRequested: number;
	/** Whole hearts on the sheet; a lone left piece without its right is left off. */
	heartsFit: number;
}

export function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}

/**
 * The pieces for `hearts` hearts, laid out on the sheet. A heart whose lobes
 * share a template (`lobesShareTemplate`) is cut as two copies of the left
 * piece, as the PDF prints one template for both.
 */
export function planLaserSheet(design: HeartDesign, request: LaserRequest): LaserPlan {
	const left = unfoldPiece(design, 'left', request.widthMm);
	const right = lobesShareTemplate(design.fingers, design.gridSize)
		? left
		: unfoldPiece(design, 'right', request.widthMm);
	const wanted: UnfoldedPiece[] = [];
	for (let i = 0; i < request.hearts; i++) wanted.push(left, right);

	const layout = layoutSheet(wanted, { sheet: request.sheet });
	const heartsFit = Math.floor(layout.fitted / 2);
	return {
		sheet: request.sheet,
		pieces: layout.placements.slice(0, heartsFit * 2).map(({ index, x, y }) => ({ piece: wanted[index]!, x, y })),
		pair: [left, right],
		heartsRequested: request.hearts,
		heartsFit
	};
}

export interface LaserFileInfo {
	heartId: string;
	heartName: string;
	/** The heart's page, for the SVG's `<desc>`. */
	url: string;
	widthMm: number;
	scoreFold: boolean;
}

/** The file's text, in the chosen format. */
export function laserFileContent(plan: LaserSheet, format: LaserFormat, info: LaserFileInfo): string {
	if (format === 'dxf') return serializeLaserDxf(plan, { scoreFold: info.scoreFold });
	return serializeLaserSvg(plan, {
		scoreFold: info.scoreFold,
		title: info.heartName,
		description: `${info.url} · ${info.widthMm} mm`
	});
}

/** `{heart id}-laser-{width}mm.{svg|dxf}`, with anything unsafe in a file name dashed out. */
export function laserFileName(heartId: string, widthMm: number, format: LaserFormat): string {
	const id = heartId.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'juleflet';
	return `${id}-laser-${widthMm}mm.${format}`;
}

// ---- Remembered settings ----------------------------------------------------

export const LASER_STORAGE_KEY = 'juleflet:laser';

export interface LaserSettings {
	format: LaserFormat;
	widthMm: number;
}

export const DEFAULT_LASER_SETTINGS: LaserSettings = { format: 'svg', widthMm: DEFAULT_WIDTH_MM };

/** Whatever is stored, as settings; anything unreadable is the default. */
export function parseLaserSettings(raw: string | null): LaserSettings {
	try {
		const value = raw ? (JSON.parse(raw) as Partial<LaserSettings>) : {};
		const format = LASER_FORMATS.includes(value.format as LaserFormat)
			? (value.format as LaserFormat)
			: DEFAULT_LASER_SETTINGS.format;
		const widthMm =
			typeof value.widthMm === 'number' && Number.isFinite(value.widthMm)
				? clamp(value.widthMm, MIN_WIDTH_MM, MAX_WIDTH_MM)
				: DEFAULT_LASER_SETTINGS.widthMm;
		return { format, widthMm };
	} catch {
		return { ...DEFAULT_LASER_SETTINGS };
	}
}

export function loadLaserSettings(): LaserSettings {
	try {
		return parseLaserSettings(window.localStorage.getItem(LASER_STORAGE_KEY));
	} catch {
		return { ...DEFAULT_LASER_SETTINGS };
	}
}

export function saveLaserSettings(settings: LaserSettings): void {
	try {
		window.localStorage.setItem(LASER_STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// Blocked or full: the next visit starts from the defaults again.
	}
}
