import { expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PaperHeartSVG from './PaperHeartSVG.svelte';
import catalog from '$lib/data/heart-designs.json';
import type { HeartDesign } from '$lib/types/heart';
import { renderHeartSvgMarkup } from '$lib/rendering/heartSvg';

for (const mode of ['joined', 'clipped'] as const) for (const weaveParity of [0, 1] as const) {
	it(`matches the exported fill in ${mode} phase ${weaveParity}`, async () => {
		const design = structuredClone(catalog['classic-3x3']) as HeartDesign;
		design.weaveParity = weaveParity;
		if (mode === 'clipped') design.fingers[0]!.segments[0]!.p1.y = -100;
		const colors = { left: '#336699', right: '#ffff00' };
		const target = document.createElement('div');
		document.body.append(target);
		const component = mount(PaperHeartSVG, { target, props: {
			initialFingers: design.fingers, initialGridSize: design.gridSize,
			initialWeaveParity: weaveParity, colors, readonly: true, idPrefix: 'fill-test'
		} });
		try {
			flushSync();
			const exported = new DOMParser().parseFromString(renderHeartSvgMarkup(design, colors), 'image/svg+xml');
			const paths = (root: ParentNode) => Array.from(root.querySelectorAll('path')).map(p => [p.getAttribute('d'), p.getAttribute('fill'), p.getAttribute('fill-rule')]);
			expect(paths(target)).toEqual(paths(exported));
			expect(target.querySelectorAll('clipPath').length).toBe(mode === 'joined' ? 0 : 1);
			expect(target.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
		} finally {
			await unmount(component);
			target.remove();
		}
	});
}
