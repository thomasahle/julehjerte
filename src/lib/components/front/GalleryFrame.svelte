<!--
  The decorative frame around the gallery — frosted firs, holly, stars and snow
  dots down both edges (docs/redesign/DESIGN.md §3 "Gallery frame", positions
  copied from `galleryFrame()` in the mockup generator).

  Only shown from 1400px up, where the viewport leaves room outside the 1280px
  gallery column; below that it is display: none. It is an absolutely positioned,
  pointer-events: none overlay behind the gallery, so `height` has to be the
  gallery's measured height — the front page feeds it from a ResizeObserver, and
  0 renders nothing.

  The firs and stars are `<use>`s of ids in the landscape drawing's <defs>, so
  the page must render <Landscape/> as well.
-->
<script lang="ts">
	import Fir from '$lib/components/Fir.svelte';
	import Star from '$lib/components/Star.svelte';
	import { FIR_FILLS, type PineSymbol } from '$lib/landscape';

	interface Props {
		/** Height of the gallery in px; the SVG is drawn on a 1440-wide grid. */
		height: number;
	}

	let { height }: Props = $props();

	type FirSpec = {
		x: number;
		tipY: number;
		h: number;
		fill: string;
		symbol: PineSymbol;
		mirrored?: boolean;
		widthFactor?: number;
	};

	const FIRS: FirSpec[] = [
		{ x: 12, tipY: 250, h: 340, fill: FIR_FILLS[0], symbol: 'pine-c', widthFactor: 0.92 },
		{ x: -52, tipY: 380, h: 230, fill: FIR_FILLS[1], symbol: 'pine-b', mirrored: true, widthFactor: 0.9 },
		{ x: 1428, tipY: 230, h: 350, fill: FIR_FILLS[2], symbol: 'pine-c', mirrored: true, widthFactor: 0.92 },
		{ x: 1494, tipY: 380, h: 230, fill: FIR_FILLS[3], symbol: 'pine-c', widthFactor: 0.9 },
		{ x: 6, tipY: 1130, h: 300, fill: FIR_FILLS[1], symbol: 'pine-b', widthFactor: 0.9 },
		{ x: 1436, tipY: 1090, h: 320, fill: FIR_FILLS[0], symbol: 'pine-c', mirrored: true, widthFactor: 0.92 },
		{ x: 14, tipY: 2000, h: 340, fill: FIR_FILLS[2], symbol: 'pine-c', widthFactor: 0.92 },
		{ x: 1430, tipY: 1960, h: 340, fill: FIR_FILLS[3], symbol: 'pine-b', mirrored: true, widthFactor: 0.92 },
		{ x: -30, tipY: 2900, h: 300, fill: FIR_FILLS[0], symbol: 'pine-c', widthFactor: 0.9 },
		{ x: 1470, tipY: 2860, h: 300, fill: FIR_FILLS[1], symbol: 'pine-c', mirrored: true, widthFactor: 0.9 }
	];

	const HOLLY: (readonly [number, number, number])[] = [
		[82, 640, 1],
		[1338, 640, 1],
		[84, 2380, 1],
		[1336, 2340, 1]
	];

	const STARS: (readonly [number, number, number])[] = [
		[320, 370, 0.42],
		[560, 380, 0.36],
		[770, 372, 0.42],
		[1030, 296, 0.42],
		[66, 160, 0.5],
		[1220, 176, 0.42],
		[420, 1240, 0.36],
		[900, 1230, 0.42],
		[1130, 1740, 0.42],
		[250, 2180, 0.36],
		[700, 2700, 0.4],
		[1240, 2620, 0.36]
	];

	const SNOW_DOTS: (readonly [number, number, number])[] = [
		[1100, 300, 3],
		[180, 640, 3],
		[1290, 1240, 3],
		[640, 1720, 2.5],
		[300, 2560, 3]
	];

	// One holly leaf, rotated three ways around the sprig's origin.
	const LEAF = 'M0 0 C 6 -10, 16 -12, 24 -6 C 18 -2, 18 4, 24 8 C 16 12, 6 10, 0 0 Z';
	const LEAF_ROTATIONS = [-40, 20, 80];
	const BERRIES: (readonly [number, number])[] = [
		[6, 2],
		[14, -3],
		[12, 7]
	];
</script>

{#if height > 0}
	<svg
		class="gallery-frame"
		viewBox="0 0 1440 {height}"
		preserveAspectRatio="xMidYMin meet"
		style="height: {height}px;"
		aria-hidden="true"
		focusable="false"
	>
		{#each FIRS as fir, i (i)}
			<Fir
				x={fir.x}
				tipY={fir.tipY}
				height={fir.h}
				fill={fir.fill}
				symbol={fir.symbol}
				mirrored={fir.mirrored ?? false}
				widthFactor={fir.widthFactor ?? 1}
			/>
		{/each}

		{#each HOLLY as [x, y, k] (`${x}-${y}`)}
			<g transform="translate({x} {y}) scale({k})">
				{#each LEAF_ROTATIONS as rotation (rotation)}
					<path d={LEAF} transform="rotate({rotation})" fill={FIR_FILLS[0]} />
				{/each}
				{#each BERRIES as [cx, cy] (`${cx}-${cy}`)}
					<circle {cx} {cy} r="4.5" fill="var(--red)" />
				{/each}
			</g>
		{/each}

		{#each STARS as [x, y, scale] (`${x}-${y}`)}
			<Star {x} {y} {scale} />
		{/each}

		{#each SNOW_DOTS as [cx, cy, r] (`${cx}-${cy}`)}
			<circle {cx} {cy} {r} fill="#fff" opacity="0.85" />
		{/each}
	</svg>
{/if}

<style>
	.gallery-frame {
		display: none;
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
		pointer-events: none;
	}

	@media (min-width: 1400px) {
		.gallery-frame {
			display: block;
		}
	}
</style>
