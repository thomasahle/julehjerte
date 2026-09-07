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
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
	class={className}
	{...rest}
>
	<path d="M4 8h16"/>
	<path d="M4 16h16"/>
	<path d="M8 4v16"/>
	<path d="M16 4v16"/>
</svg>
