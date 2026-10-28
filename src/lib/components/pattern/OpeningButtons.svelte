<!--
  How the crossings open, in the Escher tab (`withOpening`): not at all; red or white tiles floating,
  the other colour joining across the crossings, which open out into joints the two cuts run along
  together, as Khatam's pinwheels float on its stars; or the tiles joining in rows or in columns. Only
  the ways the chosen type allows (`openingsOf`), and the row only where it allows one. Laid out as the
  sizes are (SizeButtons), the one chosen pressed.
-->
<script lang="ts">
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import type { Opening } from '$lib/pattern/escherTab';

	interface Props {
		lang: Language;
		opening: Opening;
		/** The ways the type lets its crossings open, but for not at all. */
		options: Array<Exclude<Opening, null>>;
		onOpen: (opening: Opening) => void;
		disabled?: boolean;
	}

	let { lang, opening, options, onOpen, disabled = false }: Props = $props();

	const tr = (key: TranslationKey) => t(key, lang);
	const LABEL: Record<Exclude<Opening, null>, TranslationKey> = {
		red: 'patternFloatRed',
		white: 'patternFloatWhite',
		level: 'patternOpenRows',
		upright: 'patternOpenColumns'
	};
	let choices = $derived<Array<{ value: Opening; label: TranslationKey }>>([
		{ value: null, label: 'patternFloatNone' },
		...options.map((value) => ({ value, label: LABEL[value] }))
	]);
</script>

<div class="opening-row">
	<span class="opening-label" aria-hidden="true">{tr('patternFloat')}</span>
	<div class="choices" role="group" aria-label={tr('patternFloat')} title={tr('patternFloatHint')} style:--count={Math.min(choices.length, 3)}>
		{#each choices as choice (choice.label)}
			<button type="button" class="choice" class:active={opening === choice.value} aria-pressed={opening === choice.value} {disabled} onclick={() => onOpen(choice.value)}>
				{tr(choice.label)}
			</button>
		{/each}
	</div>
</div>

<style>
	.opening-row {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	/* As the sizes' and the symmetry rows' names. */
	.opening-label {
		color: var(--ink);
		font-size: 14px;
	}

	/* Up to three to a row, as many rows as it takes. */
	.choices {
		display: grid;
		grid-template-columns: repeat(var(--count), 1fr);
		gap: 4px;
	}

	/* As a size button (SizeButtons). */
	.choice {
		padding: 6px 4px;
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
