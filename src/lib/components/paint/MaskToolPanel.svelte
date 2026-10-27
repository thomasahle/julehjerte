<!--
  Mal's left column (docs/redesign/PAINT.md §2, decision 4): the two things that
  replace the mask wholesale, and the tools that change it in place.

  Paper colours live in the header (ColorControls). The paper swatches and XOR here
  choose how the tool edits the binary mask; they never change the paper colours.
-->
<script lang="ts">
	import { ToggleGroup, ToggleGroupItem } from '$lib/components/ui/toggle-group';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/ui/tooltip';
	import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '$lib/components/ui/dropdown-menu';
	import {
		BulgeIcon,
		ChecksIcon,
		ChevronDownIcon,
		EllipseIcon,
		ImageIcon,
		LineIcon,
		PaintBucketIcon,
		PencilIcon,
		PushIcon,
		RedoIcon,
		SelectIcon,
		ShrinkIcon,
		SmudgeIcon,
		SquareIcon,
		TrashIcon,
		TwirlIcon,
		UndoIcon
	} from '$lib/components/icons';
	import type { IconProps } from '$lib/components/icons/types';
	import type { Component } from 'svelte';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import type { HeartColors } from '$lib/types/heart';
	import {
		MIN_BRUSH_SIZE,
		MAX_BRUSH_SIZE,
		MIN_SMUDGE_SIZE,
		MAX_SMUDGE_SIZE,
		MIN_SMUDGE_STRENGTH,
		MAX_SMUDGE_STRENGTH,
		DEFAULT_SMUDGE_STRENGTH,
		SIZE_SLIDER_STEPS,
		BRUSH_SHAPES,
		BRUSH_TOOLS,
		clampStrength,
		sizeOfSlider,
		sliderOfSize,
		type BrushShape,
		type BrushSize,
		type PaintTool,
		type PaintValue,
		type SmudgeMode
	} from '$lib/paint/toolset';
	import { checksKeepSymmetry } from '$lib/paint/tools';
	import { NO_SYMMETRY, transformsFor, type SymmetrySettings } from '$lib/paint/symmetry';

	interface Props {
		tool: PaintTool;
		onTool: (tool: PaintTool) => void;
		brushSize: BrushSize;
		onBrushSize: (size: BrushSize) => void;
		/** The brush's head, round or square. */
		brushShape?: BrushShape;
		onBrushShape?: (shape: BrushShape) => void;
		/** What Udtvær does: push, twirl, bulge or shrink. */
		smudgeMode?: SmudgeMode;
		onSmudgeMode?: (mode: SmudgeMode) => void;
		/** How hard Udtvær works, in percent. */
		smudgeStrength?: number;
		onSmudgeStrength?: (strength: number) => void;
		/** The symmetries on, which an even board of Tern cannot always follow. */
		symmetry?: SymmetrySettings;
		/** A put-down selection holds the tools inside it. */
		fenceHeld?: boolean;
		onDeselect?: () => void;
		/** Tern, Ryd's menu: lay an `n` × `n` board, over the mask or inside the selection. */
		onChecks?: (n: number) => void;
		/** Paper colour or XOR action. */
		paintValue: PaintValue;
		onPaintValue: (value: PaintValue) => void;
		colors: HeartColors;
		canUndo: boolean;
		canRedo: boolean;
		onUndo: () => void;
		onRedo: () => void;
		onImport: () => void;
		/** Ryd: one blank paper. */
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
		brushShape = 'round',
		onBrushShape = () => {},
		smudgeMode = 'push',
		onSmudgeMode = () => {},
		smudgeStrength = DEFAULT_SMUDGE_STRENGTH,
		onSmudgeStrength = () => {},
		symmetry = NO_SYMMETRY,
		fenceHeld = false,
		onDeselect = () => {},
		onChecks = () => {},
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

	/** The seven tools, their glyphs, and the letter that picks each one. */
	const TOOLS: { id: PaintTool; label: TranslationKey; icon: Component<IconProps>; key: string }[] = [
		{ id: 'pen', label: 'paintPen', icon: PencilIcon, key: 'P' },
		{ id: 'fill', label: 'paintFill', icon: PaintBucketIcon, key: 'F' },
		{ id: 'line', label: 'paintLine', icon: LineIcon, key: 'L' },
		{ id: 'rect', label: 'paintRect', icon: SquareIcon, key: 'R' },
		{ id: 'ellipse', label: 'paintEllipse', icon: EllipseIcon, key: 'O' },
		{ id: 'smudge', label: 'paintSmudge', icon: SmudgeIcon, key: 'U' },
		{ id: 'select', label: 'paintSelect', icon: SelectIcon, key: 'M' }
	];

	/** Udtvær's four ways with the paper, each with its own glyph. */
	const SMUDGE_MODES: { id: SmudgeMode; label: TranslationKey; icon: Component<IconProps> }[] = [
		{ id: 'push', label: 'paintSmudgePush', icon: PushIcon },
		{ id: 'twirl', label: 'paintSmudgeTwirl', icon: TwirlIcon },
		{ id: 'bulge', label: 'paintSmudgeBulge', icon: BulgeIcon },
		{ id: 'shrink', label: 'paintSmudgeShrink', icon: ShrinkIcon }
	];

	/** Each head's name, which says how it lies on the drawing (see `brushHead.ts`). */
	const HEAD_LABELS: Record<BrushShape, TranslationKey> = {
		round: 'paintBrushRound',
		square: 'paintBrushSquare',
		diamond: 'paintBrushDiamond',
		chisel: 'paintBrushChisel'
	};

	/** The boards Tern offers: a plain heart of three strips up to nine. */
	const BOARDS = [3, 4, 5, 6, 7, 8, 9];

	let transforms = $derived(transformsFor(symmetry));

	/** The sizes the brush slider spans: Udtvær keeps its own. */
	let smallest = $derived(tool === 'smudge' ? MIN_SMUDGE_SIZE : MIN_BRUSH_SIZE);
	let largest = $derived(tool === 'smudge' ? MAX_SMUDGE_SIZE : MAX_BRUSH_SIZE);


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
		<!-- Ryd and Tern are one split button: Ryd starts over on a blank paper,
		     and the arrow beside it starts over on a board of checks instead (or
		     fills the selection with them). Both replace the mask, and both are
		     one undo step. -->
		<div class="clear-split">
			<button
				type="button"
				class="btn btn-sm btn-ghost clear-btn"
				onclick={onClear}
				disabled={disabled || clearDisabled}
			>
				<TrashIcon size={16} />
				{tr('paintClear')}
			</button>
			<DropdownMenu>
				<DropdownMenuTrigger {disabled}>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							class="btn btn-sm btn-ghost btn-icon checks-btn"
							aria-label={tr('paintChecks')}
							title={tr(fenceHeld ? 'paintChecksInSelection' : 'paintChecksHint')}
						>
							<ChevronDownIcon size={16} />
						</button>
					{/snippet}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{#each BOARDS as n (n)}
						{@const kept = checksKeepSymmetry(n, transforms)}
						<DropdownMenuItem disabled={!kept} onSelect={() => onChecks(n)} title={kept ? undefined : tr('paintChecksEvenMirror')}>
							<ChecksIcon size={14} />
							{t('paintChecksSize', lang, { n })}
						</DropdownMenuItem>
					{/each}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
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

		<!-- Udtvær's four ways with the paper, only while it is the tool in hand:
		     what each does is in its name and tooltip, and Alt's reversal in Hjælp. -->
		{#if tool === 'smudge'}
			<div class="smudge-modes" role="group" aria-label={tr('paintSmudgeModes')}>
				{#each SMUDGE_MODES as mode (mode.id)}
					<button
						type="button"
						class="mode-btn"
						class:active={smudgeMode === mode.id}
						aria-pressed={smudgeMode === mode.id}
						title={tr('paintSmudgeAlt')}
						onclick={() => onSmudgeMode(mode.id)}
						{disabled}
					>
						<mode.icon size={16} />
						{tr(mode.label)}
					</button>
				{/each}
			</div>
			<label class="field brush-field">
				<span class="field-label brush-label">
					<span>{tr('paintSmudgeStrength')}</span>
					<output>{t('paintSmudgeStrengthValue', lang, { n: smudgeStrength })}</output>
				</span>
				<input
					type="range"
					min={MIN_SMUDGE_STRENGTH}
					max={MAX_SMUDGE_STRENGTH}
					step="5"
					value={smudgeStrength}
					aria-label={tr('paintSmudgeStrength')}
					aria-valuetext={t('paintSmudgeStrengthValue', lang, { n: smudgeStrength })}
					oninput={(event) => onSmudgeStrength(clampStrength(event.currentTarget.valueAsNumber))}
					{disabled}
				/>
			</label>
		{/if}

		<!-- While a selection holds the tools, say so where the tools are, with the
		     way out beside it: a stroke that stops at an edge nobody remembers
		     drawing reads as a broken pen. -->
		{#if fenceHeld}
			<p class="tool-hint fence-note" role="status">
				{tr('paintFenceActive')}
				<button type="button" class="link-btn" onclick={onDeselect} {disabled}>{tr('paintDeselect')}</button>
			</p>
		{/if}

		<!-- The brush's head and size, only for the tools that paint with it. -->
		{#if BRUSH_TOOLS.includes(tool)}
			<label class="field brush-field">
				<span class="field-label brush-label">
					<span>{tr('paintBrush')}</span>
					<span class="brush-heads" role="group" aria-label={tr('paintBrushShape')}>
						{#each BRUSH_SHAPES as shape (shape)}
							<button
								type="button"
								class="head-btn"
								class:active={brushShape === shape}
								aria-pressed={brushShape === shape}
								aria-label={tr(HEAD_LABELS[shape])}
								title={tr(HEAD_LABELS[shape])}
								onclick={() => onBrushShape(shape)}
								{disabled}
							>
								<span class="head {shape}" aria-hidden="true"></span>
							</button>
						{/each}
					</span>
					<output>{t('paintBrushRadius', lang, { size: brushSize })}</output>
				</span>
				<!-- The slider moves the size by ratio (see `sizeOfSlider`): a pen
				     reaches 200 cells, and a fine one must stay easy to set. -->
				<input
					type="range"
					min="0"
					max={SIZE_SLIDER_STEPS}
					step="1"
					value={sliderOfSize(brushSize, smallest, largest)}
					aria-label={tr('paintBrush')}
					aria-valuetext={t('paintBrushRadius', lang, { size: brushSize })}
					oninput={(event) => onBrushSize(sizeOfSlider(event.currentTarget.valueAsNumber, smallest, largest))}
					{disabled}
				/>
			</label>
		{/if}

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
						style="--left-paper: {colors.left}; --right-paper: {colors.right}"
					/>
				</ToggleGroup>
			</div>
		</div>

		<!-- Fortryd and Gentag in words, on a row of their own under the papers:
		     Ryd, an import and a heart brought over from Tegn replace the mask
		     without asking, and Fortryd is the way back, so it has to be found
		     without hovering for a tooltip. Both are also at Cmd/Ctrl+Z. -->
		<div class="history" role="group" aria-label={tr('editorHistory')}>
			{#each HISTORY as item (item.id)}
				<button
					type="button"
					class="tool-btn"
					onclick={item.id === 'undo' ? onUndo : onRedo}
					disabled={disabled || !(item.id === 'undo' ? canUndo : canRedo)}
				>
					<item.icon size={18} />
					{tr(item.label)}
				</button>
			{/each}
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

	.mask-actions > .btn,
	.clear-split {
		flex: 1 1 0;
	}

	.mask-actions .btn {
		background: var(--white);
	}

	/* The two halves share one border between them, as one button split in two. */
	.clear-split {
		display: flex;
		min-width: 0;
	}

	.clear-btn {
		flex: 1 1 0;
		min-width: 0;
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
	}

	.checks-btn {
		margin-left: -1.5px;
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
	}

	/* Seven 40px icon buttons, as wide as the panel allows. */
	.tool-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
	}

	/* Udtvær's modes: four words with their glyphs, sharing the panel's width,
	   in the tools' own square and colours. */
	.smudge-modes {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 4px;
	}

	.mode-btn,
	.head-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 0;
		border: 1.5px solid var(--line);
		border-radius: 10px;
		background: var(--white);
		color: var(--green);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	/* Four words to a row: a little smaller than the tools' own, so Krymp and
	   Shrink fit beside their glyphs in the narrowest column. */
	.mode-btn {
		height: 32px;
		gap: 4px;
		font-size: 12px;
	}

	.mode-btn:hover:not(:disabled),
	.head-btn:hover:not(:disabled) {
		background: var(--cream2);
	}

	.mode-btn.active,
	.head-btn.active {
		background: var(--green);
		border-color: var(--green);
		color: var(--white);
	}

	.mode-btn:disabled,
	.head-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.fence-note {
		display: flex;
		flex-wrap: wrap;
		gap: 0 6px;
		align-items: baseline;
	}

	.link-btn {
		padding: 0;
		border: 0;
		background: none;
		color: var(--green);
		font: inherit;
		font-weight: 600;
		text-decoration: underline;
		cursor: pointer;
	}

	/* The brush's two heads, as small as the label row they sit in. */
	.brush-heads {
		display: inline-flex;
		gap: 3px;
		margin-right: auto;
	}

	.head-btn {
		width: 26px;
		height: 20px;
		border-radius: 6px;
	}

	.head {
		display: block;
		width: 9px;
		height: 9px;
		background: currentColor;
	}

	.head.round {
		border-radius: 50%;
	}

	/* On the mask the square lies along the strips, which the heart turns on
	   their corner: drawn as it will look on the drawing. The diamond lies across
	   them, so it stands upright, and the chisel is a bar along a strip. */
	.head.square {
		transform: rotate(45deg) scale(0.9);
	}

	.head.diamond {
		transform: scale(0.85);
	}

	.head.chisel {
		width: 3px;
		height: 11px;
		transform: rotate(45deg);
	}

	/* The tools and the two history buttons are one button under one name.
	   `app.css` has the site's own 40px `.btn .btn-sm`, and the history buttons
	   could wear it, but it differs from the tools' button in small ways at once
	   (a transparent ground against white, 0.5 opacity when disabled against
	   0.35). Two nearly-but-not-quite identical buttons in one panel is worse
	   than one local name, so the tools' button wins here; the history buttons
	   only add their words (see `.history`). Only the tools are ever `.active`,
	   so the rules below belong to them alone. */
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

	/* The two papers it swaps between, in the colours the header chose. */
	.swatches :global(.xor-swatch) {
		background: conic-gradient(
			var(--left-paper) 0% 25%,
			var(--right-paper) 25% 50%,
			var(--left-paper) 50% 75%,
			var(--right-paper) 75% 100%
		);
	}

	.swatches :global([data-slot='toggle-group']) {
		display: flex;
		justify-content: flex-start;
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

	.history {
		display: flex;
		gap: 8px;
	}

	.history .tool-btn {
		flex: 1 1 0;
		gap: 6px;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
	}
</style>
