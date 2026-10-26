<!--
  MaskCanvas with a tool that can be changed after mounting, for MaskCanvas.test.ts.

  Two of the things the canvas has to get right happen when the tool changes —
  Markér puts its selection down, and a tool picked up second has to paint with
  the paper chosen — and a `.test.ts` file may hold no `$state`. So the state
  lives here and the test reaches it through the component's own export.
-->
<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import type { PaintTool } from '$lib/paint/toolset';
	import MaskCanvas from './MaskCanvas.svelte';

	let { tool, brush, disabled = false, ...rest }: ComponentProps<typeof MaskCanvas> = $props();

	let canvas = $state.raw<ReturnType<typeof MaskCanvas> | null>(null);

	// The prop is the starting tool and nothing more — `setTool` is how it moves
	// afterwards — so capturing it once is exactly what is wanted here.
	// svelte-ignore state_referenced_locally
	let current = $state<PaintTool>(tool);
	// svelte-ignore state_referenced_locally
	let currentBrush = $state(brush);
	// svelte-ignore state_referenced_locally
	let currentDisabled = $state(disabled);

	export function setBrush(next: number): void { currentBrush = next; }
	export function setDisabled(next: boolean): void { currentDisabled = next; }

	/** Pick another tool, as the panel's buttons do on the page. */
	export function setTool(next: PaintTool): void {
		current = next;
	}

	/** What the page calls before it acts on the mask; see `commitSelection`. */
	export function commitSelection(): void {
		canvas?.commitSelection();
	}

	/** Fravælg, as the panel's button calls it. */
	export function deselect(): void {
		canvas?.deselect();
	}

	/** Tern, as the panel's menu calls it. */
	export function layChecks(n: number): void {
		canvas?.layChecks(n);
	}
</script>

<MaskCanvas bind:this={canvas} {...rest} tool={current} brush={currentBrush} disabled={currentDisabled} />
