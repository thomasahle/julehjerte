<!--
  A tile type as one of Tom McLean's templates (`$lib/pattern/template.ts`): the red tile standing
  on its corner as in the heart, a half arrowhead on each side in the colour of the curve the side
  carries (the tile editor's colours, so the same colour is the same curve). Where red and white
  are two shapes, the white tile beside it too, across its lower-right side, and the red one tinted
  red; where the white ones are of two kinds, one beside each lower side. Decorative: the segment it
  sits on carries the name.
-->
<script lang="ts">
	import type { Vec } from '$lib/types/heart';
	import type { TileRule } from '$lib/pattern/rules';
	import { CURVE_COLORS, shapesOf, templateOf } from '$lib/pattern/template';

	interface Props {
		rule: TileRule;
		size?: number;
	}

	let { rule, size = 44 }: Props = $props();

	const S = 10;
	/** The box round one tile, the red one and the white one beside it, or those and the other white one. */
	const VIEW = { 1: '-14.5 -4.5 29 29', 2: '-13.5 -3.5 37 37', 3: '-23.5 -8.5 47 47' } as const;
	const toSvg = (p: Vec): Vec => ({ x: (p.x - p.y) * S, y: (p.x + p.y) * S });
	const fmt = (n: number) => Math.round(n * 100) / 100;

	let heads = $derived(
		templateOf(rule).flatMap((s) =>
			s.arrowheads.map((t, k) => ({
				key: `${s.tile}-${s.side}-${k}`,
				d: `M ${t.map((p) => toSvg(p)).map((q) => `${fmt(q.x)} ${fmt(q.y)}`).join(' L ')} Z`,
				color: CURVE_COLORS[s.curve]
			}))
		)
	);
</script>

<!-- Two tiles take a box a half again as wide and high, three one wider still. -->
<svg class="template" width={size} height={size} viewBox={VIEW[shapesOf(rule)]} aria-hidden="true">
	{#if shapesOf(rule) > 1}
		<path class="tile white" d="M 10 10 L 20 20 L 10 30 L 0 20 Z" />
	{/if}
	{#if shapesOf(rule) > 2}
		<path class="tile white" d="M -10 10 L 0 20 L -10 30 L -20 20 Z" />
	{/if}
	<path class="tile" class:red={shapesOf(rule) > 1} d="M 0 0 L 10 10 L 0 20 L -10 10 Z" />
	{#each heads as h (h.key)}
		<path class="head" d={h.d} fill={h.color} />
	{/each}
</svg>

<style>
	.template {
		display: block;
		flex: none;
	}

	.tile {
		fill: var(--white);
		stroke: var(--ink);
		stroke-width: 0.9;
		stroke-linejoin: round;
	}

	.tile.red {
		fill: color-mix(in srgb, var(--paper-right) 22%, var(--white));
	}

	.head {
		stroke: rgba(0, 0, 0, 0.35);
		stroke-width: 0.35;
		stroke-linejoin: round;
	}
</style>
