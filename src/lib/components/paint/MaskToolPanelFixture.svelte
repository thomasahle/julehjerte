<!--
  MaskToolPanel as PaintPage mounts it, for MaskToolPanel.test.ts.

  The panel's tool buttons are tooltip triggers, and a trigger without a
  provider above it throws on mount. The bug this fixture exists to pin lives in
  exactly what the trigger hands the button, so the test has to mount the real
  trigger — and therefore the real provider, with the delay the page uses.
-->
<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { TooltipProvider } from '$lib/components/ui/tooltip';
	import MaskToolPanel from './MaskToolPanel.svelte';

	let { ...panel }: ComponentProps<typeof MaskToolPanel> = $props();
</script>

<TooltipProvider delayDuration={250}>
	<MaskToolPanel {...panel} />
</TooltipProvider>
