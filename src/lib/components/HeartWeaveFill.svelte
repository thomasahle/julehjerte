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

<!--
  `paper-l` / `paper-r` name the left and the right paper, whatever colour they
  are painted: the colourful mode recolours a heart by these (src/app.css,
  "Colourful mode"), which also reaches a heart frozen in the prerendered HTML.
-->

<path d={paint.left} fill={colors.left} class="paper-l" />
{#if paint.joined}
	<path d={paint.right} fill={colors.right} fill-rule="evenodd" class="paper-r" />
{:else}
	<defs>
		<clipPath id="overlap-{idPrefix}">
			<rect x={weave.overlap.left} y={weave.overlap.top} width={weave.overlap.width} height={weave.overlap.height} />
		</clipPath>
	</defs>
	<path d={weave.rightLobeClip} fill={colors.right} class="paper-r" />
	<g clip-path="url(#overlap-{idPrefix})">
		<rect x={weave.overlap.left} y={weave.overlap.top} width={weave.overlap.width} height={weave.overlap.height} fill={colors.left} class="paper-l" />
		<path d={paint.right} fill={colors.right} fill-rule="evenodd" class="paper-r" />
	</g>
{/if}
