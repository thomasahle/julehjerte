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
	<circle cx="12" cy="12" r="9"/>
	<path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/>
	<path d="M12 17h.01"/>
</svg>
