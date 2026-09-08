<!--
  "Snap til den anden laps punkter": a point on each lobe's cut, with magnet
  arcs turned towards each other. Copied from `v2-snap-b` in
  docs/redesign/symmetri-ikoner.html, the variant the owner chose.

  The two dots wear the canvas's cut colours ($lib/editor/outlineColors), so the
  icon says which two points are meant: one from each lobe, not any two points.
  The arcs stay `currentColor` and invert with the label.
-->
<script lang="ts">
	import { LOBE_OUTLINE_COLORS } from '$lib/editor/outlineColors';
	import type { IconProps } from './types';

	let { size = 28, class: className = undefined, ...rest }: IconProps = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
	class={className}
	{...rest}
>
	<g stroke-width="1.45">
		<path d="M6.6 8.93 A3.9 3.9 0 0 1 6.6 15.07" />
		<path d="M8.14 6.96 A6.4 6.4 0 0 1 8.14 17.04" />
		<path d="M17.4 8.93 A3.9 3.9 0 0 0 17.4 15.07" />
		<path d="M15.86 6.96 A6.4 6.4 0 0 0 15.86 17.04" />
	</g>
	<circle cx="4.2" cy="12" r="2.4" fill={LOBE_OUTLINE_COLORS.left} stroke="none" />
	<circle cx="19.8" cy="12" r="2.4" fill={LOBE_OUTLINE_COLORS.right} stroke="none" />
</svg>
