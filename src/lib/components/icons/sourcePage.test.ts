/**
 * The hand-drawn glyphs against the page they were copied from.
 *
 * docs/redesign/symmetri-ikoner.html is committed and machine-readable, and it
 * is the drawing the owner chose: "Familie A med tekst" for the symmetry rows,
 * `v2-outline-a` and `v2-snap-b` for the two Tegning checkboxes. Everything
 * else these tests know — that there are nine glyphs, that they differ, that a
 * row's modes change only the last cut — stays true while a single coordinate
 * is mistyped and the icon quietly stops being the one that was chosen. Eleven
 * drawings of bezier data were transcribed by hand; this reads them back out of
 * the page and compares them curve for curve.
 */
import { describe, expect, it } from 'vitest';
import { LOBE_OUTLINE_COLORS } from '$lib/editor/outlineColors';
import sourcePage from '../../../../docs/redesign/symmetri-ikoner.html?raw';
import outlineIconFile from './OutlineIcon.svelte?raw';
import snapIconFile from './SnapIcon.svelte?raw';
import symmetryIconFile from './SymmetryIcon.svelte?raw';
import {
	SYMMETRY_ICON_MODES,
	SYMMETRY_ICON_PATHS,
	SYMMETRY_ICON_ROWS,
	type SymmetryIconPath,
	type SymmetryIconRow
} from './symmetryIcons';
import { SOFT_OPACITY } from './types';

const page = new DOMParser().parseFromString(sourcePage, 'text/html');

/** One `<symbol>` of the source page, by the id the spec calls it by. */
function symbol(id: string): Element {
	const el = page.getElementById(id);
	if (!el) throw new Error(`docs/redesign/symmetri-ikoner.html has no #${id}`);
	return el;
}

/** The page names the two-lobe row "both"; the app calls it `lobes`. */
const SOURCE_ROW: Record<SymmetryIconRow, string> = { curve: 'curve', lobe: 'lobe', lobes: 'both' };

const symmetryId = (row: SymmetryIconRow, mode: string) => `a-${SOURCE_ROW[row]}-${mode}`;

/** The two Tegning glyphs: the component, and the variant it was copied from. */
const DRAWING_ICONS = [
	{ name: 'OutlineIcon', file: outlineIconFile, id: 'v2-outline-a' },
	{ name: 'SnapIcon', file: snapIconFile, id: 'v2-snap-b' }
];

/** The canvas every one of these glyphs is drawn on, page and component alike. */
const CANVAS = {
	viewBox: '0 0 24 24',
	fill: 'none',
	stroke: 'currentColor',
	'stroke-width': '1.8',
	'stroke-linecap': 'round',
	'stroke-linejoin': 'round'
};

/** Paint a group hands down to the shapes inside it. */
const INHERITED = ['stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill', 'opacity'];

/** What a shape at the end of the tree actually draws. */
const GEOMETRY = ['d', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r'];

type Shape = Record<string, string>;

const attributes = (el: Element): Shape =>
	Object.fromEntries(Array.from(el.attributes, (a) => [a.name, a.value]));

/**
 * Every shape a drawing ends in, with the groups above it folded in: their
 * transforms composed and their paint inherited. Two drawings that flatten to
 * the same list draw the same picture, whether one of them wraps a path in a
 * `<g transform>` (as the page does) and the other puts the transform on the
 * path itself (as the table does).
 *
 * The root's own attributes are left out — that is the canvas, checked once on
 * its own below — so a `<symbol>` and a component's `<svg>` compare as equals.
 */
function shapes(root: Element): Shape[] {
	const out: Shape[] = [];
	const walk = (el: Element, inherited: Shape, transform: string) => {
		const painted: Shape = { ...inherited };
		for (const name of INHERITED) {
			const value = el.getAttribute(name);
			if (value !== null) painted[name] = value;
		}
		// The page holds a shape back with a stylesheet class; a component has no
		// stylesheet of its own and writes the same opacity out as an attribute.
		if ((el.getAttribute('class') ?? '').split(/\s+/).includes('soft')) {
			painted.opacity = String(SOFT_OPACITY);
		}
		const own = el.getAttribute('transform');
		const chain = [transform, own].filter(Boolean).join(' ');
		const children = Array.from(el.children);
		if (children.length > 0) {
			for (const child of children) walk(child, painted, chain);
			return;
		}
		const shape: Shape = { tag: el.tagName.toLowerCase(), ...painted };
		if (chain) shape.transform = chain;
		for (const name of GEOMETRY) {
			const value = el.getAttribute(name);
			if (value !== null) shape[name] = value;
		}
		out.push(shape);
	};
	for (const child of Array.from(root.children)) walk(child, {}, '');
	return out;
}

/** The `{…}` an icon component writes into its markup, as a browser gets them. */
const RUNTIME_VALUES: Record<string, string> = {
	'{size}': '"28"',
	'{className}': '""',
	'{SOFT_OPACITY}': `"${SOFT_OPACITY}"`,
	'{LOBE_OUTLINE_COLORS.left}': `"${LOBE_OUTLINE_COLORS.left}"`,
	'{LOBE_OUTLINE_COLORS.right}': `"${LOBE_OUTLINE_COLORS.right}"`
};

/** An icon component's own markup, with those values filled in. */
function componentMarkup(file: string, name: string): string {
	const svg = file.match(/<svg[\s\S]*<\/svg>/)?.[0];
	if (!svg) throw new Error(`${name} draws no <svg>`);
	let rendered = svg.replace('{...rest}', '');
	for (const [expression, value] of Object.entries(RUNTIME_VALUES)) {
		rendered = rendered.split(expression).join(value);
	}
	return rendered;
}

const parseSvg = (markup: string): Element => {
	const svg = new DOMParser().parseFromString(markup, 'text/html').querySelector('svg');
	if (!svg) throw new Error('markup that is not an <svg>');
	return svg;
};

/** A glyph of the table as SymmetryIcon draws it: one `<path>` per entry. */
const drawn = (paths: SymmetryIconPath[]): Shape[] =>
	paths.map((path) => ({
		tag: 'path',
		...(path.soft ? { opacity: String(SOFT_OPACITY) } : {}),
		...(path.transform ? { transform: path.transform } : {}),
		d: path.d
	}));

describe('the glyphs against docs/redesign/symmetri-ikoner.html', () => {
	it('draws the nine symmetry glyphs as the source page does', () => {
		for (const row of SYMMETRY_ICON_ROWS) {
			for (const mode of SYMMETRY_ICON_MODES) {
				const id = symmetryId(row, mode);
				expect(drawn(SYMMETRY_ICON_PATHS[row][mode]), id).toEqual(shapes(symbol(id)));
			}
		}
	});

	// The cut colours come with these two: the page draws #00ddff and #ff8800
	// into them by hand, and the components read $lib/editor/outlineColors, so
	// the comparison is also what says the constant still holds those two.
	it('draws the two Tegning glyphs as the source page does', () => {
		for (const { name, file, id } of DRAWING_ICONS) {
			const markup = componentMarkup(file, name);
			// Anything left is a value this test does not know how to fill in, and
			// the comparison below would be against a drawing nobody sees.
			expect(markup, name).not.toMatch(/[{}]/);
			expect(shapes(parseSvg(markup)), name).toEqual(shapes(symbol(id)));
		}
	});

	it('draws every glyph on the same canvas', () => {
		const ids = SYMMETRY_ICON_ROWS.flatMap((row) =>
			SYMMETRY_ICON_MODES.map((mode) => symmetryId(row, mode))
		).concat(DRAWING_ICONS.map((icon) => icon.id));
		for (const id of ids) expect(attributes(symbol(id)), id).toMatchObject(CANVAS);

		// 24 units, stroke 1.8, round ends: the shapes above are compared without
		// their root, so this is what says they are drawn at the same weight.
		const components = [{ name: 'SymmetryIcon', file: symmetryIconFile }, ...DRAWING_ICONS];
		for (const { name, file } of components) {
			expect(attributes(parseSvg(componentMarkup(file, name))), name).toMatchObject(CANVAS);
		}
	});

	// The page holds its `soft` shapes back with a stylesheet rule the components
	// cannot import; SOFT_OPACITY is that rule copied out, so it is pinned to it.
	it('holds a soft shape back as far as the source page does', () => {
		const rule = sourcePage.match(/\.soft\s*\{\s*opacity:\s*([\d.]+)\s*;?\s*\}/);
		expect(rule, '.soft rule in the source page').not.toBeNull();
		expect(Number(rule![1])).toBe(SOFT_OPACITY);
	});
});
