<!--
  A tile type as one of Tom McLean's templates (`$lib/pattern/template.ts`): the red tile standing
  on its corner as in the heart, a half arrowhead on each side in the colour of the curve the side
  carries (the tile editor's colours, so the same colour is the same curve). Decorative: the
  segment it sits on carries the name.
-->
<script lang="ts">
	import type { Vec } from '$lib/types/heart';
	import type { TileRule } from '$lib/pattern/tiling';
	import { CURVE_COLORS, templateOf } from '$lib/pattern/template';

	interface Props {
		rule: TileRule;
		size?: number;
	}

	let { rule, size = 44 }: Props = $props();

	const S = 10;
	const toSvg = (p: Vec): Vec => ({ x: (p.x - p.y) * S, y: (p.x + p.y) * S });
	const fmt = (n: number) => Math.round(n * 100) / 100;

	let heads = $derived(
		templateOf(rule).flatMap((s) =>
			s.arrowheads.map((t, k) => ({
				key: `${s.side}-${k}`,
				d: `M ${t.map((p) => toSvg(p)).map((q) => `${fmt(q.x)} ${fmt(q.y)}`).join(' L ')} Z`,
				color: CURVE_COLORS[s.curve]
			}))
		)
	);
</script>

<svg class="template" width={size} height={size} viewBox="-14.5 -4.5 29 29" aria-hidden="true">
	<path class="tile" d="M 0 0 L 10 10 L 0 20 L -10 10 Z" />
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

	.head {
		stroke: rgba(0, 0, 0, 0.35);
		stroke-width: 0.35;
		stroke-linejoin: round;
	}
</style>
