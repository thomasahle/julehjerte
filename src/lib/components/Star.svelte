<!--
  One gold star from the landscape's symbol set (`landStar()` in the generator).
  Like <Fir/>, it is a `<use>` of an id defined in the landscape's <defs>, so the
  page must also render <Landscape/>. The star is 34 units wide at scale 1.
-->
<script lang="ts">
	import { STAR_FILL } from '$lib/landscape';

	interface Props {
		x: number;
		y: number;
		scale?: number;
		fill?: string;
	}

	let { x, y, scale = 0.5, fill = STAR_FILL }: Props = $props();
</script>

<use href="#star" {fill} transform="translate({x} {y}) scale({scale})" />
