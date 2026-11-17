import { describe, expect, it } from 'vitest';
import LIST from '$lib/data/small-images.json';
import { smallSrcset } from '$lib/smallImages';

describe('smallSrcset', () => {
	it('lists the smaller copies and then the picture itself, by width', () => {
		const [src, copies] = Object.entries(LIST as unknown as Record<string, [number, string][]>)[0];
		const srcset = smallSrcset(src, 1200, '/base')!;
		const parts = srcset.split(', ');
		expect(parts).toHaveLength(copies.length + 1);
		expect(parts[0]).toBe(`/base${copies[0][1]} ${copies[0][0]}w`);
		expect(parts.at(-1)).toBe(`/base${src} 1200w`);
		for (const [width, address] of copies) {
			expect(width).toBeLessThan(1200);
			expect(address).toMatch(/^\/small\/.+-\d+\.jpg$/);
		}
	});

	it('gives nothing for a picture without copies', () => {
		expect(smallSrcset('/hearts/photos/none.jpg', 800)).toBeUndefined();
	});
});
