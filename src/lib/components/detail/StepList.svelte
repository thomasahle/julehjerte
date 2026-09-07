<!--
  The five weaving steps as numbered green circles — the "Sådan gør du" block in
  the detail page's text panel (docs/redesign/DESIGN.md §4).

  The texts are the shared `instructions` array in $lib/i18n/translations, so the
  detail page and the illustrated guide always tell the same story.
-->
<script lang="ts">
	import { tArray, type Language } from '$lib/i18n';

	interface Props {
		lang: Language;
	}

	let { lang }: Props = $props();

	let steps = $derived(tArray('instructions', lang));
</script>

<ol class="steps">
	{#each steps as step, i (i)}
		<li>
			<!-- The <ol> already conveys the order; the disc is decoration. -->
			<span class="num" aria-hidden="true">{i + 1}</span>
			<span class="text">{step}</span>
		</li>
	{/each}
</ol>

<style>
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.steps li {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		font-size: 15px;
		line-height: 1.5;
		color: var(--ink);
	}

	.num {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--green);
		color: var(--white);
		font-size: 13px;
		font-weight: 600;
	}
</style>
