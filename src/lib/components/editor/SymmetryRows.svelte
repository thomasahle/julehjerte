<!--
  The three symmetry rows — Inden i kurve / Inden i lap / Mellem lapper, each
  Fra · Sym · Anti (docs/redesign/PAINT.md §6).

  Tegn has shown them since the editor was built; Mal's "Find snit" panel asks
  for the very same three, because they are the same symmetries — one lane reads
  them off the cut geometry, the other folds the mask with them. Two copies of a
  segmented control is two things to restyle, so this is the one.

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
	import { ToggleGroup, ToggleGroupItem } from '$lib/components/ui/toggle-group';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/ui/tooltip';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import type { SymmetryMode, SymmetrySettings } from '$lib/paint/symmetry';

	type Row = keyof SymmetrySettings;

	interface Props {
		value: SymmetrySettings;
		onChange: (next: SymmetrySettings) => void;
		found?: SymmetrySettings | null;
		disabled?: Partial<Record<Row, boolean>>;
		lang: Language;
	}

	let { value, onChange, found = null, disabled = {}, lang }: Props = $props();

	const tr = (key: TranslationKey) => t(key, lang);

	const ROWS: { key: Row; label: TranslationKey; name: TranslationKey }[] = [
		{ key: 'curve', label: 'editorWithinCurve', name: 'editorWithinCurveSymmetry' },
		{ key: 'lobe', label: 'editorWithinLobe', name: 'editorWithinLobeSymmetry' },
		{ key: 'lobes', label: 'editorBetweenLobes', name: 'editorBetweenLobesSymmetry' }
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
							<ToggleGroup
								type="single"
								role="radiogroup"
								aria-label={tr(row.name)}
								value={value[row.key]}
								onValueChange={(next) => choose(row.key, next)}
								disabled={!!disabled[row.key]}
							>
								<ToggleGroupItem value="off" title={tr('editorOff')}>{tr('editorOff')}</ToggleGroupItem>
								<ToggleGroupItem value="sym" title={tr('mirrorSymmetry')}>{tr('editorSym')}</ToggleGroupItem>
								<ToggleGroupItem value="anti" title={tr('editorAntiSymmetry')}>{tr('editorAnti')}</ToggleGroupItem>
							</ToggleGroup>
						</span>
					{/snippet}
				</TooltipTrigger>
				<TooltipContent>
					{disabled[row.key] ? tr('editorRequiresEqualGridSize') : tr(row.name)}
				</TooltipContent>
			</Tooltip>
		{:else}
			<ToggleGroup
				type="single"
				role="radiogroup"
				aria-label={tr(row.name)}
				value={value[row.key]}
				onValueChange={(next) => choose(row.key, next)}
			>
				<ToggleGroupItem value="off" title={tr('editorOff')}>{tr('editorOff')}</ToggleGroupItem>
				<ToggleGroupItem value="sym" title={tr('mirrorSymmetry')}>{tr('editorSym')}</ToggleGroupItem>
				<ToggleGroupItem value="anti" title={tr('editorAntiSymmetry')}>{tr('editorAnti')}</ToggleGroupItem>
			</ToggleGroup>
		{/if}
	</div>
{/each}

<style>
	.symmetry-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
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
		display: inline-flex;
		gap: 0;
		padding: 0;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		overflow: hidden;
		background: var(--white);
	}

	.symmetry-row :global([data-slot='toggle-group-item']) {
		border-radius: 0;
		padding: 6px 10px;
		font-size: 13px;
		font-weight: 600;
		color: var(--green);
		background: var(--white);
		box-shadow: none;
	}

	.symmetry-row :global([data-slot='toggle-group-item']:hover) {
		background: var(--cream2);
		color: var(--green);
	}

	.symmetry-row :global([data-slot='toggle-group-item'][data-state='on']) {
		background: var(--green);
		color: var(--white);
	}

	.tooltip-wrapper {
		display: inline-flex;
	}
</style>
