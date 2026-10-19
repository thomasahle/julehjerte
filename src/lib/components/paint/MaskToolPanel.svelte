<!--
  Mal's left column (docs/redesign/PAINT.md §2, decision 4): the two things that
  replace the mask wholesale, and the tools that change it in place.

  Farver and Hjertedetaljer stay in Tegn. The paper swatches and XOR here choose
  how the tool edits the binary mask; they never change the paper colours.
-->
<script lang="ts">
	import { ToggleGroup, ToggleGroupItem } from '$lib/components/ui/toggle-group';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/ui/tooltip';
	import {
		EraserIcon,
		ImageIcon,
		LineIcon,
		PaintBucketIcon,
		PencilIcon,
		RedoIcon,
		SelectIcon,
		SquareIcon,
		TrashIcon,
		UndoIcon
	} from '$lib/components/icons';
	import type { IconProps } from '$lib/components/icons/types';
	import type { Component } from 'svelte';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import type { HeartColors } from '$lib/types/heart';
	import { MIN_BRUSH_SIZE, MAX_BRUSH_SIZE, clampBrush, type BrushSize, type PaintTool, type PaintValue } from '$lib/paint/toolset';

	interface Props {
		tool: PaintTool;
		onTool: (tool: PaintTool) => void;
		brushSize: BrushSize;
		onBrushSize: (size: BrushSize) => void;
		/** Paper colour or XOR action; the eraser always paints the left paper. */
		paintValue: PaintValue;
		onPaintValue: (value: PaintValue) => void;
		colors: HeartColors;
		canUndo: boolean;
		canRedo: boolean;
		onUndo: () => void;
		onRedo: () => void;
		onImport: () => void;
		onClear: () => void;
		/** Nothing to clear: the mask is already blank. */
		clearDisabled?: boolean;
		/** The engine is working; nothing here may change the mask under it. */
		disabled?: boolean;
		lang: Language;
	}

	let {
		tool,
		onTool,
		brushSize,
		onBrushSize,
		paintValue,
		onPaintValue,
		colors,
		canUndo,
		canRedo,
		onUndo,
		onRedo,
		onImport,
		onClear,
		clearDisabled = false,
		disabled = false,
		lang
	}: Props = $props();

	const tr = (key: TranslationKey) => t(key, lang);

	/** The six tools, their glyphs, and the letter that picks each one. */
	const TOOLS: { id: PaintTool; label: TranslationKey; icon: Component<IconProps>; key: string }[] = [
		{ id: 'pen', label: 'paintPen', icon: PencilIcon, key: 'P' },
		{ id: 'eraser', label: 'paintEraser', icon: EraserIcon, key: 'E' },
		{ id: 'fill', label: 'paintFill', icon: PaintBucketIcon, key: 'F' },
		{ id: 'line', label: 'paintLine', icon: LineIcon, key: 'L' },
		{ id: 'rect', label: 'paintRect', icon: SquareIcon, key: 'R' },
		{ id: 'select', label: 'paintSelect', icon: SelectIcon, key: 'M' }
	];

	/** The two history buttons, in the order a hand reaches for them. */
	const HISTORY: { id: 'undo' | 'redo'; label: TranslationKey; icon: Component<IconProps> }[] = [
		{ id: 'undo', label: 'editorUndo', icon: UndoIcon },
		{ id: 'redo', label: 'editorRedo', icon: RedoIcon }
	];

	/** The two papers, as the mask numbers them: 0 is the left lobe, 1 the right. */
	const PAPERS: (0 | 1)[] = [0, 1];

	// Clicking the selected ToggleGroup item cannot leave the painting action unset.
	function choosePaper(next: unknown): void {
		if (next === 'xor') onPaintValue('xor');
		else if (next === '0' || next === '1') onPaintValue(next === '1' ? 1 : 0);
	}
</script>

<div class="tool-column">
	<div class="mask-actions">
		<button type="button" class="btn btn-sm btn-outline" onclick={onImport} {disabled}>
			<ImageIcon size={16} />
			{tr('paintImportImage')}
		</button>
		<button
			type="button"
			class="btn btn-sm btn-ghost"
			onclick={onClear}
			disabled={disabled || clearDisabled}
		>
			<TrashIcon size={16} />
			{tr('paintClear')}
		</button>
	</div>

	<section class="editor-panel">
		<h2 class="panel-title">{tr('paintTools')}</h2>

		<div class="tool-grid" role="group" aria-label={tr('paintTools')}>
			{#each TOOLS as item (item.id)}
				<Tooltip>
					<TooltipTrigger>
						{#snippet child({ props })}
							<!-- The tooltip's props go first, as they do in GalleryBar: they
							     carry an `onclick` of their own, and the last spread wins. Put
							     them last and clicking a tool does nothing at all — only the
							     keyboard shortcuts still change tools. What we drop by winning is
							     the tooltip's close-on-click, which its `onpointerdown` has done
							     a moment earlier anyway. -->
							<button
								{...props}
								type="button"
								class="tool-btn"
								class:active={tool === item.id}
								aria-pressed={tool === item.id}
								aria-label={tr(item.label)}
								onclick={() => onTool(item.id)}
								{disabled}
							>
								<!-- The line tool is lucide's minus, stood on the diagonal so it
								     reads as a line you draw rather than a "remove" glyph. -->
								<span class="tool-glyph" class:diagonal={item.id === 'line'}>
									<item.icon size={20} />
								</span>
							</button>
						{/snippet}
					</TooltipTrigger>
					<TooltipContent>{tr(item.label)} · {item.key}</TooltipContent>
				</Tooltip>
			{/each}
		</div>

		<!-- Markér is the one tool whose gestures cannot be guessed from its glyph, so
		     it says so while it is the tool in hand. One line, not five: the five it
		     used to be pushed Kanten off the bottom of every desktop column, and the
		     handles, the turner and the keyboard's own way through the lot are now in
		     the Hjælp dialog, where there is room to read them. What stays is what a
		     visitor cannot recover by trying: the two keys that end the gesture.
		     role="status" because M can pick the tool without a pointer ever coming
		     near it, and the one piece of help there is has to be heard. -->
		{#if tool === 'select'}
			<p class="tool-hint" role="status">{tr('paintSelectionShort')}</p>
		{/if}

		<label class="field brush-field">
			<span class="field-label brush-label">
				<span>{tr('paintBrush')}</span>
				<output>{t('paintBrushRadius', lang, { size: brushSize })}</output>
			</span>
			<input
				type="range"
				min={MIN_BRUSH_SIZE}
				max={MAX_BRUSH_SIZE}
				step="1"
				value={brushSize}
				aria-label={tr('paintBrush')}
				aria-valuetext={t('paintBrushRadius', lang, { size: brushSize })}
				oninput={(event) => onBrushSize(clampBrush(event.currentTarget.valueAsNumber))}
				{disabled}
			/>
		</label>

		<!-- Fortryd and Gentag share the swatches' row rather than taking a row of
		     their own: two labelled buttons across the panel cost a line the column
		     has not got, and both are already at Cmd/Ctrl+Z. As icons they are the
		     same 40px square as the tools above, so the panel reads as one grid of
		     buttons with the two papers set into it — and the words survive in the
		     tooltip and the accessible name, which is what a labelled button gave.

		     They sit beside "Maler med" and not inside it: the field's label heads
		     the swatches alone, and two history buttons under a heading that says
		     "Maler med" read as a third and fourth thing to paint with. -->
		<div class="paper-row">
			<div class="field">
				<span class="field-label">{tr('paintsWith')}</span>
				<div class="swatches">
					<ToggleGroup
						type="single"
						role="radiogroup"
						aria-label={tr('paintsWith')}
						bind:value={() => String(paintValue), choosePaper}
						{disabled}
					>
						{#each PAPERS as value (value)}
							<ToggleGroupItem
								value={String(value)}
								aria-label={value ? tr('paintsWithRight') : tr('paintsWithLeft')}
								title={value ? tr('paintsWithRight') : tr('paintsWithLeft')}
								style="background: {value ? colors.right : colors.left}"
							/>
						{/each}
						<ToggleGroupItem
							value="xor"
							aria-label={tr('paintsWithXor')}
							title={tr('paintsWithXor')}
							class="xor-swatch"
						>
							<span aria-hidden="true">XOR</span>
						</ToggleGroupItem>
					</ToggleGroup>
				</div>
			</div>

			<!-- The same Tooltip the six tools above wear, rather than a native
			     `title`: a title never fires on keyboard focus, and these two are the
			     only glyph-only buttons in the panel a visitor could tab to and be
			     told nothing about. `aria-label` stays either way, for the reader
			     that has no pointer and no tooltip. -->
			<div class="history" role="group" aria-label={tr('editorHistory')}>
				{#each HISTORY as item (item.id)}
					<Tooltip>
						<TooltipTrigger>
							{#snippet child({ props })}
								<!-- The tooltip's props first, as in the tool grid above: they carry
								     an `onclick` of their own and the last spread wins. -->
								<button
									{...props}
									type="button"
									class="tool-btn"
									aria-label={tr(item.label)}
									onclick={item.id === 'undo' ? onUndo : onRedo}
									disabled={disabled || !(item.id === 'undo' ? canUndo : canRedo)}
								>
									<item.icon size={20} />
								</button>
							{/snippet}
						</TooltipTrigger>
						<TooltipContent>{tr(item.label)}</TooltipContent>
					</Tooltip>
				{/each}
			</div>
		</div>
	</section>
</div>

<style>
	.tool-column {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 100%;
	}

	.mask-actions {
		display: flex;
		gap: 8px;
	}

	.mask-actions .btn {
		flex: 1 1 0;
		background: var(--white);
	}

	/* Six 40px icon buttons, as wide as the panel allows. */
	.tool-grid {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 4px;
	}

	/* The tools and the two history buttons are one square under one name.
	   `app.css` declares the site's own 40px glyph button as `.btn .btn-sm
	   .btn-icon`, and the history buttons could wear it — but they stand in a row
	   with the six tools directly above them, and the site's square differs from
	   the tools' in three small ways at once (an 18px glyph against 20, a
	   transparent ground against white, and 0.5 opacity when disabled against
	   0.35). Two nearly-but-not-quite identical squares in one panel is worse than
	   one local name, so the tools' square wins here and there is no second one.
	   Only the tools are ever `.active`, so the rules below belong to them alone. */
	.tool-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 40px;
		padding: 0;
		border: 1.5px solid var(--line);
		border-radius: 10px;
		background: var(--white);
		color: var(--green);
		cursor: pointer;
		transition:
			background-color 0.15s,
			color 0.15s;
	}

	/* In the grid above, the six squares stretch to their column; in the history
	   row there is no grid to stretch to, so the square is stated. */
	.history .tool-btn {
		width: 40px;
	}

	.tool-btn:hover:not(:disabled) {
		background: var(--cream2);
	}

	.tool-btn.active {
		background: var(--green);
		border-color: var(--green);
		color: var(--white);
	}

	/* The chosen tool keeps its dark fill under the pointer. `:hover` above carries
	   one pseudo-class more than `.active`, so it won the background while `.active`
	   kept the colour, and the chosen tool's glyph went white on pale sage — the
	   one icon in the row nobody could read was the one saying which tool you had. */
	.tool-btn.active:hover:not(:disabled) {
		background: var(--green-hover);
		border-color: var(--green-hover);
	}

	.tool-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.tool-glyph {
		display: inline-flex;
	}

	.tool-hint {
		margin: 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--muted);
	}

	.tool-glyph.diagonal {
		transform: rotate(-45deg);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}

	.brush-label {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}

	.brush-label output {
		font-weight: 400;
		font-variant-numeric: tabular-nums;
	}

	.brush-field input {
		width: 100%;
		margin: 0;
		accent-color: var(--green);
		cursor: pointer;
	}

	.brush-field input:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.swatches :global(.xor-swatch) {
		background: var(--cream2);
		color: var(--green);
		font-size: 10px;
		font-weight: 700;
	}

	.swatches :global([data-slot='toggle-group']) {
		display: flex;
		gap: 10px;
		padding: 0;
		background: none;
	}

	/* The chosen paper is ringed rather than ticked: a tick would have to be
	   drawn in a colour, and the swatch is the colour. */
	.swatches :global([data-slot='toggle-group-item']) {
		width: 34px;
		height: 34px;
		padding: 0;
		border: 1.5px solid var(--line);
		border-radius: 50%;
		box-shadow: none;
		cursor: pointer;
	}

	.swatches :global([data-slot='toggle-group-item'][data-state='on']) {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	.swatches :global([data-slot='toggle-group-item']:disabled) {
		opacity: 0.35;
		cursor: not-allowed;
	}

	/* The swatches sit under their label as every other control does; the two
	   history buttons are pushed to the far end, where they read as a pair of
	   their own rather than as a third and fourth paper. Aligned at the bottom,
	   so the 40px squares sit on the same line as the 34px swatches beside them
	   rather than floating against the label above. */
	.paper-row {
		display: flex;
		align-items: flex-end;
		gap: 10px;
	}

	.history {
		display: flex;
		gap: 4px;
		margin-left: auto;
	}
</style>
