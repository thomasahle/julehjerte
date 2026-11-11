<!-- The four preparation drawings, with a printer or traced from a screen. The weaving drawings live in GuideWeave. -->
<script lang="ts">
	import GuideDrawing from './GuideDrawing.svelte';
	import { prepare, trace } from '$lib/guide/drawings';
	import type { Language } from '$lib/i18n';

	interface Props {
		/** Which preparation step to draw, 1-4. */
		step: number;
		lang: Language;
		/** With a printed template, or one traced from a screen. */
		way?: 'print' | 'screen';
		class?: string;
	}

	let { step, lang, way = 'print', class: className = undefined }: Props = $props();
</script>

<GuideDrawing drawing={way === 'screen' ? trace(step) : prepare(step)} {lang} class={className} />
