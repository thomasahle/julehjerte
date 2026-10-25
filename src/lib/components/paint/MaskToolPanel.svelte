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
		EraserIcon,
		ImageIcon,
		LineIcon,
		PaintBucketIcon,
		PencilIcon,
		PushIcon,
		RedoIcon,
		SelectIcon,
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
		clampBrush,
		clampSmudge,
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
		/** What Udtvær does: push, twirl or bulge. */
		smudgeMode?: SmudgeMode;
		onSmudgeMode?: (mode: SmudgeMode) => void;
		/** The symmetries on, which an even board of Tern cannot always follow. */
		symmetry?: SymmetrySettings;
		/** A put-down selection holds the tools inside it. */
		fenceHeld?: boolean;
		onDeselect?: () => void;
		/** Tern: lay an `n` × `n` board, over the mask or inside the selection. */
		onChecks?: (n: number) => void;
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
		brushShape = 'round',
		onBrushShape = () => {},
		smudgeMode = 'push',
		onSmudgeMode = () => {},
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
		{ id: 'eraser', label: 'paintEraser', icon: EraserIcon, key: 'E' },
		{ id: 'fill', label: 'paintFill', icon: PaintBucketIcon, key: 'F' },
		{ id: 'line', label: 'paintLine', icon: LineIcon, key: 'L' },
		{ id: 'rect', label: 'paintRect', icon: SquareIcon, key: 'R' },
		{ id: 'smudge', label: 'paintSmudge', icon: SmudgeIcon, key: 'U' },
		{ id: 'select', label: 'paintSelect', icon: SelectIcon, key: 'M' }
	];

	/** Udtvær's three ways with the paper, each with its own glyph. */
	const SMUDGE_MODES: { id: SmudgeMode; label: TranslationKey; icon: Component<IconProps> }[] = [
		{ id: 'push', label: 'paintSmudgePush', icon: PushIcon },
		{ id: 'twirl', label: 'paintSmudgeTwirl', icon: TwirlIcon },
		{ id: 'bulge', label: 'paintSmudgeBulge', icon: BulgeIcon }
	];

	/** The boards Tern offers: a plain heart of three strips up to nine. */
	const BOARDS = [3, 4, 5, 6, 7, 8, 9];

	let transforms = $derived(transformsFor(symmetry));


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
		<!-- Tern sits at the heading's far end: a way to start the mask over, like
		     the two buttons above the panel, but one whose answer is painted with
		     these tools, and the heading's row was free. -->
		<div class="panel-head">
			<h2 class="panel-title">{tr('paintTools')}</h2>
			<DropdownMenu>
				<DropdownMenuTrigger {disabled}>
					{#snippet child({ props })}
						<button {...props} type="button" class="checks-btn" title={tr(fenceHeld ? 'paintChecksInSelection' : 'paintChecksHint')}>
							<ChecksIcon size={14} />
							{tr('paintChecks')}
						</button>
					{/snippet}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{#each BOARDS as n (n)}
						{@const kept = checksKeepSymmetry(n, transforms)}
						<DropdownMenuItem disabled={!kept} onSelect={() => onChecks(n)} title={kept ? undefined : tr('paintChecksEvenMirror')}>
							{t('paintChecksSize', lang, { n })}
						</DropdownMenuItem>
					{/each}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>

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

		<!-- Udtvær's three ways with the paper, only while it is the tool in hand:
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

		<label class="field brush-field">
			<span class="field-label brush-label">
				<span>{tr('paintBrush')}</span>
				<span class="brush-heads" role="group" aria-label={tr('paintBrushShape')}>
					{#each ['round', 'square'] as const as shape (shape)}
						<button
							type="button"
							class="head-btn"
							class:active={brushShape === shape}
							aria-pressed={brushShape === shape}
							aria-label={tr(shape === 'round' ? 'paintBrushRound' : 'paintBrushSquare')}
							title={tr(shape === 'round' ? 'paintBrushRound' : 'paintBrushSquare')}
							onclick={() => onBrushShape(shape)}
							{disabled}
						>
							<span class="head {shape}" aria-hidden="true"></span>
						</button>
					{/each}
				</span>
				<output>{t('paintBrushRadius', lang, { size: brushSize })}</output>
			</span>
			<input
				type="range"
				min={tool === 'smudge' ? MIN_SMUDGE_SIZE : MIN_BRUSH_SIZE}
				max={tool === 'smudge' ? MAX_SMUDGE_SIZE : MAX_BRUSH_SIZE}
				step="1"
				value={brushSize}
				aria-label={tr('paintBrush')}
				aria-valuetext={t('paintBrushRadius', lang, { size: brushSize })}
				oninput={(event) => onBrushSize((tool === 'smudge' ? clampSmudge : clampBrush)(event.currentTarget.valueAsNumber))}
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
						/>
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

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.checks-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 26px;
		padding: 0 10px;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		background: var(--white);
		color: var(--green);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}

	.checks-btn:hover:not(:disabled) {
		background: var(--cream2);
	}

	.checks-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	/* Seven 40px icon buttons, as wide as the panel allows. */
	.tool-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
	}

	/* Udtvær's modes: three words with their glyphs, sharing the panel's width,
	   in the tools' own square and colours. */
	.smudge-modes {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
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

	.mode-btn {
		height: 32px;
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
	   their corner: drawn as it will look on the drawing. */
	.head.square {
		transform: rotate(45deg) scale(0.9);
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
		background: conic-gradient(
			var(--white) 0% 25%,
			var(--red) 25% 50%,
			var(--white) 50% 75%,
			var(--red) 75% 100%
		);
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
