/**
 * How Tegn's, Mal's and the design page's "Hent PDF" prints one heart —
 * docs/redesign/DOWNLOAD.md. Without jsPDF, so the design page can say how
 * wide the heart prints before anything is made.
 */
import type { HeartDesign } from '$lib/types/heart';
import { DEFAULT_DOWNLOAD_SETTINGS, loadDownloadSettings, type DownloadSettings } from '$lib/download/settings';
import { MAX_WIDTH_MM } from '$lib/laser/export';
import { SHEETS, type SheetSize } from '$lib/laser/sheet';
import { planTemplatePages, templatePieces } from './plan';

export const sheetSize = (choice: DownloadSettings['sheet']): SheetSize => (typeof choice === 'string' ? SHEETS[choice] : choice);

/**
 * The settings the visitor last downloaded with (80 mm on A4 until then), at
 * `widthMm` when asked; the dialog's defaults where that sheet cannot take the
 * heart so wide.
 */
export function designPrintSettings(design: HeartDesign, widthMm?: number,
	stored: DownloadSettings = loadDownloadSettings()): DownloadSettings {
	const asked = widthMm === undefined ? stored : { ...stored, widthMm };
	const fits = planTemplatePages(templatePieces([design], asked.widthMm, 1), { sheet: sheetSize(asked.sheet) }).fits;
	return fits ? asked : DEFAULT_DOWNLOAD_SETTINGS;
}

/**
 * The width the heart prints at, and the widest, in whole `stepMm`, its sheet
 * takes it: how far the design page may offer a wider print where the paper
 * would tear ($lib/geometry/paperNecks's `holdingWidth`).
 */
export function designPrintRange(design: HeartDesign, stored: DownloadSettings = loadDownloadSettings(),
	stepMm = 10): { widthMm: number; maxMm: number } {
	const settings = designPrintSettings(design, undefined, stored);
	let maxMm = Math.floor(MAX_WIDTH_MM / stepMm) * stepMm;
	while (maxMm > settings.widthMm && designPrintSettings(design, maxMm, settings).widthMm !== maxMm) maxMm -= stepMm;
	return { widthMm: settings.widthMm, maxMm };
}
