/**
 * What the printer PDF puts inside a folded template's rounded end — the
 * heart's picture and its address — docs/redesign/DOWNLOAD.md, round 2,
 * amendments 2 and 3, and the owner's note after it: the heart's name is not
 * printed, only the address.
 *
 * The address used to sit above the template, on paper that is cut away, so a
 * cut-out template had lost the way back to its heart. The ear is the one part
 * of the piece no cut crosses (every strip cut starts at the ear base, y = R)
 * and the part that survives folding whole, so both go there: the picture as
 * high as the curve allows, the address directly under it, all above the ear
 * base. generateTemplatesPDF (./template.ts) draws this layout with jsPDF and
 * the dialog's preview (./preview.ts) draws it in SVG, so the two agree.
 *
 * Everything is in millimetres in the template's own frame: x across from its
 * left side, y down from the top of the ear, which is a half circle of radius R
 * centred on (R, R) — the template is 2R wide.
 */

/** Points to millimetres. */
export const PT_MM = 25.4 / 72;

/** The size the PDF has always printed the address at; it shrinks, never grows. */
export const ADDRESS_PT = 6;
/** The address never goes below this; the picture shrinks instead. */
export const MIN_TEXT_PT = 5;

/** Kept free between the ear's outline and the picture's corners. */
const OUTLINE_CLEARANCE_MM = 0.5;
/** Between the picture's foot and the address. */
const PICTURE_GAP_MM = 0.8;
/** Between the address and the ear base, where the first cut begins. */
const BASE_CLEARANCE_MM = 0.8;
/** Kept free at each end of the address, inside the curve. */
const SIDE_CLEARANCE_MM = 1;

// Helvetica's (jsPDF's default font) vertical metrics, as fractions of the size.
const ASCENT = 0.75;
const DESCENT = 0.23;

/** The picture is rendered for print: 300 dots per inch, and never under 200 px. */
const PICTURE_DPI = 300;

/** The pixel size to render a picture that prints `sizeMm` wide at. */
export function picturePixels(sizeMm: number): number {
	return Math.max(200, Math.round((sizeMm / 25.4) * PICTURE_DPI));
}

/** The width of `text` set at `sizePt`, in millimetres. */
export type MeasureText = (text: string, sizePt: number) => number;

/**
 * A Helvetica width estimate, for the preview, which has no PDF to ask. Close
 * enough to decide whether a line fits; the PDF measures exactly.
 */
export const estimateTextWidth: MeasureText = (text, sizePt) => {
	let em = 0;
	for (const ch of text) {
		if (/[.,:;'|!il/ ()-]/.test(ch)) em += 0.3;
		else if (/[mwMW]/.test(ch)) em += 0.83;
		else if (/[A-ZÆØÅ]/.test(ch)) em += 0.68;
		else em += 0.55;
	}
	return em * sizePt * PT_MM;
};

export interface EarLine {
	text: string;
	sizePt: number;
	/** The line's centre, across. */
	x: number;
	baseline: number;
}

export interface EarLayout {
	/** The picture's square, top-left corner and side; null when there is none. */
	picture: { x: number; y: number; size: number } | null;
	/** The address line; null when there is no address. */
	address: EarLine | null;
}

export interface EarLayoutInput {
	/** The folded template's width (2R) and height (ear top to fold). */
	widthMm: number;
	heightMm: number;
	earRadiusMm: number;
	/** Whether the heart's picture is printed. */
	picture: boolean;
	/** The line under the picture: `templateEarText` in ./plan.ts. */
	address: string;
	measure?: MeasureText;
}

/** The ear's width at depth `y` below its top (the chord of the half circle). */
function chord(r: number, y: number): number {
	const dy = r - Math.min(Math.max(y, 0), r);
	return 2 * Math.sqrt(Math.max(0, r * r - dy * dy));
}

/** The highest a centred square of side `size` can sit inside the ear, clear of its outline. */
function pictureTop(r: number, size: number): number {
	const inner = r - OUTLINE_CLEARANCE_MM;
	return r - Math.sqrt(Math.max(0, inner * inner - (size / 2) ** 2));
}

/** The address's height at `pt` points, from its ascent to its descent. */
const lineHeight = (pt: number) => (ASCENT + DESCENT) * pt * PT_MM;

/**
 * The picture, then the address in the band left between its foot and the ear
 * base: at 6 pt when it fits, shrunk to the band's height and to the ear's
 * width when it does not, but never under 5 pt — if the band cannot hold 5 pt,
 * the picture is made smaller instead. With the picture turned off the
 * address sits where the picture's middle would have been (lower, if the
 * curve is too tight there even for 5 pt).
 */
export function layoutEar(input: EarLayoutInput): EarLayout {
	const { widthMm: w, heightMm: h, earRadiusMm: r, address } = input;
	const measure = input.measure ?? estimateTextWidth;
	const cx = w / 2;
	const baseLimit = r - BASE_CLEARANCE_MM;

	// The picture's size is the one the PDF has always given it.
	let size = Math.min(w * 0.35, h * 0.25);
	const top = pictureTop(r, size);

	// Where the address's top may be, and how much height it has.
	let lineTop: number;
	if (input.picture) {
		lineTop = top + size + PICTURE_GAP_MM;
		// Not even 5 pt: give the address the room by shrinking the picture,
		// which a template can lose more easily than the way back to its heart.
		const needed = lineHeight(MIN_TEXT_PT);
		if (baseLimit - lineTop < needed) {
			let lo = 0;
			let hi = size;
			for (let i = 0; i < 40; i++) {
				const mid = (lo + hi) / 2;
				if (baseLimit - (pictureTop(r, mid) + mid + PICTURE_GAP_MM) >= needed) lo = mid;
				else hi = mid;
			}
			size = lo;
			lineTop = pictureTop(r, size) + size + PICTURE_GAP_MM;
		}
	} else {
		// Centred on the picture's middle, as far as the ear base allows — and
		// lower where the curve is too tight there for the address at 5 pt.
		const middle = top + size / 2;
		lineTop = Math.min(middle - lineHeight(ADDRESS_PT) / 2, baseLimit - lineHeight(ADDRESS_PT));
		const halfAcross = measure(address, MIN_TEXT_PT) / 2 + SIDE_CLEARANCE_MM;
		if (halfAcross < r) {
			const wideEnough = r - Math.sqrt(r * r - halfAcross * halfAcross);
			lineTop = Math.min(Math.max(lineTop, wideEnough), baseLimit - lineHeight(MIN_TEXT_PT));
		}
	}

	const picture = input.picture ? { x: cx - size / 2, y: pictureTop(r, size), size } : null;
	if (!address) return { picture, address: null };

	// To the band's height, and to the ear's width at the line's top, where the
	// curve is tightest; never under 5 pt.
	const across = chord(r, lineTop) - 2 * SIDE_CLEARANCE_MM;
	const width = measure(address, ADDRESS_PT);
	const widthScale = width > 0 ? across / width : Infinity;
	const heightScale = (baseLimit - lineTop) / lineHeight(ADDRESS_PT);
	const sizePt = Math.max(MIN_TEXT_PT, ADDRESS_PT * Math.min(1, heightScale, widthScale));
	return {
		picture,
		address: { text: address, sizePt, x: cx, baseline: lineTop + ASCENT * sizePt * PT_MM }
	};
}
