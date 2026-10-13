import { it, expect } from 'vitest';
import { GeometryCache, geometryKey } from './cache';
import { defaults } from './state';
import type { GeneratorResult } from './generate';
it('does not regenerate for print width or choices in the other design mode', () => {
	const figure = { ...defaults, mode: 'figure' as const },
		text = { ...defaults, mode: 'text' as const };
	expect(
		geometryKey({ ...figure, paperWidth: 140, text: 'BØ', font: 'cinzel' })
	).toBe(geometryKey(figure));
	expect(
		geometryKey({
			...text,
			paperWidth: 140,
			motif: 'ph-cat',
			scale: 45,
			frame: 'diamond'
		})
	).toBe(geometryKey(text));
	expect(geometryKey({ ...figure, scale: 71 })).not.toBe(geometryKey(figure));
	expect(geometryKey({ ...text, textFrame: 'oval' })).not.toBe(
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
