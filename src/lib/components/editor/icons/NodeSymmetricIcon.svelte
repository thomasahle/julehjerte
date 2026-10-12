<!-- Symmetric: the square point has two aligned handles of equal length. -->
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
	<path d="M3 5C3 10 5 13.3 7.5 14.5M21 5C21 10 19 13.3 16.5 14.5" />
	<g fill="var(--node-icon-accent, currentColor)" stroke="none">
		<rect x="9" y="15.5" width="6" height="6" />
		<circle cx="3" cy="18.5" r="1.8" />
		<circle cx="21" cy="18.5" r="1.8" />
	</g>
	<path d="M5 18.5H7M17 18.5h2" stroke="var(--node-icon-accent, currentColor)" />
</svg>
