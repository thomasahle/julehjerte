<script lang="ts">
	import type { Finger, HeartColors } from '$lib/types/heart';
	import type { WeaveData } from '$lib/rendering/svgWeave';
	import { heartPaintPaths } from '$lib/rendering/heartPaint';

	let { fingers, weave, colors, idPrefix }: {
		fingers: Finger[];
		weave: WeaveData;
		colors: HeartColors;
		idPrefix: string;
	} = $props();
	const paint = $derived(heartPaintPaths(fingers, weave));
</script>

<path d={paint.left} fill={colors.left} />
{#if paint.joined}
	<path d={paint.right} fill={colors.right} fill-rule="evenodd" />
{:else}
	<defs>
		<clipPath id="overlap-{idPrefix}">
			<rect x={weave.overlap.left} y={weave.overlap.top} width={weave.overlap.width} height={weave.overlap.height} />
		</clipPath>
	</defs>
	<path d={weave.rightLobeClip} fill={colors.right} />
	<g clip-path="url(#overlap-{idPrefix})">
		<rect x={weave.overlap.left} y={weave.overlap.top} width={weave.overlap.width} height={weave.overlap.height} fill={colors.left} />
		<path d={paint.right} fill={colors.right} fill-rule="evenodd" />
	</g>
{/if}
