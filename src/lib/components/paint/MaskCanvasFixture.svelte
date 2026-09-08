<!--
  MaskCanvas with a tool that can be changed after mounting, for MaskCanvas.test.ts.

  Two of the things the canvas has to get right happen when the tool changes —
  Markér puts its selection down, and the eraser's falsy 0 has to survive being
  picked up second — and a `.test.ts` file may hold no `$state`. So the state
  lives here and the test reaches it through the component's own export.
-->
<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import type { PaintTool } from '$lib/paint/toolset';
	import MaskCanvas from './MaskCanvas.svelte';

	let { tool, ...rest }: ComponentProps<typeof MaskCanvas> = $props();

	let canvas = $state.raw<ReturnType<typeof MaskCanvas> | null>(null);

	// The prop is the starting tool and nothing more — `setTool` is how it moves
	// afterwards — so capturing it once is exactly what is wanted here.
	// svelte-ignore state_referenced_locally
	let current = $state<PaintTool>(tool);

	/** Pick another tool, as the panel's buttons do on the page. */
	export function setTool(next: PaintTool): void {
		current = next;
	}

	/** What the page calls before it acts on the mask; see `commitSelection`. */
	export function commitSelection(): void {
		canvas?.commitSelection();
	}
</script>

<MaskCanvas bind:this={canvas} {...rest} tool={current} />
