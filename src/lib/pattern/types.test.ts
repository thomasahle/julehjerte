import { describe, expect, it } from 'vitest';
import { andThen, edgeClasses, moveBy, neighbours, ofType, opposite, ruleMotions, stretchSource, type EdgeShape, type GridMotion, type TileRule, type TypeNumber } from './tiling';

// Every type a woven heart can make has to be the type it says it is. Kaplan's Tactile lists, for
// each of Grünbaum and Shephard's isohedral types, what each side of the tile can be (J any shape,
// S its own S, U its own mirror image, I straight), which sides share a shape, and how many ways
// round the tiles lie (aspects); McLean's templates say what symmetry the tile has of its own.
// The motions that make each of our tilings have to give all three.

/** `mirrored`: Tactile's first orientation flag per side; two sides of one shape whose flags differ are mirror images of each other. */
const TACTILE: Record<number, { edges: string; ids: number[]; aspects: number; mirrored: string }> = {
	41: { edges: 'JJJJ', ids: [0, 1, 0, 1], aspects: 1, mirrored: 'ffff' },
	43: { edges: 'JJJJ', ids: [0, 1, 0, 1], aspects: 2, mirrored: 'ffft' },
	44: { edges: 'JJJJ', ids: [0, 0, 1, 1], aspects: 2, mirrored: 'ftft' },
	46: { edges: 'SSSS', ids: [0, 1, 2, 3], aspects: 2, mirrored: 'ffff' },
	47: { edges: 'JSJS', ids: [0, 1, 0, 2], aspects: 2, mirrored: 'ffff' },
	51: { edges: 'JSJS', ids: [0, 1, 0, 2], aspects: 4, mirrored: 'fftf' },
	52: { edges: 'JJJJ', ids: [0, 1, 0, 1], aspects: 4, mirrored: 'fftt' },
	55: { edges: 'JJJJ', ids: [0, 0, 1, 1], aspects: 4, mirrored: 'ffff' },
	73: { edges: 'UUUU', ids: [0, 0, 0, 0], aspects: 2, mirrored: 'ffff' },
	42: { edges: 'JIJI', ids: [0, 1, 0, 2], aspects: 2, mirrored: 'ffff' },
	45: { edges: 'JIJI', ids: [0, 1, 0, 2], aspects: 2, mirrored: 'fftf' },
	49: { edges: 'ISIS', ids: [0, 1, 2, 3], aspects: 4, mirrored: 'ffff' },
	50: { edges: 'JIJS', ids: [0, 1, 0, 2], aspects: 4, mirrored: 'ffff' },
	53: { edges: 'JJSS', ids: [0, 0, 1, 2], aspects: 4, mirrored: 'ftff' },
	54: { edges: 'IIIS', ids: [0, 1, 2, 3], aspects: 4, mirrored: 'ffff' },
	56: { edges: 'JJII', ids: [0, 0, 1, 2], aspects: 8, mirrored: 'ffff' },
	57: { edges: 'SSSS', ids: [0, 1, 0, 1], aspects: 1, mirrored: 'ffff' },
	58: { edges: 'SISI', ids: [0, 1, 0, 1], aspects: 2, mirrored: 'ffff' },
	59: { edges: 'JJJJ', ids: [0, 0, 0, 0], aspects: 2, mirrored: 'ftft' },
	61: { edges: 'JJJJ', ids: [0, 0, 0, 0], aspects: 2, mirrored: 'ffff' },
	62: { edges: 'SSSS', ids: [0, 0, 0, 0], aspects: 1, mirrored: 'ffff' },
	64: { edges: 'UIUI', ids: [0, 1, 0, 1], aspects: 1, mirrored: 'ffft' },
	66: { edges: 'USUS', ids: [0, 1, 0, 1], aspects: 2, mirrored: 'ffft' },
	67: { edges: 'SISI', ids: [0, 1, 0, 2], aspects: 2, mirrored: 'fftf' },
	68: { edges: 'JJJJ', ids: [0, 0, 0, 0], aspects: 1, mirrored: 'ftft' },
	69: { edges: 'SSSS', ids: [0, 0, 1, 1], aspects: 2, mirrored: 'ftft' },
	71: { edges: 'JJJJ', ids: [0, 0, 0, 0], aspects: 4, mirrored: 'fftt' },
	74: { edges: 'SSSS', ids: [0, 0, 0, 0], aspects: 1, mirrored: 'ftft' }
};

/** The tile's own symmetry, as McLean's dog shows it. */
type Own = 'none' | 'half turn' | 'quarter turn' | 'mirror' | 'two mirrors';
const OWN: Record<number, Own> = {
	57: 'half turn',
	58: 'half turn',
	59: 'half turn',
	61: 'half turn',
	62: 'quarter turn',
	64: 'mirror',
	66: 'mirror',
	67: 'mirror',
	68: 'mirror',
	69: 'mirror',
	71: 'mirror',
	73: 'two mirrors',
	74: 'two mirrors'
};

/** Our rules by type number: the three families', and the others. */
const RULES: Record<number, TileRule> = {
	41: opposite('move', 'move'),
	43: opposite('move', 'mirror'),
	44: neighbours('mirror'),
	46: opposite('turn', 'turn'),
	47: opposite('move', 'turn'),
	51: opposite('mirror', 'turn'),
	52: opposite('mirror', 'mirror'),
	55: neighbours('turn'),
	73: neighbours('both'),
	...Object.fromEntries([42, 45, 49, 50, 53, 54, 56, 57, 58, 59, 61, 62, 64, 66, 67, 68, 69, 71, 74].map((n) => [n, ofType(n as TypeNumber)]))
};

/** The sides as Tactile counts them, once round the tile: from the top corner, right, down, left, up. */
const ROUND: Array<'ne' | 'se' | 'sw' | 'nw'> = ['ne', 'se', 'sw', 'nw'];

/**
 * A tile's sides as (shape, which shape, mirrored) triples, read as a string: the shapes renamed by
 * first appearance, and for every two sides of one J shape whether they are mirror images of each
 * other (only J sides are tied by one motion alone), so equal tiles read equal.
 */
const canonical = (sides: Array<[string, number, boolean]>) => {
	const names = new Map<number, number>();
	const shapes = sides.map(([shape, id]) => `${shape}${names.get(id) ?? names.set(id, names.size).get(id)}`).join(' ');
	const pairs = sides.flatMap(([shape, id, m], k) =>
		sides.slice(k + 1).flatMap(([, id2, m2], d) => (shape === 'J' && id === id2 ? [`${k}-${k + 1 + d}:${m !== m2 ? 'mirrored' : 'same'}`] : []))
	);
	return `${shapes} | ${pairs.join(' ')}`;
};
/** All eight ways of reading a tile's sides: from any side, either way round. */
const readings = (sides: Array<[string, number, boolean]>) =>
	[sides, [...sides].reverse()].flatMap((s) => s.map((_, k) => canonical([...s.slice(k), ...s.slice(0, k)])));

/** The motions of the tiling, each once, their moves taken modulo four cells: every tiling here repeats within four. */
function group(motions: GridMotion[]): GridMotion[] {
	const mod4 = (v: number) => ((Math.round(v * 2) % 8) + 8) % 8;
	const key = (m: GridMotion) => [m.a, m.b, m.c, m.d, mod4(m.e), mod4(m.f)].join(',');
	const seen = new Map<string, GridMotion>([[key({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }]]);
	const queue = [...seen.values()];
	while (queue.length) {
		const m = queue.shift()!;
		for (const g of motions) {
			const n = andThen(m, g);
			const reduced = { ...n, e: (((n.e % 4) + 4) % 4), f: (((n.f % 4) + 4) % 4) };
			if (!seen.has(key(reduced))) {
				seen.set(key(reduced), reduced);
				queue.push(reduced);
			}
		}
	}
	return [...seen.values()];
}

describe('the types a woven heart makes', () => {
	it.each(Object.keys(RULES).map((n) => [Number(n)]))('IH%i is the type it says it is', (n) => {
		const rule = RULES[n]!;
		const classes = edgeClasses(rule);
		// Whether a side's curve lies mirrored, against the class's own: its frame's handedness (a
		// vertical stretch's frame is mirrored against a horizontal one's) times its flips.
		const STRETCH = { nw: ['V', 0, 0], ne: ['H', 0, 0], se: ['V', 1, 0], sw: ['H', 0, 1] } as const;
		const ours: Array<[string, number, boolean]> = ROUND.map((side) => {
			const k = classes.findIndex((c) => c.sides.includes(side));
			const [kind, i, j] = STRETCH[side];
			const src = stretchSource(rule, kind, i, j);
			return [classes[k]!.shape, k, (kind === 'V') !== (src.reverse !== src.negate)];
		});
		const theirs: Array<[string, number, boolean]> = [...TACTILE[n]!.edges].map((shape, k) => [shape as EdgeShape, TACTILE[n]!.ids[k]!, TACTILE[n]!.mirrored[k] === 't']);
		expect(readings(theirs), `IH${n}: ours ${canonical(ours)}`).toContain(canonical(ours));

		const motions = group(ruleMotions(rule));
		// Every cell is a tile, red or white: the motions take the red tile everywhere.
		const centre = { x: 0.5, y: 0.5 };
		const cells = new Set(motions.map((m) => moveBy(m, centre)).map((p) => `${(((Math.floor(p.x) % 4) + 4) % 4)},${(((Math.floor(p.y) % 4) + 4) % 4)}`));
		expect(cells.size, `IH${n} cells reached`).toBe(16);
		// The ways round: the turns and mirrors the motions make, over the ones that keep the red tile in place.
		const keeps = motions.filter((m) => {
			const p = moveBy(m, centre);
			return (((p.x - 0.5) % 4) + 4) % 4 < 1e-9 && (((p.y - 0.5) % 4) + 4) % 4 < 1e-9;
		});
		const turns = (ms: GridMotion[]) => new Set(ms.map((m) => [m.a, m.b, m.c, m.d].join(','))).size;
		expect(turns(motions) / turns(keeps), `IH${n} aspects`).toBe(TACTILE[n]!.aspects);
		// The tile's own symmetry.
		const own = keeps.map((m) => [m.a, m.b, m.c, m.d].join(','));
		const mirrors = keeps.filter((m) => m.a * m.d - m.b * m.c < 0).length;
		const kind: Own =
			keeps.length === 1 ? 'none' : mirrors === 0 ? (own.includes('0,-1,1,0') ? 'quarter turn' : 'half turn') : mirrors === 1 ? 'mirror' : 'two mirrors';
		expect(kind, `IH${n} own symmetry`).toBe(OWN[n] ?? 'none');
	});
});
