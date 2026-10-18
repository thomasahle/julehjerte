import { describe, expect, it } from 'vitest';
import type { Vec } from '$lib/types/heart';
import { ALL_RULES, moveBy, ruleKey, ruleMotions, type SideLink, type StretchKind, type TileRule } from './tiling';
import { arrowheadsOn, templateOf } from './template';

// A template's half arrowheads say how the rule ties the red tile's sides. These tests hold them to
// it: the motion each tie names takes the arrowheads on one side onto those on the other.

type Side = 'nw' | 'ne' | 'se' | 'sw';
type Corner = 'top' | 'right' | 'bottom' | 'left';
type Tie =
	| { kind: 'move' | 'mirror' | 'own-mirror'; sides: [Side, Side] }
	| { kind: 'half'; side: Side }
	| { kind: 'quarter'; sides: [Side, Side]; corner: Corner };

/**
 * How each rule ties the red tile's sides, from the Escher tab's words: a pair of opposite sides moved
 * or mirrored across the tile, or each its own S; the two left sides and the two right ones mirror
 * images, or turned a quarter about the corner they share; tied both ways, both turns, and the tile
 * its own mirror image across the lines through the middles of opposite sides.
 */
function ties(rule: TileRule): Tie[] {
	// McLean's other types are held to their motions below
	if (rule.sides === 'free' || rule.sides === 'type') return [];
	if (rule.sides === 'opposite') {
		const pair = (link: SideLink, sides: [Side, Side]): Tie[] => (link === 'turn' ? sides.map((side): Tie => ({ kind: 'half', side })) : [{ kind: link, sides }]);
		return [...pair(rule.v, ['nw', 'se']), ...pair(rule.h, ['ne', 'sw'])];
	}
	const left = { sides: ['nw', 'sw'] as [Side, Side], corner: 'left' as const };
	const right = { sides: ['ne', 'se'] as [Side, Side], corner: 'right' as const };
	if (rule.link === 'mirror') return [left, right].map((p): Tie => ({ kind: 'mirror', sides: p.sides }));
	const turns = [left, right].map((p): Tie => ({ kind: 'quarter', ...p }));
	if (rule.link === 'turn') return turns;
	return [...turns, { kind: 'own-mirror', sides: ['nw', 'se'] }, { kind: 'own-mirror', sides: ['ne', 'sw'] }];
}

const MID: Record<Side, Vec> = { nw: { x: 0, y: 0.5 }, ne: { x: 0.5, y: 0 }, se: { x: 1, y: 0.5 }, sw: { x: 0.5, y: 1 } };
const CORNER: Record<Corner, Vec> = { top: { x: 0, y: 0 }, right: { x: 1, y: 0 }, bottom: { x: 1, y: 1 }, left: { x: 0, y: 1 } };

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const unit = (a: Vec): Vec => {
	const l = Math.hypot(a.x, a.y);
	return { x: a.x / l, y: a.y / l };
};
const reflect = (o: Vec, u: Vec) => (p: Vec) => {
	const r = sub(p, o);
	const along = r.x * u.x + r.y * u.y;
	const across = -r.x * u.y + r.y * u.x;
	return { x: o.x + along * u.x + across * u.y, y: o.y + along * u.y - across * u.x };
};
const rotate = (o: Vec, angle: number) => (p: Vec) => {
	const r = sub(p, o);
	const [c, s] = [Math.cos(angle), Math.sin(angle)];
	return { x: o.x + r.x * c - r.y * s, y: o.y + r.x * s + r.y * c };
};

/** A set of triangles, as a string that does not depend on their order or their corners'. */
const key = (triangles: Vec[][]) =>
	triangles
		.map((t) =>
			t
				.map((p) => `${(Math.round(p.x * 1e6) / 1e6 + 0).toFixed(6)},${(Math.round(p.y * 1e6) / 1e6 + 0).toFixed(6)}`)
				.sort()
				.join(' ')
		)
		.sort()
		.join(' | ');
const moved = (triangles: Vec[][], f: (p: Vec) => Vec) => triangles.map((t) => t.map(f));

describe('McLean templates', () => {
	it('puts the arrowheads where the rule ties the sides', () => {
		for (const rule of ALL_RULES) {
			const template = templateOf(rule);
			const heads = (s: Side) => template.find((x) => x.side === s)!.arrowheads;
			const all = template.flatMap((s) => s.arrowheads);
			for (const tie of ties(rule)) {
				const where = `${ruleKey(rule)} ${tie.kind}`;
				if (tie.kind === 'half') {
					expect(heads(tie.side), where).toHaveLength(2);
					expect(key(moved(heads(tie.side), rotate(MID[tie.side], Math.PI))), where).toBe(key(heads(tie.side)));
				} else if (tie.kind === 'quarter') {
					const [a, b] = tie.sides;
					const turns = [Math.PI / 2, -Math.PI / 2].map((angle) => key(moved(heads(a), rotate(CORNER[tie.corner], angle))));
					expect(turns, where).toContain(key(heads(b)));
				} else {
					const [a, b] = tie.sides;
					const shift = sub(MID[b], MID[a]);
					const u = unit(shift);
					if (tie.kind === 'move') expect(key(moved(heads(a), (p) => add(p, shift))), where).toBe(key(heads(b)));
					if (tie.kind === 'mirror') expect(key(moved(heads(a), (p) => add(reflect(MID[a], u)(p), shift))), where).toBe(key(heads(b)));
					if (tie.kind === 'own-mirror') expect(key(moved(all, reflect(MID[a], u))), where).toBe(key(all));
				}
			}
		}
	});

	it("moves every arrowhead, with every motion of the rule's tiling, onto the arrowheads of the side it lands on", () => {
		const SIDES: Array<[StretchKind, number, number]> = [
			['V', 0, 0],
			['H', 0, 0],
			['V', 1, 0],
			['H', 0, 1]
		];
		for (const rule of ALL_RULES) {
			for (const m of ruleMotions(rule)) {
				for (const [kind, i, j] of SIDES) {
					// where the motion takes the side: its two ends, the lower first
					const [a, b] = [moveBy(m, { x: i, y: j }), moveBy(m, kind === 'V' ? { x: i, y: j + 1 } : { x: i + 1, y: j })];
					const vertical = Math.abs(a.x - b.x) < 1e-9;
					const low = vertical ? (a.y < b.y ? a : b) : a.x < b.x ? a : b;
					const there = arrowheadsOn(rule, vertical ? 'V' : 'H', Math.round(low.x), Math.round(low.y));
					expect(key(moved(arrowheadsOn(rule, kind, i, j), (p) => moveBy(m, p))), `${ruleKey(rule)} ${kind}(${i}, ${j})`).toBe(key(there));
				}
			}
		}
	});

	it('draws every rule differently', () => {
		const drawings = ALL_RULES.map((rule) =>
			templateOf(rule)
				.map((s) => `${s.side}:${s.curve}:${key(s.arrowheads)}`)
				.join(' / ')
		);
		expect(new Set(drawings).size).toBe(ALL_RULES.length);
	});
});
