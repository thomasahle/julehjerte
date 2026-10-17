/**
 * The laser SVG — docs/redesign/LASER.md "Writers".
 *
 * One user unit is one millimetre (`width="…mm"` against a viewBox of the same
 * numbers), so every laser program imports it at size. Every line is a cut:
 * red, the colour laser programs conventionally take for cutting, in one
 * group, at a 0.01 mm hairline, which they read as "vector, not engrave". The
 * fold is not drawn at all (DOWNLOAD.md, round 2): paper folds without a
 * score, and a fold line left at cutting power would cut the piece in two.
 * No fills, no text and no transforms — the pieces' offsets are baked into the
 * coordinates, because a transform is the one thing every importer handles
 * slightly differently.
 */
import type { Vec } from '$lib/types/heart';
import { coord } from './format';
import type { LaserSheet } from './sheet';
import type { LaserPath } from './unfold';

export interface LaserSvgOptions {
	/** The heart's name, for `<title>`. */
	title: string;
	/** Where it came from and at what width, for `<desc>`. */
	description: string;
	/**
	 * `laser` (the file) or `preview` (the dialog's picture of it): the same
	 * geometry, but with classes the page styles instead of laser colours, a
	 * stroke that stays visible at any zoom, and the sheet drawn behind.
	 */
	look?: 'laser' | 'preview';
}

const CUT_COLOUR = '#ff0000';
const HAIRLINE = '0.01';

function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Path data with the piece's offset added to every point. */
export function pathData(path: LaserPath, dx: number, dy: number): string {
	const p = (v: Vec) => `${coord(v.x + dx)} ${coord(v.y + dy)}`;
	const parts = [`M ${p(path.start)}`];
	for (const seg of path.segments) {
		if (seg.kind === 'L') parts.push(`L ${p(seg.to)}`);
		else if (seg.kind === 'C') parts.push(`C ${p(seg.c1)} ${p(seg.c2)} ${p(seg.to)}`);
		else parts.push(`A ${coord(seg.r)} ${coord(seg.r)} 0 0 ${seg.sweep} ${p(seg.to)}`);
	}
	if (path.closed) parts.push('Z');
	return parts.join(' ');
}

export function serializeLaserSvg(layout: LaserSheet, options: LaserSvgOptions): string {
	const { widthMm: W, heightMm: H } = layout.sheet;
	const preview = options.look === 'preview';
	const lines: string[] = [];

	if (preview) {
		lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${coord(W)} ${coord(H)}">`);
	} else {
		lines.push(
			`<svg xmlns="http://www.w3.org/2000/svg" width="${coord(W)}mm" height="${coord(H)}mm" viewBox="0 0 ${coord(W)} ${coord(H)}">`
		);
	}
	lines.push(`  <title>${escapeXml(options.title)}</title>`);
	lines.push(`  <desc>${escapeXml(options.description)}</desc>`);
	if (preview) {
		lines.push(`  <rect class="sheet" x="0" y="0" width="${coord(W)}" height="${coord(H)}" />`);
	}

	// A preview's lines keep one screen width however small the sheet is drawn.
	lines.push(
		preview
			? '  <g class="cut" fill="none">'
			: `  <g id="cut" fill="none" stroke="${CUT_COLOUR}" stroke-width="${HAIRLINE}">`
	);
	const pathEl = (d: string) =>
		preview ? `    <path d="${d}" vector-effect="non-scaling-stroke" />` : `    <path d="${d}" />`;

	for (const { piece, x, y } of layout.pieces) {
		lines.push(pathEl(pathData(piece.outline, x, y)));
		for (const cut of piece.cuts) lines.push(pathEl(pathData(cut, x, y)));
	}
	lines.push('  </g>');
	lines.push('</svg>');
	return lines.join('\n');
}
