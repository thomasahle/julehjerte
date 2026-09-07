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
	<circle cx="6" cy="6" r="3"/>
	<circle cx="6" cy="18" r="3"/>
	<path d="M20 4 8.1 15.9"/>
	<path d="M14.5 14.5 20 20"/>
	<path d="M8.1 8.1 12 12"/>
</svg>
