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
	<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/>
	<path d="m13.5 6.5 3 3"/>
</svg>
