<!-- Enlarged loop crossings and a front view of each completed white row.
     Nearby captions carry the full instructions, so these SVGs are decorative. -->
<script lang="ts">
	let { variant, row = 1 }: { variant: 'inside' | 'around' | 'rows'; row?: number } = $props();
	let receiver = $derived(variant === 'inside' ? '#c41e2a' : '#ffffff');
	let receiverEdge = $derived(variant === 'inside' ? '#971722' : '#9aab9e');
	let inserted = $derived(variant === 'inside' ? '#ffffff' : '#c41e2a');
	let insertedEdge = $derived(variant === 'inside' ? '#9aab9e' : '#971722');
</script>

<svg viewBox="0 0 420 270" aria-hidden="true" focusable="false">
	{#if variant === 'rows'}
		<!-- Red loops run down, white loops run right. Reverse the second row. -->
		<path d="M155 70 A66 66 0 0 1 287 70 Z" fill="#c41e2a" />
		<path d="M155 70 A66 66 0 0 0 155 202 Z" fill="white" stroke="#9aab9e" />
		{#each [0, 1, 2] as col (col)}
			<rect x={155 + col * 44} y="70" width="44" height="132" rx="6" fill="#c41e2a" stroke="#971722" />
			<path d="M{162 + col * 44} 192 h30" stroke="#971722" stroke-width="2" fill="none" />
		{/each}
		{#each [0, 1, 2] as r (r)}
			{#if r < row}
				{#each [0, 1, 2] as col (col)}
					{#if (r + col) % 2 === 1}
						<rect x={155 + col * 44} y={70 + r * 44} width="44" height="44" fill="white" stroke="#9aab9e" />
					{/if}
				{/each}
			{:else}
				<rect x="155" y={73 + r * 44} width="167" height="37" rx="5" fill="white" stroke="#9aab9e" />
				<path d="M312 {79 + r * 44} v24" stroke="#9aab9e" fill="none" />
			{/if}
			<circle cx="57" cy={92 + r * 44} r="13" fill={r === row - 1 ? '#2e5041' : '#e6ece2'} />
			<text x="57" y={97 + r * 44} text-anchor="middle" fill={r === row - 1 ? 'white' : '#2e5041'} font-size="14">{r + 1}</text>
		{/each}
		<rect x="151" y={66 + (row - 1) * 44} width="140" height="52" rx="4" fill="none" stroke="#2e5041" stroke-width="3" stroke-dasharray="5 4" />
	{:else}
		<!-- A whole folded strip passes through an open loop. The near edge
		     of the receiving loop occludes BOTH inserted paper layers. -->
		<ellipse cx="238" cy="130" rx="60" ry="92" fill="none" stroke={receiverEdge} stroke-width="24" />
		<ellipse cx="238" cy="130" rx="60" ry="92" fill="none" stroke={receiver} stroke-width="20" />
		<path d="M42 112 H345 C371 112 371 148 345 148 H42 Z" fill={inserted} stroke={insertedEdge} stroke-width="2" />
		<path d="M42 137 H345 C355 137 358 132 358 130" fill="none" stroke={insertedEdge} stroke-width="2" />
		<path d="M238 38 A60 92 0 0 1 238 222" fill="none" stroke={receiverEdge} stroke-width="24" />
		<path d="M238 38 A60 92 0 0 1 238 222" fill="none" stroke={receiver} stroke-width="20" />
		<path d="M67 184 H154 m-12 -7 12 7 -12 7" fill="none" stroke="#2e5041" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
	{/if}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
	text {
		font-family: inherit;
		font-weight: 600;
	}
</style>
