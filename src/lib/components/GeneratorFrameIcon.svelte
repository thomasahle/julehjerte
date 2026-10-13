<script lang="ts">
	import { frameRing, type TextFrame } from '$lib/generator/geometry';
	let { frame }: { frame: TextFrame } = $props();
	const id = $props.id();
	let path = $derived(
		frame === 'woven' || frame === 'air'
			? ''
			: 'M' +
					frameRing(frame, 70)
						.map(
							([x, y]) =>
								`${50 + (x - y) * Math.SQRT1_2 * 0.58},${58 + (x + y - 100) * Math.SQRT1_2 * 0.58}`
						)
						.join('L') +
					'Z'
	);
</script>

<svg viewBox="0 0 100 100" aria-hidden="true">
	<defs>
		<clipPath {id}
			><path d="M50 94 12 56C-13 31 22-4 50 24 78-4 113 31 88 56Z" /></clipPath
		>
	</defs>
	<g clip-path={`url(#${id})`}>
		<path fill="var(--paper-left, #fffdf5)" d="M0 0H100V100H0Z" />
		<path
			fill="var(--paper-right, #b72f2b)"
			d="M50 0H100V50H50ZM0 50H50V100H0Z"
		/>
		{#if frame === 'woven' || frame === 'air'}
			<g transform="rotate(-45 50 58)">
				{#each [0, 1, 2, 3] as i (i)}
					<path
						d={`M${18 + i * 16} 12V95M6 ${26 + i * 16}H94`}
						stroke="var(--paper-right, #b72f2b)"
						stroke-width="6"
					/>
				{/each}
			</g>
			<rect
				x={frame === 'air' ? 19 : 25}
				y={frame === 'air' ? 40 : 45}
				width={frame === 'air' ? 62 : 50}
				height={frame === 'air' ? 33 : 23}
				fill="var(--paper-left, #fffdf5)"
			/>
			<text
				x="50"
				y="64"
				text-anchor="middle"
				font-size="23"
				font-weight="800"
				fill="var(--paper-right, #b72f2b)">JUL</text
			>
		{:else}
			<path
				d={path}
				fill="var(--paper-left, #fffdf5)"
				stroke="var(--paper-right, #b72f2b)"
				stroke-width="1.5"
			/>
			<path
				d="m50 45 3.6 8 8.7 1-6.5 6 1.8 8.5-7.6-4.5-7.6 4.5 1.8-8.5-6.5-6 8.7-1Z"
				fill="var(--paper-right, #b72f2b)"
			/>
		{/if}
	</g>
	<path
		d="M50 94 12 56C-13 31 22-4 50 24 78-4 113 31 88 56Z"
		fill="none"
		stroke="var(--line)"
	/>
</svg>

<style>
	svg {
		display: block;
		width: 66px;
		height: 66px;
		margin: 0 auto 6px;
	}
</style>
