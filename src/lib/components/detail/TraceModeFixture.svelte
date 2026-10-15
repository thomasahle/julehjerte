<!--
  TraceMode as the heart page mounts it, for TraceMode.test.ts: `open` lives in
  the parent and onClose sets it false, so the test can close the mode and open
  it again, which is what "one trace_heart per opening" is about.
-->
<script lang="ts">
	import type { HeartDesign } from '$lib/types/heart';
	import TraceMode from './TraceMode.svelte';

	let { design }: { design: HeartDesign } = $props();
	let open = $state(true);
</script>

<button type="button" class="reopen" onclick={() => (open = true)}>reopen</button>
<TraceMode {design} heartId={design.id} heartName={design.name} lang="da" {open} onClose={() => (open = false)} />
