import { describe, expect, it } from 'vitest';
import { ambientSwitch } from './ambient';

describe('ambientSwitch', () => {
	it('is on only for what is built inside during', () => {
		const ways = ambientSwitch();
		expect(ways.on).toBe(false);
		expect(ways.during(() => ways.on)).toBe(true);
		expect(ways.on).toBe(false);
	});

	it('is as it was after a build that throws', () => {
		const ways = ambientSwitch();
		expect(() => ways.during(() => { throw new Error('refused'); })).toThrow('refused');
		expect(ways.on).toBe(false);
	});

	it('stays on until the outermost build ends', () => {
		const ways = ambientSwitch();
		const seen = ways.during(() => {
			const inner = ways.during(() => ways.on);
			return [inner, ways.on];
		});
		expect(seen).toEqual([true, true]);
		expect(ways.on).toBe(false);
	});

	it('works with during passed on by itself', () => {
		const ways = ambientSwitch(), { during } = ways;
		expect(during(() => ways.on)).toBe(true);
	});

	it('keeps switches apart', () => {
		const one = ambientSwitch(), other = ambientSwitch();
		expect(one.during(() => other.on)).toBe(false);
	});
});
