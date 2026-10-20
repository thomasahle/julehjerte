<!--
  The Escher tab's contents in Tegn's Symmetri panel: the tile types (RuleTemplates), and for the
  chosen one, the pattern's size and turn, what dragging does, and a way to start the tile over.
  Tegn keeps the tile; this only shows it and says what was picked.

  size        n for tiles a cell of the n × n grid in size, or null for a size dragged by hand.
  turn        how far the whole pattern is turned, in degrees: the turn control, apart from the black
              points, which stretch and slant the tiles but never turn them (as tiled.art keeps its
              rotation tool apart from its corner points). onTurn as it moves, onTurnDone let go.
  frameHint   what the hint adds about the black points for the chosen type, or null.
  compact     Tegn below 900px: the type glyphs alone, and no hint once a type is chosen.
-->
<script lang="ts">
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import type { TileRule } from '$lib/pattern/rules';
	import { RestartIcon } from '$lib/components/icons';
	import RuleTemplates from './RuleTemplates.svelte';

	interface Props {
		lang: Language;
		/** The chosen type, or null while none is. */
		rule: TileRule | null;
		size: number | null;
		frameHint: TranslationKey | null;
		turn: number;
		onChoose: (rule: TileRule) => void;
		onSize: (n: number) => void;
		onTurn: (degrees: number) => void;
		onTurnDone: () => void;
		/** "Start forfra": the tile drawn again as its type starts, at its size. */
		onRestart: () => void;
		compact?: boolean;
		disabled?: boolean;
	}

	let { lang, rule, size, frameHint, turn, onChoose, onSize, onTurn, onTurnDone, onRestart, compact = false, disabled = false }: Props = $props();

	const tr = (key: TranslationKey) => t(key, lang);
	/** The most the pattern turns either way, in degrees: further, the lines near the corners would leave the square at its sides. */
	const MAX_TURN = 15;
	let degrees = $derived(`${new Intl.NumberFormat(lang === 'da' ? 'da-DK' : 'en-GB', { maximumFractionDigits: 1 }).format(turn)}°`);
</script>

<div class="escher-tab">
	<RuleTemplates {lang} active={rule} {onChoose} {compact} {disabled} />
	{#if rule}
		<div class="pattern-sizes" role="group" aria-label={tr('patternSizes')}>
			{#each [3, 4, 5, 6, 7] as n (n)}
				<button type="button" class="pattern-size" class:active={size === n} aria-pressed={size === n} {disabled} onclick={() => onSize(n)}>{n} × {n}</button>
			{/each}
		</div>
		<label class="pattern-turn">
			<span class="pattern-turn-head">
				<span>{tr('patternTurn')}</span>
				<output>{degrees}</output>
			</span>
			<input
				type="range"
				min={-MAX_TURN}
				max={MAX_TURN}
				step="0.5"
				value={turn}
				aria-valuetext={degrees}
				{disabled}
				oninput={(event) => onTurn(event.currentTarget.valueAsNumber)}
				onchange={onTurnDone}
			/>
		</label>
		{#if !compact}
			<p class="pattern-hint">{frameHint ? `${tr('patternDragHint')} ${tr(frameHint)}` : tr('patternDragHint')}</p>
		{/if}
		<button type="button" class="pattern-restart" title={tr('patternRestartHint')} {disabled} onclick={onRestart}>
			<RestartIcon size={14} />{tr('patternRestart')}
		</button>
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

	.pattern-restart {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		align-self: flex-start;
		padding: 6px 10px;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		background: var(--white);
		color: var(--green);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}

	.pattern-turn {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 12px;
		font-weight: 600;
		color: var(--ink);
	}

	.pattern-turn-head {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}

	.pattern-turn output {
		font-variant-numeric: tabular-nums;
		color: var(--muted);
	}

	.pattern-turn input[type='range'] {
		width: 100%;
		accent-color: var(--green);
	}

	.pattern-hint {
		margin: 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--muted);
	}
</style>
