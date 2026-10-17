<!--
  FindCutsPanel as PaintPage drives it, for FindCutsPanel.test.ts: the panel
  starts on the searching face, and `finish` hands it a result the way the page
  does when the engine answers — status, result and the face flag together.
-->
<script lang="ts">
	import FindCutsPanel from './FindCutsPanel.svelte';
	import { defaultAdvanced } from '$lib/inverse/engine';
	import { DEFAULT_FRAME } from '$lib/paint/frame';
	import { NO_SYMMETRY } from '$lib/paint/symmetry';
	import type { PaintResult, PaintStatus } from '$lib/editor/session.svelte';
	import type { Language } from '$lib/i18n';

	let { lang = 'da', onOpenInDraw = () => {} }: { lang?: Language; onOpenInDraw?: () => void } =
		$props();

	let status = $state<PaintStatus>('searching');
	let result = $state<PaintResult | null>(null);
	let showingResult = $state(false);

	export function finish(next: PaintResult): void {
		result = next;
		status = 'done';
		showingResult = true;
	}
</script>

<FindCutsPanel
	symmetry={NO_SYMMETRY}
	{status}
	error={null}
	{result}
	{showingResult}
	honoured={NO_SYMMETRY}
	frame={DEFAULT_FRAME}
	showMotif={false}
	onShowMotif={() => {}}
	elapsed={5}
	stage="preprocessing"
	advanced={defaultAdvanced(NO_SYMMETRY)}
	onAdvanced={() => {}}
	onResetAdvanced={() => {}}
	canFind={true}
	onFind={() => {}}
	onCancel={() => {}}
	{onOpenInDraw}
	onBackToMask={() => {}}
	{lang}
/>
