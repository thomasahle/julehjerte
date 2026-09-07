<!--
  Gold stars and white snow dots scattered over a sky — the two decoration loops
  the hero's sky overlay and the gallery frame both draw.

  Renders bare SVG children, so the caller supplies the <svg> and its viewBox;
  the coordinates in `stars` and `dots` are in that viewBox's units. The stars
  are <use>s of the landscape drawing's `star` id, so the page must render
  <Landscape/> as well.
-->
<script lang="ts">
	import Star from '$lib/components/Star.svelte';
	import type { Placed } from '$lib/landscape';

	interface Props {
		/** [x, y, scale] per star. */
		stars: readonly Placed[];
		/** [cx, cy, r] per snow dot. */
		dots: readonly Placed[];
	}

	let { stars, dots }: Props = $props();
</script>

{#each stars as [x, y, scale] (`${x}-${y}`)}
	<Star {x} {y} {scale} />
{/each}

{#each dots as [cx, cy, r] (`${cx}-${cy}`)}
	<circle {cx} {cy} {r} fill="var(--white)" opacity="0.85" />
{/each}
