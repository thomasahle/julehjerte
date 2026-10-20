<!--
  The Escher tab's rules as tile types, each drawn as Tom McLean draws one (TemplateGlyph): the red
  tile with half arrowheads on its sides, the same colour for sides of the same shape. Only types a
  woven heart can make, four tiles at every corner, and that the engine draws (tiling.ts
  `TileRule`): 28 of the 36 four-at-a-corner types — the others have no side that can take a shape —
  and two shapes, no rule at all. Four come first: moved and moved-and-mirrored, the two
  quadrilateral types tiled.art's gallery uses most; two shapes; and symmetric, every tile its own
  mirror image. The others are behind "Vis flere", in three groups: the rest of the ones with no
  straight side and no symmetry of the tile's own, the more used first; the ones with mirror edges,
  straight sides the tiles are mirrored in; and the ones whose tile has a symmetry of its own.

  One segment per type. Opposite pairs tied two different ways can lie either way round in the
  heart; a segment chooses its type the way its glyph shows it, and shows as chosen either way.
  The chosen rule is told underneath: its name, what it does and, small, Heesch's name for the type,
  or Grünbaum and Shephard's number where Heesch has none.

  compact   Tegn below 900px, where the panel leaves its column for a row under the drawing and can
            be 235px wide: the segments keep their glyph alone, its name their accessible name, and
            "Vis flere" is a glyph of its own.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import { ToggleGroup, ToggleGroupItem, keepChosen } from '$lib/components/ui/toggle-group';
	import { COMMON_RULES, neighbours, ofType, opposite, ruleKey, type TileRule } from '$lib/pattern/rules';
	import { ruleCode, ruleText } from '$lib/pattern/names';
	import TemplateGlyph from './TemplateGlyph.svelte';

	interface Props {
		lang: Language;
		/** The chosen rule, or null while none is. */
		active: TileRule | null;
		onChoose: (rule: TileRule) => void;
		compact?: boolean;
		disabled?: boolean;
	}

	let { lang, active, onChoose, compact = false, disabled = false }: Props = $props();

	const tr = (key: TranslationKey) => t(key, lang);

	/** A rule's tile type: opposite pairs tied the same two ways are one type, whichever pair is which. */
	function typeKey(rule: TileRule): string {
		return rule.sides === 'opposite' ? `opposite:${[rule.v, rule.h].sort().join(':')}` : ruleKey(rule);
	}

	const COMMON = COMMON_RULES;
	const GROUPS: { title: TranslationKey | null; rules: TileRule[] }[] = [
		{
			title: null,
			rules: [opposite('turn', 'turn'), opposite('mirror', 'turn'), opposite('move', 'turn'), opposite('mirror', 'mirror'), neighbours('mirror'), neighbours('turn'), ofType(53)]
		},
		{ title: 'patternMoreMirrorEdges', rules: ([42, 45, 49, 50, 54, 56] as const).map(ofType) },
		{ title: 'patternMoreOwnSymmetry', rules: ([57, 58, 59, 61, 62, 64, 66, 67, 68, 69, 71, 74] as const).map(ofType) }
	];
	const MORE = GROUPS.flatMap((g) => g.rules);
	const RULES = new Map([...COMMON, ...MORE].map((rule) => [typeKey(rule), rule]));
	const isMore = (rule: TileRule) => MORE.some((r) => typeKey(r) === typeKey(rule));

	// Open on a rule from the others, and open again when one comes back (undo, say).
	let expanded = $state(untrack(() => !!active && isMore(active)));
	$effect(() => {
		if (active && isMore(active)) expanded = true;
	});

	let chosen = $derived(active ? typeKey(active) : '');

	function choose(next: unknown) {
		const rule = typeof next === 'string' ? RULES.get(next) : undefined;
		if (rule && typeKey(rule) !== chosen) onChoose(rule);
	}

	let text = $derived(active ? ruleText(active) : null);
	let code = $derived(active ? ruleCode(active) : null);
</script>

<div class="rule-templates" class:compact>
	<div class="choices">
	<ToggleGroup type="single" role="radiogroup" aria-label={tr('patternRuleTitle')} value={chosen} onValueChange={choose} {disabled}>
		{#each COMMON as rule (typeKey(rule))}
			{@render segment(rule, false)}
		{/each}
		{#if expanded}
			{#each GROUPS as group, g (g)}
				{#if group.title}<p class="group-title">{tr(group.title)}</p>{/if}
				<!-- An odd group's last segment takes its whole row, so the next title starts a row. -->
				{#each group.rules as rule, k (typeKey(rule))}
					{@render segment(rule, !compact && group.rules.length % 2 === 1 && k === group.rules.length - 1)}
				{/each}
			{/each}
		{/if}
	</ToggleGroup>
	<button type="button" class="more" aria-expanded={expanded} title={tr(expanded ? 'patternShowFewer' : 'patternShowMore')} onclick={() => (expanded = !expanded)}>
		<span class:sr-only={compact}>{tr(expanded ? 'patternShowFewer' : 'patternShowMore')}</span>
		<span class="chevron" class:open={expanded} aria-hidden="true">▾</span>
	</button>
	</div>

	{#if active && text}
		<p class="chosen">
			<span class="chosen-name">
				<strong>{tr(text.name)}</strong>
				{#if code}<span class="code" title={tr(code.startsWith('IH') ? 'patternIhNumber' : 'patternHeeschCode')}>{code}</span>{/if}
			</span>
			<span>{tr(text.hint)}</span>
		</p>
	{/if}
</div>

{#snippet segment(rule: TileRule, wide: boolean)}
	{@const name = tr(ruleText(rule).name)}
	<ToggleGroupItem value={typeKey(rule)} title={name} class={wide ? 'wide' : undefined} {...keepChosen(chosen === typeKey(rule))}>
		<TemplateGlyph {rule} size={compact ? 34 : 48} />
		<span class:sr-only={compact}>{name}</span>
	</ToggleGroupItem>
{/snippet}

<style>
	.rule-templates,
	.choices {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.choices {
		gap: 4px;
	}

	/* Two to a row, glyph beside its name. */
	.rule-templates :global([data-slot='toggle-group']) {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		align-items: stretch;
		gap: 6px;
		padding: 0;
		background: none;
	}

	.rule-templates :global([data-slot='toggle-group-item']) {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: flex-start;
		gap: 6px;
		min-width: 0;
		height: auto;
		padding: 4px 8px 4px 4px;
		border: 1.5px solid var(--line);
		border-radius: 10px;
		background: var(--white);
		color: var(--green);
		font-size: 12px;
		font-weight: 600;
		line-height: 1.25;
		text-align: left;
		white-space: normal;
		box-shadow: none;
	}

	.rule-templates :global([data-slot='toggle-group-item']:hover) {
		background: var(--cream2);
		color: var(--green);
	}

	.rule-templates :global([data-slot='toggle-group-item'][data-state='on']) {
		border-color: var(--green);
		background: var(--green);
		color: var(--white);
	}

	/* The glyph keeps its own white ground on the chosen, green segment. */
	.rule-templates :global([data-slot='toggle-group-item'] .template) {
		border-radius: 8px;
		background: var(--white);
	}

	.rule-templates :global([data-slot='toggle-group-item'].wide) {
		grid-column: 1 / -1;
	}

	.group-title {
		grid-column: 1 / -1;
		margin: 6px 0 0;
		font-size: 12px;
		font-weight: 600;
		color: var(--muted);
	}

	.more {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 4px 8px;
		border: none;
		background: none;
		color: var(--green);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.more:hover {
		text-decoration: underline;
	}

	.chevron {
		display: inline-block;
		transition: transform 0.15s ease;
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	/* Below 900px: the glyphs alone, five to a row, and the toggle a glyph of its own beside them. */
	.compact .choices {
		flex-direction: row;
		align-items: flex-start;
	}

	.compact :global([data-slot='toggle-group']) {
		flex: 1;
		grid-template-columns: repeat(5, 1fr);
		gap: 4px;
	}

	.compact :global([data-slot='toggle-group-item']) {
		justify-content: center;
		padding: 3px;
	}

	.compact .more {
		padding: 0;
		font-size: 18px;
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

	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}
</style>
