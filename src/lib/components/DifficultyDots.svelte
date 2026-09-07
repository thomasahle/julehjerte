<!--
  Difficulty as four dots (red up to the level, --sage after) plus its label —
  the gallery card and the detail panel show the same thing at different sizes.
  docs/redesign/DESIGN.md §3/§4.
-->
<script lang="ts">
	import { t, type Language } from '$lib/i18n';
	import type { DifficultyLevel } from '$lib/utils/difficulty';
	import type { TranslationKey } from '$lib/i18n/translations';

	interface Props {
		level: DifficultyLevel;
		lang: Language;
		/** Dot diameter in px: 8 on cards, 10 in the detail panel. */
		size?: number;
		/** Set false to show only the dots. */
		showLabel?: boolean;
	}

	let { level, lang, size = 8, showLabel = true }: Props = $props();

	const FILLED: Record<DifficultyLevel, number> = { easy: 1, medium: 2, hard: 3, expert: 4 };
	const LABEL_KEYS: Record<DifficultyLevel, TranslationKey> = {
		easy: 'difficultyEasy',
		medium: 'difficultyMedium',
		hard: 'difficultyHard',
		expert: 'difficultyExpert'
	};

	let filled = $derived(FILLED[level] ?? 2);
	let label = $derived(t(LABEL_KEYS[level] ?? 'difficultyMedium', lang));
</script>

<span class="dots" title={label}>
	{#each [1, 2, 3, 4] as i (i)}
		<span
			class="dot"
			class:on={i <= filled}
			style="width: {size}px; height: {size}px;"
			aria-hidden="true"
		></span>
	{/each}
	{#if showLabel}
		<span class="label">{label}</span>
	{:else}
		<span class="sr-only">{label}</span>
	{/if}
</span>

<style>
	.dots {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.dot {
		display: inline-block;
		border-radius: 50%;
		background: var(--sage);
	}

	.dot.on {
		background: var(--red);
	}

	.label {
		margin-left: 6px;
		font-size: 13px;
		color: var(--muted);
	}

</style>
