import { it, expect } from 'vitest';
import { GeometryCache, geometryKey } from './cache';
import { defaults } from './state';
import type { GeneratorResult } from './generate';
it('does not regenerate for choices in the other design mode', () => {
	const figure = { ...defaults, mode: 'figure' as const },
		text = { ...defaults, mode: 'text' as const };
	expect(
		geometryKey({ ...figure, text: 'BØ', font: 'cinzel' })
	).toBe(geometryKey(figure));
	expect(
		geometryKey({
			...text,
			motif: 'ph-cat',
			scale: 45,
			style: 'check'
		})
	).toBe(geometryKey(text));
	expect(geometryKey({ ...figure, scale: 71 })).not.toBe(geometryKey(figure));
	expect(geometryKey({ ...text, textFrame: 'circle' })).not.toBe(
		geometryKey(text)
	);
});
it('keeps recently revisited designs and bounds memory usage', () => {
	const cache = new GeometryCache(2),
		a = { recipe: 'letters' } as GeneratorResult,
		b = { recipe: 'nested' } as GeneratorResult;
	cache.set('a', a);
	cache.set('b', b);
	expect(cache.get('a')).toBe(a);
	cache.set('c', a);
	expect(cache.get('b')).toBeUndefined();
	expect(cache.get('a')).toBe(a);
});
