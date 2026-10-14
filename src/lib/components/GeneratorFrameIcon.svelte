<script lang="ts">
	import { frameRing, type TextFrame } from '$lib/generator/geometry';
	import type { HeartDesign } from '$lib/types/heart';
	import type { HeartColors } from '$lib/stores/colors';
	import { renderHeartSvgMarkup } from '$lib/rendering/heartSvg';
	let {
		frame,
		design,
		colors,
		unavailable = false
	}: {
		frame: TextFrame;
		design?: HeartDesign;
		colors: HeartColors;
		unavailable?: boolean;
	} = $props();
	const id = $props.id();
	let markup = $derived(
		design
			? renderHeartSvgMarkup(design, colors, { idPrefix: `template-${id}` })
			: ''
	);
	let outline = $derived(
		frame === 'woven' || frame === 'air'
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
</script>

<div
	class="miniature"
	aria-hidden="true"
	data-preview={design ? 'ready' : unavailable ? 'unavailable' : 'pending'}
>
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
					y={frame === 'air' ? 25 : 32}
					width="60"
					height={frame === 'air' ? 50 : 36}
					rx="2"
				/>{/if}
			{#if unavailable}<path
					d="m40 40 20 20m0-20-20 20"
					stroke="var(--ink-light)"
				/>{/if}
		</svg>
	{/if}
</div>

<style>
	.miniature {
		width: 66px;
		height: 66px;
		margin: 0 auto 6px;
	}
	.miniature :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
