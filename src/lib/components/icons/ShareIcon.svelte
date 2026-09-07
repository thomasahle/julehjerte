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
	<circle cx="18" cy="5" r="3"/>
	<circle cx="6" cy="12" r="3"/>
	<circle cx="18" cy="19" r="3"/>
	<path d="m8.6 13.5 6.8 4"/>
	<path d="m15.4 6.5-6.8 4"/>
</svg>
