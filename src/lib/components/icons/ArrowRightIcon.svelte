<!-- Ported from the `I` icon map in docs/redesign/mockups/build-artboards.mjs. -->
<script lang="ts">
	import type { IconProps } from './types';

	let { size = 20, class: className = undefined, ...rest }: IconProps = $props();
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
	<path d="M5 12h14"/>
	<path d="m13 6 6 6-6 6"/>
</svg>
