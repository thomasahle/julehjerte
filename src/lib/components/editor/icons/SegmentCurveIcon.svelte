<!--
  Curve the selected segment.
  Ported from the `I` icon map in docs/redesign/mockups/build-artboards.mjs
  (stroke 1.8, 24-unit grid, currentColor) so the editor tool rail can paint
  every icon green on white and white on the active green button.
-->
<script lang="ts">
	import type { IconProps } from '$lib/components/icons/types';

	let { size = 20, class: className = undefined, ...rest }: IconProps = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
	class={className}
	{...rest}
>
	<path d="M4 18C6 8 18 16 20 6" />
	<circle cx="4" cy="18" r="2" fill="currentColor" />
	<circle cx="20" cy="6" r="2" fill="currentColor" />
</svg>
