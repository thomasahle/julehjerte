<!--
  Difficulty as four dots (red up to the level, --sage after) plus its label —
  the gallery card and the detail panel show the same thing at different sizes.
  docs/redesign/DESIGN.md §3/§4.
-->
<script lang="ts">
	import { t, type Language } from '$lib/i18n';
	import { LEVEL_LABEL_KEYS, levelRank, type DifficultyLevel } from '$lib/utils/difficulty';

	interface Props {
		level: DifficultyLevel;
		lang: Language;
		/** Dot diameter in px: 8 on cards, 10 in the detail panel. */
		size?: number;
		/** Set false to show only the dots. */
		showLabel?: boolean;
		/**
		 * Only the dots, hidden from screen readers and without a tooltip:
		 * for a control that names the level itself (the gallery bar's
		 * difficulty toggles).
		 */
		decorative?: boolean;
	}

	let { level, lang, size = 8, showLabel = true, decorative = false }: Props = $props();

	// A value that is no level shows as "Mellem", as it always has.
	let filled = $derived(levelRank(level) || levelRank('medium'));
	let label = $derived(t(LEVEL_LABEL_KEYS[level] ?? LEVEL_LABEL_KEYS.medium, lang));
</script>

<span
	class="dots"
	title={decorative ? undefined : label}
	aria-hidden={decorative ? 'true' : undefined}
>
	{#each [1, 2, 3, 4] as i (i)}
		<span
			class="dot"
			class:on={i <= filled}
			style="width: {size}px; height: {size}px;"
			aria-hidden="true"
		></span>
	{/each}
	{#if decorative}
		<!-- Named by the control it sits in. -->
	{:else if showLabel}
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
