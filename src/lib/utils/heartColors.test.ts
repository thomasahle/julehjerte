import { describe, it, expect } from 'vitest';
import { dampenColors, parseHeartColors, parseHexColor, toHexColor, toHexColors } from './heartColors';

describe('parseHexColor', () => {
	it('accepts #rrggbb and lowercases it', () => {
		expect(parseHexColor('#B91313')).toBe('#b91313');
		expect(parseHexColor('  #ffffff  ')).toBe('#ffffff');
	});

	it('expands the #rgb shorthand', () => {
		expect(parseHexColor('#f0a')).toBe('#ff00aa');
	});

	it('rejects everything that is not a hex colour', () => {
		for (const bad of [
			'red',
			'rgb(185, 19, 19)',
			'#12345',
			'#gggggg',
			'#fff;',
			'url(#x)',
			'"/><script>alert(1)</script>',
			'',
			42,
			null,
			undefined,
			{ left: '#fff' }
		]) {
			expect(parseHexColor(bad), String(bad)).toBeNull();
		}
	});
});

describe('parseHeartColors', () => {
	it('reads a valid pair', () => {
		expect(parseHeartColors({ left: '#FFF', right: '#b91313' })).toEqual({
			left: '#ffffff',
			right: '#b91313'
		});
	});

	it('ignores extra fields', () => {
		expect(parseHeartColors({ left: '#ffffff', right: '#000000', middle: '#123456' })).toEqual({
			left: '#ffffff',
			right: '#000000'
		});
	});

	it('rejects a half or invalid pair, so the heart falls back to the site colours', () => {
		for (const bad of [
			undefined,
			null,
			'red',
			{},
			{ left: '#ffffff' },
			{ right: '#ffffff' },
			{ left: '#ffffff', right: 'rgb(0,0,0)' },
			{ left: 'javascript:x', right: '#000000' },
			['#ffffff', '#000000']
		]) {
			expect(parseHeartColors(bad), JSON.stringify(bad)).toBeUndefined();
		}
	});
});

describe('toHexColor', () => {
	it('passes hex through and converts the store rgb() form', () => {
		expect(toHexColor('#ABCDEF', '#000000')).toBe('#abcdef');
		expect(toHexColor('rgb(185, 19, 19)', '#000000')).toBe('#b91313');
		expect(toHexColor('rgb(0,0,0)', '#ffffff')).toBe('#000000');
	});

	it('clamps out-of-range channels instead of emitting a broken hex', () => {
		expect(toHexColor('rgb(999, 0, 0)', '#000000')).toBe('#ff0000');
	});

	it('falls back for anything it cannot read', () => {
		expect(toHexColor('papayawhip', '#123456')).toBe('#123456');
		expect(toHexColor(undefined, '#123456')).toBe('#123456');
		expect(toHexColor('', '#123456')).toBe('#123456');
	});

	it('converts a pair', () => {
		expect(
			toHexColors({ left: '#ffffff', right: 'rgb(185, 19, 19)' }, { left: '#000000', right: '#000000' })
		).toEqual({ left: '#ffffff', right: '#b91313' });
	});
});

describe('dampenColors', () => {
	it('draws each colour more than half way to a light grey, keeping the two lobes apart', () => {
		const dim = dampenColors({ left: '#ffffff', right: '#b91313' });
		expect(dim).toEqual({ left: '#eaeaea', right: '#ca7f7f' });
		expect(dim.left).not.toBe(dim.right);
	});

	it('takes the store\'s rgb() form too, and falls back to grey on anything else', () => {
		expect(dampenColors({ left: 'rgb(185, 19, 19)', right: 'nonsense' })).toEqual({ left: '#ca7f7f', right: '#d3d3d3' });
	});
});

