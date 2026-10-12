<!-- Corner: two curves meet at an angle around a distinct diamond point. -->
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
	<path d="M3 5C6.5 6.3 8.2 10 9.2 13.7M21 5C17.5 6.3 15.8 10 14.8 13.7" />
	<path d="m12 15 3.5 3.5-3.5 3.5-3.5-3.5Z" fill="var(--node-icon-accent, currentColor)" stroke="none" />
</svg>
