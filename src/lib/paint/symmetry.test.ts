import { describe, it, expect } from 'vitest';
import { cloneMask, createMask, get, type Mask } from './mask';
import {
	applyTransform,
	closedPointMaps,
	detectSymmetry,
	disagreement,
	NO_SYMMETRY,
	symmetrize,
	transformsFor,
	type SymmetrySettings,
	type Transform
} from './symmetry';

const NAMED: Transform[] = ['transpose', 'antiTranspose', 'mirrorX', 'mirrorY', 'rotate180'];

/** Deterministic noise: the same "random" mask on every machine and every run. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function noisyMask(size: number, seed = 1): Mask {
	const random = mulberry32(seed);
	const m = createMask(0, size);
	for (let i = 0; i < m.data.length; i++) m.data[i] = random() < 0.5 ? 1 : 0;
	return m;
}

/** Flip a fixed fraction of the cells, deterministically. */
function addNoise(m: Mask, fraction: number, seed = 7): void {
	const random = mulberry32(seed);
	for (let i = 0; i < m.data.length; i++) {
		if (random() < fraction) m.data[i] = m.data[i] ? 0 : 1;
	}
}

/** A small rectangle painted off centre: a motif with no symmetry and very little ink. */
function blob(size: number): Mask {
	const m = createMask(0, size);
	const x1 = Math.round(size * 0.2);
	const y1 = Math.round(size * 0.22);
	for (let y = Math.round(size * 0.15); y < y1; y++) {
		for (let x = Math.round(size * 0.1); x < x1; x++) m.data[y * size + x] = 1;
	}
	return m;
}

/** A mask that is symmetric under transpose but under nothing else. */
function transposeSymmetric(size: number): Mask {
	const m = createMask(0, size);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			// Depends on x + y and on x·y only through symmetric terms, so (x, y) and
			// (y, x) agree while the mirrors and the half turn do not.
			m.data[y * size + x] = (x * y) % 7 < 3 || x + y < size / 4 ? 1 : 0;
		}
	}
	return m;
}

describe('transformsFor', () => {
	it('follows the table for each row', () => {
		expect(transformsFor({ curve: 'off', lobe: 'off', lobes: 'sym' })).toEqual(['transpose']);
		expect(transformsFor({ curve: 'off', lobe: 'off', lobes: 'anti' })).toEqual(['antiTranspose']);
		expect(transformsFor({ curve: 'off', lobe: 'sym', lobes: 'off' })).toEqual(['mirrorX', 'mirrorY']);
		expect(transformsFor({ curve: 'off', lobe: 'anti', lobes: 'off' })).toEqual(['rotate180']);
		expect(transformsFor({ curve: 'sym', lobe: 'off', lobes: 'off' })).toEqual(['mirrorX', 'mirrorY']);
	});

	it('has nothing to say about Inden i kurve Anti, which lives on the cuts', () => {
		expect(transformsFor({ curve: 'anti', lobe: 'off', lobes: 'off' })).toEqual([]);
		expect(transformsFor({ curve: 'off', lobe: 'off', lobes: 'off' })).toEqual([]);
	});

	it('deduplicates the mirrors the two rows share', () => {
		expect(transformsFor({ curve: 'sym', lobe: 'sym', lobes: 'sym' })).toEqual([
			'transpose',
			'mirrorX',
			'mirrorY'
		]);
	});
});

describe('applyTransform', () => {
	it('maps the corners the way the table says', () => {
		expect(applyTransform('transpose', 1, 3, 10)).toEqual({ x: 3, y: 1 });
		expect(applyTransform('antiTranspose', 1, 3, 10)).toEqual({ x: 6, y: 8 });
		expect(applyTransform('mirrorX', 1, 3, 10)).toEqual({ x: 8, y: 3 });
		expect(applyTransform('mirrorY', 1, 3, 10)).toEqual({ x: 1, y: 6 });
		expect(applyTransform('rotate180', 1, 3, 10)).toEqual({ x: 8, y: 6 });
	});

	it('is its own inverse for every one of the five', () => {
		for (const t of NAMED) {
			const once = applyTransform(t, 2, 5, 16);
			expect(applyTransform(t, once.x, once.y, 16)).toEqual({ x: 2, y: 5 });
		}
	});
});

describe('the group the rows generate', () => {
	/** Where (1, 3) of a 10-cell mask lands under every symmetry the transforms close over. */
	function images(settings: SymmetrySettings): Set<string> {
		return new Set(
			closedPointMaps(transformsFor(settings)).map((map) => {
				const p = map(1, 3, 10);
				return `${p.x},${p.y}`;
			})
		);
	}

	it('closes transpose and the mirrors into all eight symmetries of the square', () => {
		// Painting has to cover the quarter turns too, and no row names one: they only
		// exist as compositions of the rows that are on.
		const all = images({ curve: 'sym', lobe: 'sym', lobes: 'sym' });
		expect(all.size).toBe(7); // the eight, without the identity
		for (const t of NAMED) {
			const p = applyTransform(t, 1, 3, 10);
			expect(all.has(`${p.x},${p.y}`)).toBe(true);
		}
		expect(all.has('6,1')).toBe(true); // a quarter turn clockwise
		expect(all.has('3,8')).toBe(true); // and anticlockwise
	});

	it('closes each row on its own', () => {
		// Mellem lapper Sym is a single reflection; Inden i lap Sym is two, and they
		// compose into the half turn.
		expect(images({ curve: 'off', lobe: 'off', lobes: 'sym' }).size).toBe(1);
		expect(images({ curve: 'off', lobe: 'sym', lobes: 'off' })).toEqual(
			new Set(['8,3', '1,6', '8,6'])
		);
		expect(images({ curve: 'off', lobe: 'off', lobes: 'off' }).size).toBe(0);
	});

	it('finds the transpose hidden behind two anti-symmetries', () => {
		const both = images({ curve: 'off', lobe: 'anti', lobes: 'anti' });
		const transposed = applyTransform('transpose', 1, 3, 10);
		expect(both.has(`${transposed.x},${transposed.y}`)).toBe(true);
	});
});

describe('detectSymmetry', () => {
	it('finds transpose on a mask built to have it, and nothing else', () => {
		expect(detectSymmetry(transposeSymmetric(100))).toEqual({
			curve: 'off',
			lobe: 'off',
			lobes: 'sym'
		});
	});

	it('finds nothing in noise', () => {
		expect(detectSymmetry(noisyMask(100))).toEqual({ curve: 'off', lobe: 'off', lobes: 'off' });
	});

	it('finds nothing in a small motif drawn off centre', () => {
		// The blob covers under 1% of the square, so it agrees with every one of its
		// images on 98% of the cells. Counted over the square that reads as all three
		// rows found — and §5 would then fold the visitor's motif away before solving.
		expect(detectSymmetry(blob(200))).toEqual(NO_SYMMETRY);
	});

	it('finds the symmetry of a small motif that has one', () => {
		// The answer to a sparse mask is not to give up on it: the same blob, painted
		// with its transpose, is still recognised however little of the square it covers.
		const m = blob(200);
		symmetrize(m, ['transpose']);
		expect(detectSymmetry(m)).toEqual({ curve: 'off', lobe: 'off', lobes: 'sym' });
	});

	it('finds nothing on a mask with nothing painted on it', () => {
		// Straight after Ryd, and again on a mask painted solid: no picture, no symmetry.
		expect(detectSymmetry(createMask(0, 64))).toEqual(NO_SYMMETRY);
		expect(detectSymmetry(createMask(1, 64))).toEqual(NO_SYMMETRY);
	});

	it('reads a fully symmetric mask as all three rows', () => {
		const m = noisyMask(64, 3);
		symmetrize(m, ['transpose', 'mirrorX', 'mirrorY']);
		expect(detectSymmetry(m)).toEqual({ curve: 'sym', lobe: 'sym', lobes: 'sym' });
	});

	it('reports the half turn as Inden i lap Anti when the mirrors do not hold', () => {
		const m = noisyMask(64, 5);
		symmetrize(m, ['rotate180']);
		const found = detectSymmetry(m);
		expect(found.lobe).toBe('anti');
		expect(found.curve).toBe('off');
	});

	it('forgives a photograph its imperfections but not a different picture', () => {
		const base = transposeSymmetric(100);

		const slightly = cloneMask(base);
		addNoise(slightly, 0.01);
		expect(disagreement(slightly, 'transpose')).toBeLessThanOrEqual(0.03);
		expect(detectSymmetry(slightly).lobes).toBe('sym');

		const heavily = cloneMask(base);
		addNoise(heavily, 0.1);
		expect(disagreement(heavily, 'transpose')).toBeGreaterThan(0.03);
		expect(detectSymmetry(heavily).lobes).toBe('off');
		// The threshold is the argument, not a constant baked into the rules.
		expect(detectSymmetry(heavily, 0.25).lobes).toBe('sym');
	});
});

describe('symmetrize', () => {
	it('makes the mask exactly symmetric under every generator', () => {
		const m = noisyMask(48, 11);
		const transforms = transformsFor({ curve: 'off', lobe: 'sym', lobes: 'sym' });
		symmetrize(m, transforms);
		for (const t of NAMED) expect(disagreement(m, t)).toBe(0);
	});

	it('changes nothing the second time', () => {
		const m = noisyMask(48, 13);
		symmetrize(m, ['transpose', 'mirrorX']);
		const once = cloneMask(m);
		symmetrize(m, ['transpose', 'mirrorX']);
		expect([...m.data]).toEqual([...once.data]);
	});

	it('leaves the mask alone when no symmetry is asked for', () => {
		const m = noisyMask(32, 17);
		const before = cloneMask(m);
		symmetrize(m, []);
		expect([...m.data]).toEqual([...before.data]);
	});

	it('takes each orbit by majority, and a tie by the first cell in row order', () => {
		// Under both mirrors every orbit is four cells, one in each quarter. The fold
		// has to be a vote, not a union: painting the symmetric answer as the union of
		// the four would thicken every stroke into all its images and turn a
		// photograph's few per cent of noise into speckle. Nor is it an intersection,
		// which would rub out a stroke the visitor drew before symmetry came on.
		const m = createMask(0, 8);
		const settings: SymmetrySettings = { curve: 'off', lobe: 'sym', lobes: 'off' };
		const quarters = (x: number, y: number) => [
			[x, y],
			[7 - x, y],
			[x, 7 - y],
			[7 - x, 7 - y]
		];
		const paint = (cells: number[][]) => {
			for (const [x, y] of cells) m.data[y! * 8 + x!] = 1;
		};
		// One of four: the minority loses. Three of four: the majority fills the fourth,
		// whether or not the first cell of the orbit is one of the three — the vote is
		// counted, not read off whichever cell the scan happens to reach first.
		paint(quarters(1, 1).slice(1, 2));
		paint(quarters(2, 1).slice(0, 3));
		paint(quarters(2, 2).slice(1));
		// Two of four, twice: the tie goes to the cell symmetrize reaches first, which
		// is the one with the smallest row-major index — (3,1) here, and (1,2) there.
		paint([quarters(3, 1)[1]!, quarters(3, 1)[2]!]);
		paint([quarters(1, 2)[0]!, quarters(1, 2)[3]!]);

		symmetrize(m, transformsFor(settings));

		for (const [x, y] of quarters(1, 1)) expect(get(m, x!, y!)).toBe(0);
		for (const [x, y] of quarters(2, 1)) expect(get(m, x!, y!)).toBe(1);
		for (const [x, y] of quarters(2, 2)) expect(get(m, x!, y!)).toBe(1);
		for (const [x, y] of quarters(3, 1)) expect(get(m, x!, y!)).toBe(0);
		for (const [x, y] of quarters(1, 2)) expect(get(m, x!, y!)).toBe(1);
	});
});

describe('a region: the protected motif of a free band', () => {
	/** The middle of an 8-cell square, as `$lib/paint/frame` would mark it. */
	function middle(size: number, inset: number): Uint8Array {
		const region = new Uint8Array(size * size);
		for (let y = inset; y < size - inset; y++) {
			for (let x = inset; x < size - inset; x++) region[y * size + x] = 1;
		}
		return region;
	}

	it('folds inside it and leaves the band exactly as it was', () => {
		const m = createMask(0, 8);
		const region = middle(8, 2);
		// One cell inside the motif, off the mirror line, and one in the band.
		m.data[2 * 8 + 2] = 1;
		m.data[0 * 8 + 1] = 1;
		symmetrize(m, ['mirrorX'], region);
		// The motif is mirrored …
		expect(get(m, 5, 2)).toBe(1);
		// … and the band is not: its cell keeps its colour and gains no image.
		expect(get(m, 1, 0)).toBe(1);
		expect(get(m, 6, 0)).toBe(0);
	});

	it('judges symmetry on the motif alone', () => {
		const m = createMask(0, 8);
		const region = middle(8, 2);
		// A motif that is exactly transpose-symmetric …
		for (const [x, y] of [
			[2, 3],
			[3, 2],
			[4, 4]
		]) {
			m.data[y! * 8 + x!] = 1;
		}
		expect(detectSymmetry(m, 0.03, region).lobes).toBe('sym');
		// … under a band that is not symmetric at all.
		for (let x = 0; x < 8; x++) m.data[x] = 1;
		expect(detectSymmetry(m, 0.03).lobes).toBe('off');
		expect(detectSymmetry(m, 0.03, region).lobes).toBe('sym');
	});
});
