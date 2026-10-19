/**
 * What the "Hent skabelon" dialog remembers between visits —
 * docs/redesign/DOWNLOAD.md.
 *
 * Everything the visitor set, under one localStorage key. Anything stored that
 * is not a value the dialog offers is dropped field by field, so one bad value
 * (an old version's, or a hand edit) does not cost the rest. The laser
 * dialog's old key is read once, for a visitor who set a width there before
 * the two dialogs became one, and never written.
 */
import {
	DEFAULT_WIDTH_MM,
	LASER_FORMATS,
	LASER_STORAGE_KEY,
	MAX_HEARTS,
	MAX_SHEET_MM,
	MAX_WIDTH_MM,
	MIN_HEARTS,
	MIN_SHEET_MM,
	MIN_WIDTH_MM,
	clamp,
	parseLaserSettings,
	type LaserFormat
} from '$lib/laser/export';
import type { SheetSize } from '$lib/laser/sheet';

const DOWNLOAD_STORAGE_KEY = 'juleflet:download';

export type DownloadMode = 'printer' | 'laser';

/** A standard sheet by name, or a custom one by its size. */
export type SheetChoice = 'A4' | 'A3' | SheetSize;

export interface DownloadSettings {
	mode: DownloadMode;
	widthMm: number;
	hearts: number;
	sheet: SheetChoice;
	format: LaserFormat;
	previewImage: boolean;
}

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
	mode: 'printer',
	widthMm: DEFAULT_WIDTH_MM,
	hearts: 1,
	sheet: 'A4',
	format: 'svg',
	previewImage: true
};

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseSheet(value: unknown): SheetChoice | undefined {
	if (value === 'A4' || value === 'A3') return value;
	if (value && typeof value === 'object') {
		const { widthMm, heightMm } = value as Partial<SheetSize>;
		if (isNumber(widthMm) && isNumber(heightMm)) {
			return {
				widthMm: clamp(widthMm, MIN_SHEET_MM, MAX_SHEET_MM),
				heightMm: clamp(heightMm, MIN_SHEET_MM, MAX_SHEET_MM)
			};
		}
	}
	return undefined;
}

/** Whatever is stored, as settings; each unreadable field is its default. */
export function parseDownloadSettings(raw: string | null): DownloadSettings {
	const settings = { ...DEFAULT_DOWNLOAD_SETTINGS };
	let value: Record<string, unknown>;
	try {
		const parsed: unknown = raw ? JSON.parse(raw) : {};
		if (!parsed || typeof parsed !== 'object') return settings;
		value = parsed as Record<string, unknown>;
	} catch {
		return settings;
	}
	if (value.mode === 'printer' || value.mode === 'laser') settings.mode = value.mode;
	if (isNumber(value.widthMm)) settings.widthMm = clamp(value.widthMm, MIN_WIDTH_MM, MAX_WIDTH_MM);
	if (isNumber(value.hearts)) settings.hearts = Math.round(clamp(value.hearts, MIN_HEARTS, MAX_HEARTS));
	settings.sheet = parseSheet(value.sheet) ?? settings.sheet;
	if (LASER_FORMATS.includes(value.format as LaserFormat)) settings.format = value.format as LaserFormat;
	// `scoreFold`, stored before the laser file lost its fold line (DOWNLOAD.md,
	// round 2), is simply not read: nothing copies unknown fields across.
	if (typeof value.previewImage === 'boolean') settings.previewImage = value.previewImage;
	return settings;
}

export function loadDownloadSettings(): DownloadSettings {
	try {
		const raw = window.localStorage.getItem(DOWNLOAD_STORAGE_KEY);
		if (raw !== null) return parseDownloadSettings(raw);
		// Nothing saved by this dialog yet: start from the laser dialog's width
		// and format, if it left any. The next save writes the new key, and from
		// then on the old one is not looked at.
		const legacy = window.localStorage.getItem(LASER_STORAGE_KEY);
		if (legacy === null) return { ...DEFAULT_DOWNLOAD_SETTINGS };
		const { format, widthMm } = parseLaserSettings(legacy);
		return { ...DEFAULT_DOWNLOAD_SETTINGS, format, widthMm };
	} catch {
		return { ...DEFAULT_DOWNLOAD_SETTINGS };
	}
}

export function saveDownloadSettings(settings: DownloadSettings): void {
	try {
		window.localStorage.setItem(DOWNLOAD_STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// Blocked or full: the next visit starts from the defaults again.
	}
}
