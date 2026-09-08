<!--
  The three symmetry rows — Inden i kurve / Inden i lap / Mellem lapper, each
  Fra · Sym · Anti (docs/redesign/PAINT.md §6).

  Tegn has shown them since the editor was built; Mal's "Find snit" panel asks
  for the very same three, because they are the same symmetries — one lane reads
  them off the cut geometry, the other folds the mask with them. Two copies of a
  segmented control is two things to restyle, so this is the one.

  Each segment carries the glyph for its own row and mode (SymmetryIcon), which
  is what the setting will do to the cuts, and the word beside it, which is what
  it is called. The row's name then only has to be read once.

  Props:
    value      the three rows as they stand
    onChange   the whole settings object, with one row changed
    found      what detection suggested; a row it marks gets a "fundet" pill
    disabled   rows the caller can switch off. A row named here — whether or not
               it is disabled right now — carries a tooltip: it is the row whose
               availability the caller controls, so it is the row a visitor may
               find greyed out and wonder about. Tegn names `lobes`, which needs
               an equal number of strips on both lobes; Mal names none.
    lang       the page language
-->
<script lang="ts">
	import { SymmetryIcon } from '$lib/components/icons';
	import { ToggleGroup, ToggleGroupItem } from '$lib/components/ui/toggle-group';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/ui/tooltip';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import type { SymmetryMode, SymmetrySettings } from '$lib/paint/symmetry';

	type Row = keyof SymmetrySettings;
	type RowSpec = { key: Row; label: TranslationKey; name: TranslationKey };

	interface Props {
		value: SymmetrySettings;
		onChange: (next: SymmetrySettings) => void;
		found?: SymmetrySettings | null;
		disabled?: Partial<Record<Row, boolean>>;
		lang: Language;
	}

	let { value, onChange, found = null, disabled = {}, lang }: Props = $props();

	const tr = (key: TranslationKey) => t(key, lang);

	const ROWS: RowSpec[] = [
		{ key: 'curve', label: 'editorWithinCurve', name: 'editorWithinCurveSymmetry' },
		{ key: 'lobe', label: 'editorWithinLobe', name: 'editorWithinLobeSymmetry' },
		{ key: 'lobes', label: 'editorBetweenLobes', name: 'editorBetweenLobesSymmetry' }
	];

	// Word and tooltip per segment. The tooltip is the long name — "Spejlsymmetri"
	// for Sym — and it is also what a visitor gets on the phone, where the segment
	// keeps the glyph alone.
	const MODES: { mode: SymmetryMode; word: TranslationKey; title: TranslationKey }[] = [
		{ mode: 'off', word: 'editorOff', title: 'editorOff' },
		{ mode: 'sym', word: 'editorSym', title: 'mirrorSymmetry' },
		{ mode: 'anti', word: 'editorAnti', title: 'editorAntiSymmetry' }
	];

	function isMode(v: unknown): v is SymmetryMode {
		return v === 'off' || v === 'sym' || v === 'anti';
	}

	// A single-choice ToggleGroup lets a second click on the chosen item clear the
	// group, which would leave a row on no mode at all — neither Fra nor Sym nor
	// Anti, and read as "on" by everything downstream. A row always means one of
	// the three, so an empty answer keeps what was there.
	function choose(key: Row, next: unknown): void {
		if (!isMode(next) || next === value[key]) return;
		onChange({ ...value, [key]: next });
	}
</script>

<!-- One segmented control, rendered the same whether or not the row is wrapped
     in a tooltip. -->
{#snippet control(row: RowSpec)}
	<ToggleGroup
		type="single"
		role="radiogroup"
		aria-label={tr(row.name)}
		value={value[row.key]}
		onValueChange={(next) => choose(row.key, next)}
		disabled={!!disabled[row.key]}
	>
		{#each MODES as segment (segment.mode)}
			<ToggleGroupItem value={segment.mode} title={tr(segment.title)}>
				<SymmetryIcon row={row.key} mode={segment.mode} />
				<!-- Kept in the DOM when the phone hides it: it is the segment's
				     accessible name, and the title repeats it as a tooltip. -->
				<span class="seg-word">{tr(segment.word)}</span>
			</ToggleGroupItem>
		{/each}
	</ToggleGroup>
{/snippet}

{#each ROWS as row (row.key)}
	<div class="symmetry-row">
		<span class="symmetry-label">
			{tr(row.label)}
			{#if found && found[row.key] !== 'off'}
				<span class="found-tag">{tr('paintSymmetryDetected')}</span>
			{/if}
		</span>
		{#if row.key in disabled}
			<!-- The row the caller can take away: say what it is, or why it is gone. -->
			<Tooltip>
				<TooltipTrigger>
					{#snippet child({ props })}
						<span class="tooltip-wrapper" {...props}>
							{@render control(row)}
						</span>
					{/snippet}
				</TooltipTrigger>
				<TooltipContent>
					{disabled[row.key] ? tr('editorRequiresEqualGridSize') : tr(row.name)}
				</TooltipContent>
			</Tooltip>
		{:else}
			{@render control(row)}
		{/if}
	</div>
{/each}

<style>
	/* Label above, control below: with a 28px glyph and a word in each segment
	   the control is wider than the 340px panel leaves beside a row name. */
	.symmetry-row {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 6px;
	}

	.symmetry-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--ink);
		font-size: 14px;
		white-space: nowrap;
	}

	/* "fundet": detection put this row on, and the visitor may take it off again. */
	.found-tag {
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--gold);
		color: var(--deep);
		font-size: 11px;
		font-weight: 600;
		line-height: 1.5;
	}

	/* Segmented Fra / Sym / Anti control, restyled from the shadcn ToggleGroup. */
	.symmetry-row :global([data-slot='toggle-group']) {
		display: flex;
		width: 100%;
		gap: 0;
		padding: 0;
		border: 1.5px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
		background: var(--white);
	}

	/* Equal thirds, 40px tall — the height the glyph was drawn for. */
	.symmetry-row :global([data-slot='toggle-group-item']) {
		flex: 1 1 0;
		min-width: 0;
		gap: 7px;
		height: 40px;
		border-radius: 0;
		padding: 0 8px;
		font-size: 13px;
		font-weight: 600;
		color: var(--green);
		background: var(--white);
		box-shadow: none;
	}

	/* The dividers belong to the control, not to the segments, so the selected
	   segment's green runs edge to edge. */
	.symmetry-row :global([data-slot='toggle-group-item'] + [data-slot='toggle-group-item']) {
		border-left: 1px solid var(--line);
	}

	.symmetry-row :global([data-slot='toggle-group-item']:hover) {
		background: var(--cream2);
		color: var(--green);
	}

	.symmetry-row :global([data-slot='toggle-group-item'][data-state='on']) {
		background: var(--green);
		color: var(--white);
		/* A glyph's accent mark, white-on-green: --red would go nearly black. */
		--icon-accent: var(--red-tint);
	}

	.tooltip-wrapper {
		display: inline-flex;
		width: 100%;
	}

	/* Phone: the panel floats over the canvas, so the rows go back to one line
	   and the segments keep the glyph alone. The word stays as the segment's
	   name for a screen reader, and the title as its tooltip. */
	@media (max-width: 599px) {
		.symmetry-row {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: 10px;
		}

		/* Both, or the wrapped row's control would sit at the left edge of a
		   full-width wrapper while the other two stay right. */
		.symmetry-row :global([data-slot='toggle-group']),
		.tooltip-wrapper {
			width: auto;
		}

		.symmetry-row :global([data-slot='toggle-group-item']) {
			flex: none;
			padding: 0 10px;
		}

		.seg-word {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}
</style>
