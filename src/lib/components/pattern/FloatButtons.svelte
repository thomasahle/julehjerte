<!--
  Which colour's tiles float, in the Escher tab, for the types of two shapes (`floatedTile`): none,
  the red ones or the white ones, the other colour joining across the crossings, which open out
  into joints the two cuts run along together, as Khatam's pinwheels float on its stars. Laid out as
  the sizes are (SizeButtons), the one chosen pressed.
-->
<script lang="ts">
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import type { Floating } from '$lib/pattern/escherTab';

	interface Props {
		lang: Language;
		floating: Floating;
		onFloat: (floating: Floating) => void;
		disabled?: boolean;
	}

	let { lang, floating, onFloat, disabled = false }: Props = $props();

	const tr = (key: TranslationKey) => t(key, lang);
	const CHOICES: Array<{ value: Floating; label: TranslationKey }> = [
		{ value: null, label: 'patternFloatNone' },
		{ value: 'red', label: 'patternFloatRed' },
		{ value: 'white', label: 'patternFloatWhite' }
	];
</script>

<div class="float-row">
	<span class="float-label" aria-hidden="true">{tr('patternFloat')}</span>
	<div class="choices" role="group" aria-label={tr('patternFloat')} title={tr('patternFloatHint')}>
		{#each CHOICES as choice (choice.label)}
			<button type="button" class="choice" class:active={floating === choice.value} aria-pressed={floating === choice.value} {disabled} onclick={() => onFloat(choice.value)}>
				{tr(choice.label)}
			</button>
		{/each}
	</div>
</div>

<style>
	.float-row {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	/* As the sizes' and the symmetry rows' names. */
	.float-label {
		color: var(--ink);
		font-size: 14px;
	}

	.choices {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
	}

	/* As a size button (SizeButtons). */
	.choice {
		padding: 6px 0;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		background: var(--white);
		color: var(--ink);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}

	.choice.active {
		border-color: var(--green);
		box-shadow: inset 0 0 0 1px var(--green);
	}
</style>
