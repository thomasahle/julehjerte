/**
 * From a heart and the dialog's settings to a laid-out sheet and a file —
 * docs/redesign/LASER.md. The dialog (DownloadDialog.svelte) only holds the
 * settings and hands them here, so everything it shows can be tested without it.
 */
import type { HeartDesign } from '$lib/types/heart';
import { lobesShareTemplate } from '$lib/utils/symmetry';
import { serializeLaserDxf } from './dxf';
import { layoutSheet, type LaserSheet, type SheetSize } from './sheet';
import { serializeLaserSvg } from './svg';
import { unfoldPiece, type UnfoldedPiece } from './unfold';
import type { TemplateLobe } from '$lib/utils/templateSvg';
import { slugify } from '$lib/utils/slug';

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
	/** Pieces wanted on the sheet: one per heart, since a sheet holds one lobe. */
	count: number;
	sheet: SheetSize;
	/**
	 * The lobe to cut. A heart's two halves are cut from two colours of paper,
	 * so one sheet (one colour) holds one lobe's pieces. Ignored for a heart
	 * whose lobes share a template: its pieces are all the left one.
	 */
	lobe: TemplateLobe;
}

/** One heart of the sheet: its two pieces and which of them is cut. */
export interface LaserHeart {
	design: HeartDesign;
	/** The heart's two pieces, left lobe first; the same piece twice when the lobes share a template. */
	pair: [UnfoldedPiece, UnfoldedPiece];
	/** Both lobes are one piece, so the sheet serves either colour. */
	shared: boolean;
	/** The lobe of this heart on the sheet: the request's, or the left when shared. */
	lobe: TemplateLobe;
}

export interface LaserPlan extends LaserSheet {
	/** Every heart on the sheet, in the order asked for (SELECTION.md: several at once). */
	hearts: LaserHeart[];
	/** The first heart's pair — the only one when the sheet is for one heart. */
	pair: [UnfoldedPiece, UnfoldedPiece];
	/** Every heart's lobes are one piece, so the sheet serves either colour and needs no lobe choice. */
	shared: boolean;
	/** The lobe asked for, or the left when every heart is shared. */
	lobe: TemplateLobe;
	piecesRequested: number;
	piecesFit: number;
}

export function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}

function laserHeart(design: HeartDesign, widthMm: number, lobe: TemplateLobe): LaserHeart {
	const shared = lobesShareTemplate(design.fingers, design.gridSize);
	const left = unfoldPiece(design, 'left', widthMm);
	const right = shared ? left : unfoldPiece(design, 'right', widthMm);
	return { design, pair: [left, right], shared, lobe: shared ? 'left' : lobe };
}

/**
 * `count` pieces of one lobe per heart, laid out on the sheet, heart by heart
 * in the order given. A heart whose lobes share a template (`lobesShareTemplate`)
 * is cut from the left piece whichever lobe is asked for, as the PDF prints one
 * template for both; the lobe asked for applies to every other heart.
 */
export function planLaserSheet(
	designs: HeartDesign | readonly HeartDesign[],
	request: LaserRequest
): LaserPlan {
	const list = Array.isArray(designs) ? (designs as readonly HeartDesign[]) : [designs as HeartDesign];
	if (list.length === 0) throw new Error('No heart to lay out.');
	const hearts = list.map((design) => laserHeart(design, request.widthMm, request.lobe));
	const wanted: UnfoldedPiece[] = hearts.flatMap((heart) => {
		const piece = heart.lobe === 'left' ? heart.pair[0] : heart.pair[1];
		return Array.from({ length: request.count }, () => piece);
	});
	const shared = hearts.every((heart) => heart.shared);

	const layout = layoutSheet(wanted, { sheet: request.sheet });
	return {
		sheet: request.sheet,
		pieces: layout.placements.map(({ index, x, y }) => ({ piece: wanted[index]!, x, y })),
		hearts,
		pair: hearts[0]!.pair,
		shared,
		lobe: shared ? 'left' : request.lobe,
		piecesRequested: wanted.length,
		piecesFit: layout.fitted
	};
}

export interface LaserFileInfo {
	heartId: string;
	heartName: string;
	/** The heart's page, for the SVG's `<desc>`. */
	url: string;
	widthMm: number;
}

/** The file's text, in the chosen format. */
export function laserFileContent(plan: LaserSheet, format: LaserFormat, info: LaserFileInfo): string {
	if (format === 'dxf') return serializeLaserDxf(plan);
	return serializeLaserSvg(plan, {
		title: info.heartName,
		description: `${info.url} · ${info.widthMm} mm`
	});
}

/**
 * `{heart id}-laser-{width}mm.{svg|dxf}`, or with the lobe's name before the
 * extension (`…-80mm-venstre.svg`) when the heart's halves differ, so the two
 * files of one heart are told apart; anything unsafe in a file name dashed out.
 */
export function laserFileName(heartId: string, widthMm: number, format: LaserFormat, lobeName?: string): string {
	const id = heartId.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'juleflet';
	// "Højre" on disk as "hoejre", the way the gallery's ids spell Danish.
	const lobe = lobeName ? `-${slugify(lobeName, '')}`.replace(/-$/, '') : '';
	return `${id}-laser-${widthMm}mm${lobe}.${format}`;
}

// ---- Remembered settings ----------------------------------------------------
// The laser dialog's own key, from before it became the "Hent skabelon"
// dialog. Only read now, once, by $lib/download/settings.

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
