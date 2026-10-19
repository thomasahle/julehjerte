<!--
  The Escher tab's contents in Tegn's Symmetri panel: the tile types (RuleTemplates), and once one
  is chosen, the pattern's size and what dragging does. Tegn keeps the tile; this only shows it and
  says what was picked.

  size        n for tiles drawn n × n on the heart's square.
  cornerHint  what the hint adds about the crossings for the chosen type, or null.
  compact     Tegn below 900px: the type glyphs alone, and no hint once a type is chosen.
-->
<script lang="ts">
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import type { TileRule } from '$lib/pattern/rules';
	import RuleTemplates from './RuleTemplates.svelte';

	interface Props {
		lang: Language;
		/** The chosen type, or null while none is. */
		rule: TileRule | null;
		size: number;
		cornerHint: TranslationKey | null;
		onChoose: (rule: TileRule) => void;
		onSize: (n: number) => void;
		compact?: boolean;
		disabled?: boolean;
	}

	let { lang, rule, size, cornerHint, onChoose, onSize, compact = false, disabled = false }: Props = $props();

	const tr = (key: TranslationKey) => t(key, lang);
</script>

<div class="escher-tab">
	<RuleTemplates {lang} active={rule} {onChoose} {compact} {disabled} />
	{#if rule}
		<div class="pattern-sizes" role="group" aria-label={tr('patternSizes')}>
			{#each [3, 4, 5, 6, 7] as n (n)}
				<button type="button" class="pattern-size" class:active={size === n} aria-pressed={size === n} {disabled} onclick={() => onSize(n)}>{n} × {n}</button>
			{/each}
		</div>
		{#if !compact}
			<p class="pattern-hint">{cornerHint ? `${tr('patternDragHint')} ${tr(cornerHint)}` : tr('patternDragHint')}</p>
		{/if}
	{:else}
		<p class="pattern-hint">{tr('patternTabChoose')}</p>
	{/if}
</div>

<style>
	.escher-tab {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.pattern-sizes {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 4px;
	}

	.pattern-size {
		padding: 6px 0;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		background: var(--white);
		color: var(--ink);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}

	.pattern-size.active {
		border-color: var(--green);
		box-shadow: inset 0 0 0 1px var(--green);
	}

	.pattern-hint {
		margin: 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--muted);
	}
</style>
