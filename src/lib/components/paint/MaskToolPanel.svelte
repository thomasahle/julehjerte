<!--
  Mal's left column (docs/redesign/PAINT.md §2, decision 4): the two things that
  replace the mask wholesale, and the tools that change it in place.

  Farver and Hjertedetaljer stay in Tegn; the two swatches here only say which
  paper the pen lays down, which is why they are inside "Værktøj" and not a
  colour panel of their own.
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
		SquareIcon,
		TrashIcon,
		UndoIcon
	} from '$lib/components/icons';
	import type { IconProps } from '$lib/components/icons/types';
	import type { Component } from 'svelte';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import type { HeartColors } from '$lib/types/heart';
	import { BRUSH_SIZES, type BrushSize, type PaintTool } from '$lib/paint/toolset';

	interface Props {
		tool: PaintTool;
		onTool: (tool: PaintTool) => void;
		brushSize: BrushSize;
		onBrushSize: (size: BrushSize) => void;
		/** Which paper the pen paints; the eraser always paints the left one. */
		paintValue: 0 | 1;
		onPaintValue: (value: 0 | 1) => void;
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

	/** The five tools, their glyphs, and the letter that picks each one. */
	const TOOLS: { id: PaintTool; label: TranslationKey; icon: Component<IconProps>; key: string }[] = [
		{ id: 'pen', label: 'paintPen', icon: PencilIcon, key: 'P' },
		{ id: 'eraser', label: 'paintEraser', icon: EraserIcon, key: 'E' },
		{ id: 'fill', label: 'paintFill', icon: PaintBucketIcon, key: 'F' },
		{ id: 'line', label: 'paintLine', icon: LineIcon, key: 'L' },
		{ id: 'rect', label: 'paintRect', icon: SquareIcon, key: 'R' }
	];

	/** The two papers, as the mask numbers them: 0 is the left lobe, 1 the right. */
	const PAPERS: (0 | 1)[] = [0, 1];

	const BRUSH_LABELS: Record<BrushSize, TranslationKey> = {
		fine: 'paintBrushFine',
		medium: 'paintBrushMedium',
		coarse: 'paintBrushCoarse'
	};

	// A single-choice ToggleGroup lets a second click on the chosen item clear the
	// group, and neither of these two controls has an "off": one brush is always
	// the brush, one paper is always the paper. So an empty answer keeps what was
	// there, as the symmetry rows do with the same control.
	function chooseBrush(next: unknown): void {
		if (BRUSH_SIZES.includes(next as BrushSize)) onBrushSize(next as BrushSize);
	}

	function choosePaper(next: unknown): void {
		if (next === '0' || next === '1') onPaintValue(next === '1' ? 1 : 0);
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
							<!-- The tooltip's props go first, as they do in GalleryToolbar: they
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

		<!-- Both of these are one choice out of several, which is a radiogroup: one
		     tab stop, and the arrow keys to move within it. Declaring the role over
		     plain buttons was worse than the aria-pressed grid above, because it
		     promised a keyboard behaviour that was not there. The ToggleGroup the
		     symmetry rows use brings it, and it is the same control on screen. -->
		<div class="field">
			<span class="field-label">{tr('paintBrush')}</span>
			<div class="segmented">
				<ToggleGroup
					type="single"
					role="radiogroup"
					aria-label={tr('paintBrush')}
					value={brushSize}
					onValueChange={chooseBrush}
					{disabled}
				>
					{#each BRUSH_SIZES as size (size)}
						<ToggleGroupItem value={size}>{tr(BRUSH_LABELS[size])}</ToggleGroupItem>
					{/each}
				</ToggleGroup>
			</div>
		</div>

		<div class="field">
			<span class="field-label">{tr('paintsWith')}</span>
			<div class="swatches">
				<ToggleGroup
					type="single"
					role="radiogroup"
					aria-label={tr('paintsWith')}
					value={String(paintValue)}
					onValueChange={choosePaper}
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
				</ToggleGroup>
			</div>
		</div>

		<div class="history" role="group" aria-label={tr('editorHistory')}>
			<button
				type="button"
				class="btn btn-sm btn-ghost"
				onclick={onUndo}
				disabled={disabled || !canUndo}
			>
				<UndoIcon size={16} />
				{tr('editorUndo')}
			</button>
			<button
				type="button"
				class="btn btn-sm btn-ghost"
				onclick={onRedo}
				disabled={disabled || !canRedo}
			>
				<RedoIcon size={16} />
				{tr('editorRedo')}
			</button>
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

	/* Five 40px icon buttons, as wide as the panel allows. */
	.tool-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 4px;
	}

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

	.tool-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.tool-glyph {
		display: inline-flex;
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

	/* Both groups are the shadcn ToggleGroup restyled, so the rules reach through
	   :global to the elements bits-ui renders — the same way SymmetryRows dresses
	   the identical control in the panel opposite. */
	.segmented :global([data-slot='toggle-group']) {
		display: flex;
		gap: 0;
		padding: 0;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		overflow: hidden;
		background: var(--white);
	}

	.segmented :global([data-slot='toggle-group-item']) {
		flex: 1 1 0;
		padding: 6px 8px;
		border-radius: 0;
		background: var(--white);
		color: var(--green);
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		box-shadow: none;
		cursor: pointer;
	}

	.segmented :global([data-slot='toggle-group-item']:hover:not(:disabled)) {
		background: var(--cream2);
		color: var(--green);
	}

	.segmented :global([data-slot='toggle-group-item'][data-state='on']) {
		background: var(--green);
		color: var(--white);
	}

	.segmented :global([data-slot='toggle-group-item']:disabled) {
		opacity: 0.35;
		cursor: not-allowed;
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

	.history {
		display: flex;
		gap: 8px;
	}

	.history .btn {
		flex: 1 1 0;
	}
</style>
