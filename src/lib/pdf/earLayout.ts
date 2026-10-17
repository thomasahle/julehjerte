/**
 * What the printer PDF puts inside a folded template's rounded end — the
 * heart's picture, its name and its address — docs/redesign/DOWNLOAD.md,
 * round 2, amendments 2 and 3.
 *
 * The two lines used to sit above the template, on paper that is cut away, so
 * a cut-out template had lost its name. The ear is the one part of the piece no
 * cut crosses (every strip cut starts at the ear base, y = R) and the part that
 * survives folding whole, so everything goes there: the picture as high as the
 * curve allows, the name and the address directly under it, all above the ear
 * base. generateTemplatesPDF (./template.ts) draws this layout with jsPDF and
 * the dialog's preview (./preview.ts) draws it in SVG, so the two agree.
 *
 * Everything is in millimetres in the template's own frame: x across from its
 * left side, y down from the top of the ear, which is a half circle of radius R
 * centred on (R, R) — the template is 2R wide.
 */

/** Points to millimetres. */
export const PT_MM = 25.4 / 72;

/** The sizes the PDF has always printed the lines at; they shrink, never grow. */
export const NAME_PT = 8;
export const ADDRESS_PT = 6;
/** Below this the address is dropped, so the name keeps the room. */
export const MIN_TEXT_PT = 5;

/** Kept free between the ear's outline and the picture's corners. */
const OUTLINE_CLEARANCE_MM = 0.5;
/** Between the picture's foot and the name. */
const PICTURE_GAP_MM = 0.8;
/** Between the last line and the ear base, where the first cut begins. */
const BASE_CLEARANCE_MM = 0.8;
/** Kept free at each end of a line, inside the curve. */
const SIDE_CLEARANCE_MM = 1;

// Helvetica's (jsPDF's default font) vertical metrics, as fractions of the size.
const ASCENT = 0.75;
const DESCENT = 0.23;
/** Name baseline to address baseline, at full size: 3 mm, as the PDF had it. */
const LINE_STEP_MM = 3;

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
	kind: 'name' | 'address';
	text: string;
	sizePt: number;
	/** The line's centre, across. */
	x: number;
	baseline: number;
}

export interface EarLayout {
	/** The picture's square, top-left corner and side; null when there is none. */
	picture: { x: number; y: number; size: number } | null;
	lines: EarLine[];
}

export interface EarLayoutInput {
	/** The folded template's width (2R) and height (ear top to fold). */
	widthMm: number;
	heightMm: number;
	earRadiusMm: number;
	/** Whether the heart's picture is printed. */
	picture: boolean;
	name: string;
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

/** Text block height for both lines at scale `f`, top of the name to the address's descent. */
const bothHeight = (f: number) => f * (ASCENT * NAME_PT * PT_MM + LINE_STEP_MM + DESCENT * ADDRESS_PT * PT_MM);
/** The name alone, at scale `f`. */
const nameHeight = (f: number) => f * (ASCENT + DESCENT) * NAME_PT * PT_MM;

/**
 * The picture, then the lines in the band left between its foot and the ear
 * base: at 8 pt and 6 pt when they fit, both shrunk together when they do not,
 * the address dropped when it would fall under 5 pt, and the picture made
 * smaller only if even the name alone would. With the picture turned off the
 * lines sit where its middle would have been.
 */
export function layoutEar(input: EarLayoutInput): EarLayout {
	const { widthMm: w, heightMm: h, earRadiusMm: r, name, address } = input;
	const measure = input.measure ?? estimateTextWidth;
	const cx = w / 2;
	const baseLimit = r - BASE_CLEARANCE_MM;

	// The picture's size is the one the PDF has always given it.
	let size = Math.min(w * 0.35, h * 0.25);
	const top = pictureTop(r, size);

	// Where the text block may start, and how much height it has.
	let blockTop: number;
	let room: number;
	if (input.picture) {
		blockTop = top + size + PICTURE_GAP_MM;
		room = baseLimit - blockTop;
		// Not even the name at 5 pt: give it the room by shrinking the picture,
		// which the PDF can lose more easily than the template its name.
		const needed = nameHeight(MIN_TEXT_PT / NAME_PT);
		if (room < needed) {
			let lo = 0;
			let hi = size;
			for (let i = 0; i < 40; i++) {
				const mid = (lo + hi) / 2;
				if (baseLimit - (pictureTop(r, mid) + mid + PICTURE_GAP_MM) >= needed) lo = mid;
				else hi = mid;
			}
			size = lo;
			blockTop = pictureTop(r, size) + size + PICTURE_GAP_MM;
			room = baseLimit - blockTop;
		}
	} else {
		// Centred on the picture's middle, as far as the ear base allows.
		const middle = top + size / 2;
		blockTop = Math.min(middle - bothHeight(1) / 2, baseLimit - bothHeight(1));
		room = baseLimit - blockTop;
	}

	// The narrowest the block gets is at its top, where the curve is tightest.
	const across = chord(r, blockTop) - 2 * SIDE_CLEARANCE_MM;
	const widthScale = (text: string, pt: number) => {
		const width = measure(text, pt);
		return width > 0 ? across / width : Infinity;
	};

	const picture = input.picture ? { x: cx - size / 2, y: pictureTop(r, size), size } : null;

	// Both lines, shrunk together to the band's height; each then on its own to the width.
	const f = Math.min(1, room / bothHeight(1));
	const nameBaseline = blockTop + f * ASCENT * NAME_PT * PT_MM;
	const addressPt = ADDRESS_PT * Math.min(f, widthScale(address, ADDRESS_PT));
	if (addressPt >= MIN_TEXT_PT && address) {
		return {
			picture,
			lines: [
				{ kind: 'name', text: name, sizePt: NAME_PT * Math.min(f, widthScale(name, NAME_PT)), x: cx, baseline: nameBaseline },
				{ kind: 'address', text: address, sizePt: addressPt, x: cx, baseline: nameBaseline + f * LINE_STEP_MM }
			]
		};
	}

	// The name alone, with the whole band.
	const g = Math.min(1, room / nameHeight(1));
	return {
		picture,
		lines: [
			{
				kind: 'name',
				text: name,
				sizePt: NAME_PT * Math.min(g, widthScale(name, NAME_PT)),
				x: cx,
				baseline: blockTop + g * ASCENT * NAME_PT * PT_MM
			}
		]
	};
}
