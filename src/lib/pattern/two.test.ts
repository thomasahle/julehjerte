import { describe, expect, it } from 'vitest';
import { ALL_RULES, edgeClasses, ruleKey, ruleMotions, type GridMotion, type TileRule } from './rules';
import { THREE_GROUP, TWO_GROUP } from './names';

// Which tilings a woven heart's chequerboard can be, all of them: every group of motions of the square
// grid that takes every red tile onto every other, up to turning or mirroring the whole grid and
// swapping its colours. Those with a motion that swaps the colours are Grünbaum and Shephard's
// isohedral types with four tiles at every corner, IH41 to IH76; those that keep the colours, and take
// every white tile onto every other too, are two shapes. Every tiling here repeats within four cells,
// so a group is its motions modulo moves by four: a group of the 128 motions of a 4 × 4 torus.

type Motion = readonly [number, number, number, number, number, number];
const LINEAR: Array<[number, number, number, number]> = [
	[1, 0, 0, 1],
	[-1, 0, 0, -1],
	[0, -1, 1, 0],
	[0, 1, -1, 0],
	[-1, 0, 0, 1],
	[1, 0, 0, -1],
	[0, 1, 1, 0],
	[0, -1, -1, 0]
];
const mod4 = (x: number) => ((x % 4) + 4) % 4;
const MOTIONS: Motion[] = LINEAR.flatMap(([a, b, c, d]) => Array.from({ length: 16 }, (_, k) => [a, b, c, d, Math.floor(k / 4), k % 4] as const));
const index = (m: Motion) => LINEAR.findIndex(([a, b, c, d]) => a === m[0] && b === m[1] && c === m[2] && d === m[3]) * 16 + mod4(m[4]) * 4 + mod4(m[5]);
/** `m`, then `n`. */
const then = (m: Motion, n: Motion): Motion => [
	n[0] * m[0] + n[1] * m[2],
	n[0] * m[1] + n[1] * m[3],
	n[2] * m[0] + n[3] * m[2],
	n[2] * m[1] + n[3] * m[3],
	n[0] * m[4] + n[1] * m[5] + n[4],
	n[2] * m[4] + n[3] * m[5] + n[5]
];
const MUL = MOTIONS.map((m) => MOTIONS.map((n) => index(then(m, n))));
const ID = index([1, 0, 0, 1, 0, 0]);
const INV = MOTIONS.map((_, g) => MOTIONS.findIndex((__, h) => MUL[g]![h] === ID));

/** Where motion `g` takes cell (c, d), modulo four. */
function cellOf(g: number, c: number, d: number): number {
	const [a, b, cc, dd, e, f] = MOTIONS[g]!;
	const corners = [
		[c, d],
		[c + 1, d],
		[c, d + 1],
		[c + 1, d + 1]
	].map(([x, y]) => [a * x! + b * y! + e, cc * x! + dd * y! + f] as const);
	return mod4(Math.min(...corners.map((p) => p[0]))) * 4 + mod4(Math.min(...corners.map((p) => p[1])));
}
const CELL = MOTIONS.map((_, g) => Array.from({ length: 16 }, (__, k) => cellOf(g, Math.floor(k / 4), k % 4)));
const isRed = (k: number) => (Math.floor(k / 4) + (k % 4)) % 2 === 0;

function closure(gens: number[]): Set<number> {
	const group = new Set([ID]);
	const queue = [ID];
	while (queue.length) {
		const x = queue.pop()!;
		for (const g of gens) {
			const y = MUL[x]![g]!;
			if (!group.has(y)) {
				group.add(y);
				queue.push(y);
			}
		}
	}
	return group;
}
const keyOf = (group: Set<number>) => [...group].sort((a, b) => a - b).join(',');
/** The same key for groups that are one another turned, mirrored, moved or with the colours swapped. */
function classOf(group: Set<number>): string {
	let best = '';
	for (let x = 0; x < MOTIONS.length; x++) {
		const key = keyOf(new Set([...group].map((h) => MUL[MUL[INV[x]!]![h]!]![x]!)));
		if (!best || key < best) best = key;
	}
	return best;
}

/** Every subgroup of the 128 motions, as sets. */
function subgroups(): Set<number>[] {
	const found = new Map<string, Set<number>>();
	let layer = MOTIONS.map((_, g) => closure([g]));
	for (const g of layer) found.set(keyOf(g), g);
	while (layer.length) {
		const next: Set<number>[] = [];
		for (const group of layer) {
			for (let g = 0; g < MOTIONS.length; g++) {
				if (group.has(g)) continue;
				const bigger = closure([...group, g]);
				const key = keyOf(bigger);
				if (!found.has(key)) {
					found.set(key, bigger);
					next.push(bigger);
				}
			}
		}
		layer = next;
	}
	return [...found.values()];
}

const motionIndex = (m: GridMotion) => index([m.a, m.b, m.c, m.d, m.e, m.f]);
const groupOf = (rule: TileRule) => closure(ruleMotions(rule).map(motionIndex));
const orbit = (group: Set<number>, k: number) => new Set([...group].map((g) => CELL[g]![k]!));

describe('the tilings a woven heart can be, all of them', () => {
	const groups = subgroups();
	const reds = Array.from({ length: 16 }, (_, k) => k).filter(isRed);
	const whites = Array.from({ length: 16 }, (_, k) => k).filter((k) => !isRed(k));
	const onto = (group: Set<number>, cells: number[]) => {
		const o = orbit(group, cells[0]!);
		return cells.every((k) => o.has(k));
	};
	const swaps = (group: Set<number>) => [...group].some((g) => !isRed(CELL[g]![0]!));

	it("has McLean's 36 types with four tiles at every corner: 28 in the tab, and 8 with every side straight", () => {
		const isohedral = new Map<string, Set<number>>();
		for (const group of groups) if (swaps(group) && onto(group, reds)) isohedral.set(classOf(group), group);
		expect(isohedral.size).toBe(36);
		const ours = ALL_RULES.filter((r) => r.sides !== 'free' && r.sides !== 'two' && r.sides !== 'three').map((rule) => classOf(groupOf(rule)));
		// the three families' rules name some types twice, each pair of opposite sides tied either way round
		expect(new Set(ours).size).toBe(28);
		for (const key of ours) expect(isohedral.has(key)).toBe(true);
		// the eight left out: every side straight, a mirror line of the tiling, so nothing to draw
		const left = [...isohedral.keys()].filter((key) => !ours.includes(key));
		expect(left).toHaveLength(8);
		for (const key of left) {
			const group = isohedral.get(key)!;
			expect(straightOnly([...group].map((g) => MOTIONS[g]!).map(([a, b, c, d, e, f]) => ({ a, b, c, d, e, f })))).toBe(true);
		}
	});

	it('has every way of two shapes, once: the tab offers all eighteen', () => {
		const two = new Set<string>();
		for (const group of groups) if (!swaps(group) && onto(group, reds) && onto(group, whites)) two.add(classOf(group));
		expect(two.size).toBe(18);
		const ours = ALL_RULES.filter((r) => r.sides === 'free' || r.sides === 'two');
		const keys = ours.map((rule) => classOf(groupOf(rule)));
		expect(new Set(keys).size).toBe(ours.length);
		expect(keys.every((key) => two.has(key))).toBe(true);
		expect(ours).toHaveLength(18);
		// and each keeps the colours, and takes every tile onto every other of its colour
		for (const rule of ours) {
			const group = groupOf(rule);
			expect(swaps(group), ruleKey(rule)).toBe(false);
			expect(onto(group, reds) && onto(group, whites), ruleKey(rule)).toBe(true);
			// every one has a side to draw
			expect(edgeClasses(rule).some((c) => c.shape !== 'I'), ruleKey(rule)).toBe(true);
			// and the wallpaper group the tab names
			expect(wallpaper(group), ruleKey(rule)).toBe(rule.sides === 'two' ? TWO_GROUP[rule.n] : 'p1');
		}
	});

	it('has every way of three shapes that keeps the colours, once, red the colour of one kind: the tab offers all ten', () => {
		const orbits = (group: Set<number>) => {
			const seen = new Set<number>();
			const out: Set<number>[] = [];
			for (let k = 0; k < 16; k++) {
				if (seen.has(k)) continue;
				const o = orbit(group, k);
				o.forEach((c) => seen.add(c));
				out.push(o);
			}
			return out;
		};
		const three = new Set<string>();
		for (const group of groups) if (!swaps(group) && orbits(group).length === 3) three.add(classOf(group));
		expect(three.size).toBe(10);
		const ours = ALL_RULES.filter((r) => r.sides === 'three');
		const keys = ours.map((rule) => classOf(groupOf(rule)));
		expect(new Set(keys).size).toBe(10);
		expect(keys.every((key) => three.has(key))).toBe(true);
		for (const rule of ours) {
			const group = groupOf(rule);
			const o = orbits(group);
			expect(swaps(group), ruleKey(rule)).toBe(false);
			// red one kind, every side bordering one; white two, the tiles beside the red one's lower sides one of each
			expect(onto(group, reds), ruleKey(rule)).toBe(true);
			expect(orbit(group, 4).has(1), ruleKey(rule)).toBe(false);
			expect(edgeClasses(rule).some((c) => c.shape !== 'I'), ruleKey(rule)).toBe(true);
			expect(wallpaper(group), ruleKey(rule)).toBe(rule.sides === 'three' ? THREE_GROUP[rule.n] : '');
			expect(o).toHaveLength(3);
		}
	});
});

/**
 * A group's wallpaper group: its turns (none, half, quarter), and of its mirrors, which are mirror lines,
 * with points they keep, and which only glide. A mirror keeps points where some move of the group along
 * its line undoes the move it makes along it.
 */
function wallpaper(group: Set<number>): string {
	const motions = [...group].map((g) => MOTIONS[g]!);
	const moves = motions.filter((m) => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1);
	const kinds = new Map<string, Motion[]>();
	for (const m of motions) {
		const name = m[1] === 0 && m[2] === 0 ? (m[0] === m[3] ? (m[0] === 1 ? 'id' : 'half') : 'mirror-' + (m[0] === -1 ? 'x' : 'y')) : m[1] === -m[2] ? 'quarter' : 'mirror-' + (m[1] === 1 ? 'd' : 'a');
		kinds.set(name, [...(kinds.get(name) ?? []), m]);
	}
	// the direction along each mirror's line, and whether a move of the group along it undoes the mirror's own
	const along: Record<string, [number, number]> = { 'mirror-x': [0, 1], 'mirror-y': [1, 0], 'mirror-d': [1, 1], 'mirror-a': [1, -1] };
	const keeps = (m: Motion, [u, v]: [number, number]) => moves.some((t) => mod4((m[4] + t[4]) * u + (m[5] + t[5]) * v) === 0);
	const mirrors = Object.keys(along).filter((k) => kinds.has(k));
	const lines = mirrors.filter((k) => kinds.get(k)!.some((m) => keeps(m, along[k]!)));
	const glides = mirrors.filter((k) => kinds.get(k)!.some((m) => !keeps(m, along[k]!)));
	const turn = kinds.has('quarter') ? '4' : kinds.has('half') ? '2' : '1';
	if (!mirrors.length) return `p${turn}`;
	if (turn === '4') return lines.length === mirrors.length ? 'p4m' : 'p4g';
	if (turn === '2') return lines.length === 2 ? (glides.length ? 'cmm' : 'pmm') : lines.length === 1 ? 'pmg' : 'pgg';
	return lines.length ? (glides.length ? 'cm' : 'pm') : 'pg';
}

/**
 * Whether every side of the tiling a whole group of motions makes is straight: as `ruleEdges` says, a side
 * some motion takes onto itself with its sides swapped but not run the other way (a mirror along it), or
 * both turned half round about its middle and mirrored across it.
 */
function straightOnly(group: GridMotion[]): boolean {
	const same = (u: { x: number; y: number }, v: { x: number; y: number }) => mod4(u.x) === mod4(v.x) && mod4(u.y) === mod4(v.y);
	const stretches: Array<['V' | 'H', number, number]> = [];
	for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) stretches.push(['V', i, j], ['H', i, j]);
	return stretches.every(([kind, i, j]) => {
		const end = kind === 'V' ? { x: i, y: j + 1 } : { x: i + 1, y: j };
		const self = new Set<string>();
		for (const m of group) {
			const p = { x: m.a * i + m.b * j + m.e, y: m.c * i + m.d * j + m.f };
			const q = { x: m.a * end.x + m.b * end.y + m.e, y: m.c * end.x + m.d * end.y + m.f };
			const reversed = same(p, end) && same(q, { x: i, y: j });
			if (!reversed && !(same(p, { x: i, y: j }) && same(q, end))) continue;
			const normal = kind === 'V' ? { x: m.a, y: m.c } : { x: m.b, y: m.d };
			const flipped = kind === 'V' ? normal.x < 0 : normal.y < 0;
			self.add(`${reversed ? 'r' : ''}${flipped ? 'n' : ''}`);
		}
		return self.has('n') || (self.has('rn') && self.has('r'));
	});
}
