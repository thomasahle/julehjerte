<!--
  "Vis omrids": the woven square seen from above, the left lobe's cuts crossing
  the right lobe's. Copied from `v2-outline-a` in
  docs/redesign/symmetri-ikoner.html, the variant the owner chose.

  The two colours are the canvas's own cut colours, so the checkbox shows what
  turning it on will draw; they come from $lib/editor/outlineColors rather than
  from the palette for that reason. Only the frame follows `currentColor`, so
  the glyph still reads on the panel's white and on a dark button.
-->
<script lang="ts">
	import { LOBE_OUTLINE_COLORS } from '$lib/editor/outlineColors';
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
		<!-- Butt caps: these are cut edges running off the square, not strokes
		     with ends of their own. -->
		<g stroke-linecap="butt" stroke-width="1.9">
			<g stroke={LOBE_OUTLINE_COLORS.left}>
				<path d="M-6.05 -2.25 C-2.02 -3.25 2.02 -3.25 6.05 -2.25" />
				<path d="M-6.05 2.25 C-2.02 1.25 2.02 1.25 6.05 2.25" />
			</g>
			<g stroke={LOBE_OUTLINE_COLORS.right}>
				<path d="M-2.25 -6.05 C-1.25 -2.02 -1.25 2.02 -2.25 6.05" />
				<path d="M2.25 -6.05 C3.25 -2.02 3.25 2.02 2.25 6.05" />
			</g>
		</g>
		<rect
			x="-6.7"
			y="-6.7"
			width="13.4"
			height="13.4"
			rx="2.6"
			stroke-width="1.4"
			opacity={SOFT_OPACITY}
		/>
	</g>
</svg>
