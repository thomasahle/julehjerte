<!--
  "Vis felter" in the Escher tab: the woven square seen from above, its cells drawn as a grid of
  straight lines and the tile's own cell, the one drawn, thick and tinted. Built as `OutlineIcon`
  is, on the square standing on its corner, so the two checkboxes read as a pair.
-->
<script lang="ts">
	import { SOFT_OPACITY, type IconProps } from './types';

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
	<g transform="translate(12 12) rotate(45)">
		<rect x="-6.7" y="-6.7" width="13.4" height="13.4" rx="2.6" stroke-width="1.4" opacity={SOFT_OPACITY} />
		<!-- the grid between the cells -->
		<g stroke-width="1.2" stroke-linecap="butt" opacity={SOFT_OPACITY}>
			<path d="M-6.7 0 H6.7" />
			<path d="M0 -6.7 V6.7" />
		</g>
		<!-- the cell drawn -->
		<rect x="-6.7" y="-6.7" width="6.7" height="6.7" rx="1.6" stroke-width="1.9" fill="currentColor" fill-opacity="0.22" />
	</g>
</svg>
