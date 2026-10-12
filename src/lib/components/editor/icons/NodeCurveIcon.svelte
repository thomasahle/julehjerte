<!-- Curve point: the round point distinguishes this action from the three node types. -->
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
	stroke-width="1.7"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
	class={className}
	{...rest}
>
	<path d="M3 5C3 11 5 15 7.5 16.5M21 5C21 11 19 15 16.5 16.5" />
	<circle cx="12" cy="18.5" r="3.5" fill="var(--node-icon-accent, currentColor)" stroke="none" />
</svg>
