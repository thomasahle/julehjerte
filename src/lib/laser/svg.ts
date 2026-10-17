/**
 * The laser SVG — docs/redesign/LASER.md "Writers".
 *
 * One user unit is one millimetre (`width="…mm"` against a viewBox of the same
 * numbers), so every laser program imports it at size. Cut lines are red and
 * score lines blue, each in a group of its own, at a 0.01 mm hairline: the
 * colours are how Glowforge, xTool and LightBurn tell operations apart, and a
 * hairline is what they read as "vector, not engrave". No fills, no text and no
 * transforms — the pieces' offsets are baked into the coordinates, because a
 * transform is the one thing every importer handles slightly differently.
 */
import type { Vec } from '$lib/types/heart';
import { coord } from './format';
import type { LaserSheet } from './sheet';
import type { LaserPath } from './unfold';

export interface LaserSvgOptions {
	/** Add the fold lines as a blue score group. */
	scoreFold: boolean;
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
const SCORE_COLOUR = '#0000ff';
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
	const group = (name: 'cut' | 'score', colour: string) =>
		preview
			? `  <g class="${name}" fill="none">`
			: `  <g id="${name}" fill="none" stroke="${colour}" stroke-width="${HAIRLINE}">`;
	const pathEl = (d: string) =>
		preview ? `    <path d="${d}" vector-effect="non-scaling-stroke" />` : `    <path d="${d}" />`;

	lines.push(group('cut', CUT_COLOUR));
	for (const { piece, x, y } of layout.pieces) {
		lines.push(pathEl(pathData(piece.outline, x, y)));
		for (const cut of piece.cuts) lines.push(pathEl(pathData(cut, x, y)));
	}
	lines.push('  </g>');

	if (options.scoreFold) {
		lines.push(group('score', SCORE_COLOUR));
		for (const { piece, x, y } of layout.pieces) {
			const { from, to } = piece.fold;
			lines.push(pathEl(`M ${coord(from.x + x)} ${coord(from.y + y)} L ${coord(to.x + x)} ${coord(to.y + y)}`));
		}
		lines.push('  </g>');
	}

	lines.push('</svg>');
	return lines.join('\n');
}
