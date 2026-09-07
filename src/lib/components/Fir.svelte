<!--
  One frosted fir from the landscape's symbol set, for overlay SVGs (the hero's
  mobile corner trees, the detail page's big tree, the gallery frame).

  Renders `<g transform=…><use href="#pine-c"/><use href="#snow-cap" fill="#fbfcfa"/></g>`,
  i.e. `landPine()` from the mockup generator. Place it inside an SVG on a page
  that also renders <Landscape/> — the pine and snow-cap symbols live in the
  landscape's <defs>, so without it the fir renders as nothing.

  (x, tipY) is the tree top in the surrounding SVG's user units and `height` its
  height; `mirrored` flips it, `widthFactor` squeezes it.
-->
<script lang="ts">
	import { FIR_FILLS, SNOW_CAP_FILL, firTransform, type PineSymbol } from '$lib/landscape';

	interface Props {
		x: number;
		tipY: number;
		height: number;
		fill?: string;
		symbol?: PineSymbol;
		mirrored?: boolean;
		widthFactor?: number;
	}

	let {
		x,
		tipY,
		height,
		fill = FIR_FILLS[0],
		symbol = 'pine-c',
		mirrored = false,
		widthFactor = 1
	}: Props = $props();

	let transform = $derived(firTransform(x, tipY, height, mirrored, widthFactor));
</script>

<g {transform} {fill}>
	<use href="#{symbol}" />
	<use href="#snow-cap" fill={SNOW_CAP_FILL} />
</g>
