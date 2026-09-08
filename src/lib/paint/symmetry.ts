/**
 * Symmetry, expressed on the mask.
 *
 * The editor's three rows (Inden i kurve, Inden i lap, Mellem lapper) are cut
 * geometry: they say how a strip's curve, a lobe's curves and the two lobes
 * relate. On the mask the same rules are square symmetries, because the woven
 * square is what both lobes' cuts share:
 *
 *   Mellem lapper Sym   transpose        (the two lobes carry the same template)
 *   Mellem lapper Anti  antiTranspose
 *   Inden i lap Sym     mirrorX + mirrorY (each lobe mirrored in its own centre line,
 *                                          and the rows apply to both lobes at once)
 *   Inden i lap Anti    rotate180
 *   Inden i kurve Sym   mirrorX + mirrorY (same square symmetry as Inden i lap Sym)
 *   Inden i kurve Anti  — point symmetry per cut; nothing the mask can express
 *
 * `transformsFor` returns those *generators*. Painting and `symmetrize` need the
 * group they generate — with both transpose and the mirrors on, a stroke also has
 * to be copied a quarter turn away — so the closure is computed here, over the
 * eight symmetries of the square. The five names in `Transform` stay the ones the
 * table above needs; the two quarter turns exist only inside the closure.
 */

import type { Mask } from './mask';

export type SymmetryMode = 'off' | 'sym' | 'anti';

/** The editor's three rows. Named as in the UI: within a curve, within a lobe, between lobes. */
export type SymmetrySettings = { curve: SymmetryMode; lobe: SymmetryMode; lobes: SymmetryMode };

/** No symmetry at all — what a fresh session and a freshly cleared mask start from. */
export const NO_SYMMETRY: SymmetrySettings = { curve: 'off', lobe: 'off', lobes: 'off' };

export type Transform = 'transpose' | 'antiTranspose' | 'mirrorX' | 'mirrorY' | 'rotate180';

/**
 * A symmetry of the square as `R^r ∘ F^f`: mirror the x axis `f` times, then turn
 * a quarter turn `r` times. Every one of the eight is an exact index permutation,
 * so copying under it never loses or doubles a cell.
 */
type Element = { r: 0 | 1 | 2 | 3; f: 0 | 1 };

const ELEMENTS: Record<Transform, Element> = {
	mirrorX: { r: 0, f: 1 },
	mirrorY: { r: 2, f: 1 },
	transpose: { r: 3, f: 1 },
	antiTranspose: { r: 1, f: 1 },
	rotate180: { r: 2, f: 0 }
};

const IDENTITY: Element = { r: 0, f: 0 };

function key(e: Element): string {
	return `${e.r}${e.f}`;
}

/** `a ∘ b` (apply b first). The dihedral rule: `F R = R⁻¹ F`. */
function compose(a: Element, b: Element): Element {
	const r = (((a.f ? a.r - b.r : a.r + b.r) % 4) + 4) % 4;
	return { r: r as Element['r'], f: (a.f ^ b.f) as 0 | 1 };
}

/** Where the cell at (x, y) lands under `e`, in a mask of `size` cells. */
function mapPoint(e: Element, x: number, y: number, size: number): { x: number; y: number } {
	let px = e.f ? size - 1 - x : x;
	let py = y;
	for (let i = 0; i < e.r; i++) {
		// A quarter turn clockwise: (x, y) -> (size - 1 - y, x).
		const nx = size - 1 - py;
		py = px;
		px = nx;
	}
	return { x: px, y: py };
}

/** Where the cell at (x, y) lands under one named transform. */
export function applyTransform(
	t: Transform,
	x: number,
	y: number,
	size: number
): { x: number; y: number } {
	return mapPoint(ELEMENTS[t], x, y, size);
}

/**
 * How many cells disagree with their image under `e`, and how many were looked at.
 *
 * With a `region` only cells whose image is in the region too are counted: the
 * question a free band asks is whether the *motif* is symmetric, and a band that
 * is about to be replaced by a woven pattern must not answer it.
 */
function countDisagreement(
	m: Mask,
	e: Element,
	region?: Uint8Array
): { differing: number; counted: number } {
	let differing = 0;
	let counted = 0;
	for (let y = 0; y < m.size; y++) {
		for (let x = 0; x < m.size; x++) {
			const here = y * m.size + x;
			const p = mapPoint(e, x, y, m.size);
			const there = p.y * m.size + p.x;
			if (region && (!region[here] || !region[there])) continue;
			counted++;
			if (m.data[here] !== m.data[there]) differing++;
		}
	}
	return { differing, counted };
}

/**
 * The fraction of cells that disagree with their image under `t`; 0 means exactly
 * symmetric. With a `region`, the fraction is of the region rather than of the square.
 */
export function disagreement(m: Mask, t: Transform, region?: Uint8Array): number {
	const { differing, counted } = countDisagreement(m, ELEMENTS[t], region);
	return counted ? differing / counted : 0;
}

/** The generators of the symmetry the settings ask for; §5's table, deduplicated. */
export function transformsFor(s: SymmetrySettings): Transform[] {
	const out: Transform[] = [];
	const add = (t: Transform) => {
		if (!out.includes(t)) out.push(t);
	};
	if (s.lobes === 'sym') add('transpose');
	else if (s.lobes === 'anti') add('antiTranspose');
	if (s.lobe === 'sym') {
		add('mirrorX');
		add('mirrorY');
	} else if (s.lobe === 'anti') add('rotate180');
	// Inden i kurve Sym asks for the same square symmetry as Inden i lap Sym;
	// Inden i kurve Anti is per-cut point symmetry, which no mask transform expresses.
	if (s.curve === 'sym') {
		add('mirrorX');
		add('mirrorY');
	}
	return out;
}

/**
 * Every symmetry generated by `transforms`, identity excluded.
 *
 * Closing the set is what makes symmetric painting correct: transpose together
 * with the two mirrors generates the full eight, and a stroke that is only copied
 * to the three generators' images leaves the quarter-turn images unpainted.
 */
function closure(transforms: Transform[]): Element[] {
	const seen = new Map<string, Element>([[key(IDENTITY), IDENTITY]]);
	const generators = transforms.map((t) => ELEMENTS[t]);
	let frontier: Element[] = [IDENTITY];
	while (frontier.length) {
		const next: Element[] = [];
		for (const e of frontier) {
			for (const g of generators) {
				const composed = compose(g, e);
				const k = key(composed);
				if (!seen.has(k)) {
					seen.set(k, composed);
					next.push(composed);
				}
			}
		}
		frontier = next;
	}
	seen.delete(key(IDENTITY));
	return [...seen.values()];
}

/** The orbit of one cell under the closed group, the cell itself first. */
function orbit(elements: Element[], x: number, y: number, size: number): number[] {
	const indices = [y * size + x];
	for (const e of elements) {
		const p = mapPoint(e, x, y, size);
		const index = p.y * size + p.x;
		if (!indices.includes(index)) indices.push(index);
	}
	return indices;
}

/**
 * Fold the mask onto itself so it is exactly symmetric under `transforms`.
 *
 * With a `region` (the protected motif of a free band, `$lib/paint/frame`) only
 * that part is folded: the band's colours are thrown away before the search sees
 * them, so folding them would be work that changes nothing.
 *
 * Each orbit takes the value most of its cells already have, and a tie goes to the
 * first cell in row order — so the result does not depend on which cell we happen
 * to visit first, and running it twice changes nothing. Solving wants a symmetric
 * target: asking the engine for a symmetric answer to an almost-symmetric picture
 * only spends search time proving the difference away.
 */
export function symmetrize(m: Mask, transforms: Transform[], region?: Uint8Array): void {
	const elements = closure(transforms);
	if (!elements.length) return;
	const done = new Uint8Array(m.data.length);
	for (let y = 0; y < m.size; y++) {
		for (let x = 0; x < m.size; x++) {
			const start = y * m.size + x;
			if (done[start]) continue;
			const cells = orbit(elements, x, y, m.size);
			// A region is folded orbit by orbit, and only where the whole orbit is
			// in it: half an orbit cannot be made symmetric without writing on the
			// half that was excluded. For a region the group maps onto itself — the
			// rude and the circle of $lib/paint/frame — that is exactly the region;
			// for one it does not, such as the hexagon under `mirrorX`, which swaps
			// the heart's two axes, the cells along its edge keep exactly what the
			// visitor painted. Nothing folds them afterwards either (PAINT.md §11):
			// the target the engine is given is then symmetric everywhere but on
			// that thin edge, which is a better trade than averaging the visitor's
			// own motif with the band beside it.
			if (region && cells.some((index) => !region[index])) {
				for (const index of cells) done[index] = 1;
				continue;
			}
			let ones = 0;
			for (const index of cells) ones += m.data[index]!;
			const value = ones * 2 === cells.length ? m.data[cells[0]!]! : ones * 2 > cells.length ? 1 : 0;
			for (const index of cells) {
				m.data[index] = value;
				done[index] = 1;
			}
		}
	}
}

/**
 * The symmetries the mask already has, as the editor's three rows.
 *
 * A photograph is never exact, so a transform counts as held when at most
 * `tolerance` of the picture disagrees with its image. The picture is the ink —
 * the cells of the minority colour — and not the whole square, because a small
 * motif matches every one of its images on almost every cell simply by being
 * mostly blank: measured over the square, any mask with under about 1.5% ink
 * would report all three rows found whatever is drawn on it, and §5 then folds
 * the motif away with `symmetrize` before the engine ever sees it. At half
 * coverage the two measures are the same number, so a photograph is judged as
 * before; below it the rule tightens instead of going blind.
 *
 * The rules are §5's: the strongest reading wins, and anything not recognised
 * stays off rather than being forced on the visitor's drawing.
 */
export function detectSymmetry(m: Mask, tolerance = 0.03, region?: Uint8Array): SymmetrySettings {
	let ones = 0;
	let counted = 0;
	for (let i = 0; i < m.data.length; i++) {
		if (region && !region[i]) continue;
		counted++;
		ones += m.data[i]!;
	}
	const ink = Math.min(ones, counted - ones);
	// A blank mask (and a completely filled one) is symmetric under everything and
	// says nothing about what the visitor wants; switching all three rows on for it
	// would be a guess, so nothing is reported.
	if (!ink) return { ...NO_SYMMETRY };
	// `disagreement` counts both ends of every mismatched pair, and each such pair
	// holds exactly one cell of the minority colour, so this is the share of the ink
	// the transform fails to explain: 0 for an exact symmetry, 1 for a picture as
	// unlike its image as two unrelated drawings with this much ink in them.
	const holds = (t: Transform) =>
		countDisagreement(m, ELEMENTS[t], region).differing / (2 * ink) <= tolerance;
	const mirrored = holds('mirrorX') && holds('mirrorY');
	const lobes: SymmetryMode = holds('transpose') ? 'sym' : holds('antiTranspose') ? 'anti' : 'off';
	const lobe: SymmetryMode = mirrored ? 'sym' : holds('rotate180') ? 'anti' : 'off';
	// Inden i kurve Anti is invisible on the mask, so detection only ever reports Sym.
	const curve: SymmetryMode = mirrored ? 'sym' : 'off';
	return { curve, lobe, lobes };
}

/**
 * The closed group as point maps, for callers that copy a region under every
 * symmetry (see `applySymmetric`). Exported as functions rather than names because
 * the closure can contain quarter turns, which the three rows never name.
 */
export function closedPointMaps(
	transforms: Transform[]
): Array<(x: number, y: number, size: number) => { x: number; y: number }> {
	return closure(transforms).map((e) => (x: number, y: number, size: number) => mapPoint(e, x, y, size));
}
