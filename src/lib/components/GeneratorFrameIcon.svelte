<script lang="ts">
	import { fade } from 'svelte/transition';
	import { frameRing, type TextFrame } from '$lib/generator/geometry';
	import type { HeartDesign } from '$lib/types/heart';
	import type { HeartColors } from '$lib/stores/colors';
	import { renderHeartSvgMarkup, renderPictureSvgMarkup } from '$lib/rendering/heartSvg';
	import type { Ring } from '$lib/generator/geometry';
	let {
		frame,
		design,
		sketch,
		colors,
		unavailable = false
	}: {
		frame: TextFrame;
		design?: HeartDesign;
		/** The heart's picture, until its cuts are found (see `$lib/generator/picture`). */
		sketch?: Ring[];
		colors: HeartColors;
		unavailable?: boolean;
	} = $props();
	const id = $props.id();
	let markup = $derived(
		design
			? renderHeartSvgMarkup(design, colors, { idPrefix: `template-${id}` })
			: sketch && !unavailable
				? renderPictureSvgMarkup(sketch, colors, { idPrefix: `template-sketch-${id}` })
				: ''
	);
	let outline = $derived(
		frame === 'woven' || frame === 'air' || frame === 'checkered'
			? ''
			: 'M' +
					frameRing(frame, 70)
						.map(
							([x, y]) =>
								`${50 + (x - y) * Math.SQRT1_2 * 0.7},${50 + (x + y - 100) * Math.SQRT1_2 * 0.7}`
						)
						.join('L') +
					'Z'
	);
	// A new heart fades in over the one it replaces, unless motion is reduced.
	const duration =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
			? 0
			: 320;
</script>

<div
	class="miniature"
	aria-hidden="true"
	data-preview={design ? 'ready' : unavailable ? 'unavailable' : sketch ? 'sketched' : 'pending'}
>
	{#key markup}
		<div class="layer" transition:fade={{ duration }}>
			{#if markup}
				{@html markup}
			{:else}
				<svg
					viewBox="0 0 100 100"
					fill="none"
					stroke="var(--line)"
					stroke-width="2"
				>
					{#if outline}<path d={outline} />{:else}<rect
							x="20"
							y={frame === 'checkered' ? 20 : frame === 'air' ? 25 : 32}
							width="60"
							height={frame === 'checkered' ? 60 : frame === 'air' ? 50 : 36}
							rx="2"
						/>{/if}
					{#if unavailable}<path
							d="m40 40 20 20m0-20-20 20"
							stroke="var(--ink-light)"
						/>{/if}
				</svg>
			{/if}
		</div>
	{/key}
</div>

<style>
	.miniature {
		position: relative;
		width: 66px;
		height: 66px;
		margin: 0 auto 6px;
	}
	/* The old and the new heart overlap while one fades into the other. */
	.layer {
		position: absolute;
		inset: 0;
	}
	.miniature :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
