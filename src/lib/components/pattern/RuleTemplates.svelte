<!--
  The Escher tab's rules as tile types, each drawn as Tom McLean draws one (TemplateGlyph): the red
  tile with half arrowheads on its sides, the same colour for sides of the same shape. Only types a
  woven heart can make, four tiles at every corner, and that the engine draws (tiling.ts
  `TileRule`): 28 of the 36 four-at-a-corner types — the others have no side that can take a shape —
  all 18 ways of two shapes, red and white each its own tile, and all 10 of three, the white tiles of
  two kinds (two.test.ts). Types of two or three shapes show those tiles too, the red one tinted.

  All of them at once, as a table of glyphs: a column for one, two and three shapes, and a row for
  what the red tile is of itself (`tileSymmetry`): no symmetry, the same upside down, the same turned
  a quarter, its own mirror image across one line, two or four. A cell holds its types in the order
  they were offered before (moved and moved-and-mirrored first, the ones tiled.art's gallery uses
  most); empty rows are left out. The owner chose this table, 2026-10-28, over sections, questions and
  a window of examples, after agent testers lost their way in the long list it replaces.

  One glyph per type, its name its accessible name, its tooltip its name and what it does, so a type
  can be read about before it is chosen. Opposite pairs tied two different ways can lie either way
  round in the heart; a glyph chooses its type the way it shows it, and shows as chosen either way.
  The chosen rule is told above the table: its name, what it does and, small, Heesch's name for the
  type (its tooltip spells the letters out), Grünbaum and Shephard's number where Heesch has none, or
  the pattern's wallpaper group for two and three shapes; under that, how its crossings open
  (`children`).

  compact   Tegn below 900px, where the panel leaves its column for a row under the drawing and can
            be 235px wide: smaller glyphs and row names.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import { ToggleGroup, ToggleGroupItem, keepChosen } from '$lib/components/ui/toggle-group';
	import { COMMON_RULES, THREE_NUMBERS, TWO_NUMBERS, neighbours, ofType, opposite, ruleKey, threeShapes, tileSymmetry, twoShapes, type TileRule, type TileSymmetry } from '$lib/pattern/rules';
	import { ruleCode, ruleText } from '$lib/pattern/names';
	import { shapesOf } from '$lib/pattern/template';
	import TemplateGlyph from './TemplateGlyph.svelte';

	interface Props {
		lang: Language;
		/** The chosen rule, or null while none is. */
		active: TileRule | null;
		onChoose: (rule: TileRule) => void;
		compact?: boolean;
		disabled?: boolean;
		/** What goes under the chosen type's description: how its crossings open. */
		children?: Snippet;
	}

	let { lang, active, onChoose, compact = false, disabled = false, children }: Props = $props();

	const tr = (key: TranslationKey) => t(key, lang);

	/** A rule's tile type: opposite pairs tied the same two ways are one type, whichever pair is which. */
	function typeKey(rule: TileRule): string {
		return rule.sides === 'opposite' ? `opposite:${[rule.v, rule.h].sort().join(':')}` : ruleKey(rule);
	}

	/** Every type once, in the order they were offered before the table: the four most used first. */
	const TYPES: TileRule[] = [
		...COMMON_RULES,
		opposite('turn', 'turn'),
		opposite('mirror', 'turn'),
		opposite('move', 'turn'),
		opposite('mirror', 'mirror'),
		neighbours('mirror'),
		neighbours('turn'),
		ofType(53),
		...([42, 45, 49, 50, 54, 56] as const).map(ofType),
		...([57, 58, 59, 61, 62, 64, 66, 67, 68, 69, 71, 74] as const).map(ofType),
		...TWO_NUMBERS.map(twoShapes),
		...THREE_NUMBERS.map(threeShapes)
	];
	const RULES = new Map(TYPES.map((rule) => [typeKey(rule), rule]));

	const COLUMNS: Array<{ shapes: 1 | 2 | 3; name: TranslationKey }> = [
		{ shapes: 1, name: 'patternOneShape' },
		{ shapes: 2, name: 'patternTwoShapes' },
		{ shapes: 3, name: 'patternThreeShapes' }
	];
	const ROW_NAMES: Record<TileSymmetry, TranslationKey> = {
		none: 'patternSymmetryNone',
		half: 'patternSymmetryHalf',
		quarter: 'patternSymmetryQuarter',
		mirror: 'patternSymmetryMirror',
		twoMirrors: 'patternSymmetryTwoMirrors',
		fourMirrors: 'patternSymmetryFourMirrors'
	};
	const ROWS = (Object.keys(ROW_NAMES) as TileSymmetry[])
		.map((symmetry) => ({ symmetry, cells: COLUMNS.map(({ shapes }) => TYPES.filter((rule) => shapesOf(rule) === shapes && tileSymmetry(rule) === symmetry)) }))
		.filter((row) => row.cells.some((cell) => cell.length));

	let chosen = $derived(active ? typeKey(active) : '');

	function choose(next: unknown) {
		const rule = typeof next === 'string' ? RULES.get(next) : undefined;
		if (rule && typeKey(rule) !== chosen) onChoose(rule);
	}

	let text = $derived(active ? ruleText(active) : null);
	let code = $derived(active ? ruleCode(active) : null);
</script>

<div class="rule-templates" class:compact>
	{#if active && text}
		<p class="chosen">
			<span class="chosen-name">
				<strong>{tr(text.name)}</strong>
				{#if code}<span class="code" title={tr(code.startsWith('IH') ? 'patternIhNumber' : code.startsWith('p') ? 'patternWallpaperGroup' : 'patternHeeschCode')}>{code}</span>{/if}
			</span>
			<span>{tr(text.hint)}</span>
		</p>
		{@render children?.()}
	{/if}
	<ToggleGroup type="single" role="radiogroup" aria-label={tr('patternRuleTitle')} value={chosen} onValueChange={choose} {disabled}>
		<div class="table">
			<span></span>
			{#each COLUMNS as column (column.shapes)}
				<span class="column-name">{tr(column.name)}</span>
			{/each}
			{#each ROWS as row (row.symmetry)}
				<span class="row-name">{tr(ROW_NAMES[row.symmetry])}</span>
				{#each row.cells as cell, k (k)}
					<div class="cell">
						{#each cell as rule (typeKey(rule))}
							{@render glyph(rule)}
						{/each}
					</div>
				{/each}
			{/each}
		</div>
	</ToggleGroup>
</div>

{#snippet glyph(rule: TileRule)}
	{@const name = tr(ruleText(rule).name)}
	<ToggleGroupItem value={typeKey(rule)} aria-label={name} title={`${name}\n${tr(ruleText(rule).hint)}`} {...keepChosen(chosen === typeKey(rule))}>
		<TemplateGlyph {rule} size={compact ? 24 : 28} />
	</ToggleGroupItem>
{/snippet}

<style>
	.rule-templates {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.rule-templates :global([data-slot='toggle-group']) {
		display: block;
		padding: 0;
		background: none;
	}

	/* A column of row names, then one for each number of shapes: one shape holds the most types. */
	.table {
		display: grid;
		grid-template-columns: auto 3fr 2fr 1fr;
		gap: 3px;
		align-items: stretch;
	}

	.column-name,
	.row-name {
		font-size: 11px;
		font-weight: 600;
		line-height: 1.25;
		color: var(--muted);
	}

	.column-name {
		padding: 0 2px 2px;
	}

	.row-name {
		align-self: center;
		max-width: 68px;
		padding-right: 2px;
	}

	.cell {
		display: flex;
		flex-wrap: wrap;
		align-content: flex-start;
		gap: 2px;
		min-width: 0;
		padding: 3px;
		border-radius: 8px;
		background: var(--cream2, #f3f6f2);
	}

	.rule-templates :global([data-slot='toggle-group-item']) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: auto;
		min-width: 0;
		height: auto;
		padding: 1px;
		border: 1.5px solid transparent;
		border-radius: 7px;
		background: var(--white);
		box-shadow: none;
	}

	.rule-templates :global([data-slot='toggle-group-item']:hover) {
		border-color: var(--line);
		background: var(--white);
	}

	.rule-templates :global([data-slot='toggle-group-item'][data-state='on']) {
		border-color: var(--green);
		background: var(--white);
		box-shadow: 0 0 0 1px var(--green);
	}

	.compact .row-name {
		max-width: 54px;
		font-size: 10px;
	}

	.compact .column-name {
		font-size: 10px;
	}

	.chosen {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding-top: 2px;
		font-size: 12px;
		line-height: 1.4;
		color: var(--muted);
	}

	.chosen-name {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.chosen-name strong {
		font-size: 14px;
		color: var(--deep);
	}

	.code {
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
</style>
