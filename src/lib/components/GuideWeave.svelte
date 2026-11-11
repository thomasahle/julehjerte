<!-- Enlarged loop crossings, a front view of each completed white row, and the finished basket.
     Nearby captions carry the full instructions, so these drawings are decorative. -->
<script lang="ts">
	import GuideDrawing from './GuideDrawing.svelte';
	import { crossing, finished, rows } from '$lib/guide/drawings';

	let { variant, row = 1 }: { variant: 'inside' | 'around' | 'rows' | 'finished'; row?: number } = $props();
	// "Inside": the white loop goes inside the open red one; "around" is the other way.
	let drawing = $derived(
		variant === 'rows' ? rows(row) : variant === 'finished' ? finished() : crossing(variant === 'inside' ? 'red' : 'white')
	);
</script>

<GuideDrawing {drawing} />
