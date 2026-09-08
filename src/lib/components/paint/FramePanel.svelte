<!--
  "Kanten" — the third panel of Mal's left column (docs/redesign/PAINT.md §11,
  and docs/inverse/MOTIF-BORDER.md).

  A heart from the flettedehjerter.dk archive is usually a motif in the middle
  and a plain weave around the edges, and the engine needs that band: an
  isolated silhouette gives the fitter nothing to weave with near the square's
  corners. So the visitor says which part of the square is theirs — a shape, a
  size — and whether the rest is theirs too (Fast) or the search's to fill (Fri).

  "Må rettes", the third state of §11 where the engine may change a few band
  cells at a cost, needs per-cell loss weights the engine does not have yet. It
  is not shown at all rather than shown greyed out: an option nobody can pick is
  a promise, and this one has no date on it.

  The three shape buttons draw their own glyph from the same `shapeOutline` the
  canvas uses, turned as the heart turns it, so the button shows the shape the
  way the visitor will see it and cannot drift from what is drawn.
-->
<script lang="ts">
	import { ToggleGroup, ToggleGroupItem } from '$lib/components/ui/toggle-group';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import {
		clampFrameSize,
		FRAME_MAX_SIZE,
		FRAME_MIN_SIZE,
		shapeOutline,
		type Frame,
		type FrameShape
	} from '$lib/paint/frame';

	interface Props {
		frame: Frame;
		/**
		 * A gesture that will change the frame is beginning.
		 *
		 * Every change here folds the mask — the rows apply to the protected motif
		 * alone while the band is free, so moving its edge folds cells that were
		 * left alone or stops folding cells that were not. The page snapshots for
		 * undo on this rather than on `onFrame`, because the slider fires on every
		 * pixel of a drag and that whole drag is one edit.
		 */
		onFrameStart?: () => void;
		onFrame: (next: Frame) => void;
		/**
		 * Nothing here can be changed: the engine is working and the frame decides
		 * what it is working on, or the found heart is on screen and the whole left
		 * column stands down until "Tilbage til masken" brings the mask back.
		 */
		disabled?: boolean;
		lang: Language;
	}

	let { frame, onFrameStart, onFrame, disabled = false, lang }: Props = $props();

	const tr = (key: TranslationKey) => t(key, lang);

	const SHAPES: { id: FrameShape; label: TranslationKey }[] = [
		{ id: 'diamond', label: 'paintFrameShapeDiamond' },
		{ id: 'circle', label: 'paintFrameShapeCircle' },
		{ id: 'hexagon', label: 'paintFrameShapeHexagon' }
	];

	/** The slider works in whole percent; the frame keeps the share of the square. */
	let percent = $derived(Math.round(frame.size * 100));

	// A click that changes nothing — the mode or the shape already chosen — says
	// nothing: a gesture announced here ends in an undo step, and a step that puts
	// back exactly what is there is one the visitor has to press through for no
	// reason. `SymmetryRows` guards its rows the same way.
	function setMode(next: unknown): void {
		if ((next !== 'fixed' && next !== 'free') || next === frame.mode) return;
		onFrameStart?.();
		onFrame({ ...frame, mode: next });
	}

	function setShape(shape: FrameShape): void {
		if (shape === frame.shape) return;
		onFrameStart?.();
		onFrame({ ...frame, shape });
	}

	function setSize(raw: string): void {
		const value = Number(raw);
		if (!Number.isFinite(value)) return;
		onFrame({ ...frame, size: clampFrameSize(value / 100) });
	}

	/**
	 * A drag of the slider, or one press of an arrow key on it, is beginning.
	 *
	 * A held-down key repeats, and each repeat would otherwise be its own undo
	 * step; the whole run is one gesture, so only the first press counts.
	 */
	function startSize(event: PointerEvent | KeyboardEvent): void {
		if ('repeat' in event && event.repeat) return;
		onFrameStart?.();
	}

	/** One shape as an SVG path in the unit square, for the button glyphs. */
	function glyphPath(shape: FrameShape): string {
		const outline = shapeOutline(shape, 0.68);
		if (outline.kind === 'circle') {
			const { cx, cy, r } = outline;
			return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
		}
		return `${outline.points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')} Z`;
	}
</script>

<section class="editor-panel">
	<h2 class="panel-title">{tr('paintFrame')}</h2>

	<div class="field">
		<div class="segmented">
			<ToggleGroup
				type="single"
				role="radiogroup"
				aria-label={tr('paintFrame')}
				value={frame.mode}
				onValueChange={setMode}
				{disabled}
			>
				<ToggleGroupItem value="fixed">{tr('paintFrameFixed')}</ToggleGroupItem>
				<ToggleGroupItem value="free">{tr('paintFrameFree')}</ToggleGroupItem>
			</ToggleGroup>
		</div>
	</div>

	<div class="field">
		<span class="field-label" id="paint-frame-shape">{tr('paintFrameShape')}</span>
		<div class="shape-grid" role="group" aria-labelledby="paint-frame-shape">
			{#each SHAPES as item (item.id)}
				<button
					type="button"
					class="shape-btn"
					class:active={frame.shape === item.id}
					aria-pressed={frame.shape === item.id}
					title={tr(item.label)}
					onclick={() => setShape(item.id)}
					{disabled}
				>
					<!-- The woven square and the shape inside it, turned the quarter of a
					     right angle the heart turns them: the corners of the viewBox hold
					     the square's diagonal, which is √2 wide. -->
					<svg viewBox="-0.25 -0.25 1.5 1.5" width="26" height="26" aria-hidden="true">
						<g transform="rotate(45 0.5 0.5)">
							<rect
								x="0"
								y="0"
								width="1"
								height="1"
								fill="none"
								stroke="currentColor"
								stroke-width="0.05"
								opacity="0.35"
							/>
							<path d={glyphPath(item.id)} fill="currentColor" opacity="0.85" />
						</g>
					</svg>
					<span class="shape-label">{tr(item.label)}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="field">
		<label class="field-label" for="paint-frame-size">
			{tr('paintFrameSize')}
			<span class="value">{percent} %</span>
		</label>
		<input
			id="paint-frame-size"
			type="range"
			min={Math.round(FRAME_MIN_SIZE * 100)}
			max={Math.round(FRAME_MAX_SIZE * 100)}
			step="1"
			value={percent}
			onpointerdown={startSize}
			onkeydown={startSize}
			oninput={(e) => setSize(e.currentTarget.value)}
			{disabled}
		/>
	</div>

	<p class="note">{tr(frame.mode === 'free' ? 'paintFrameHintFree' : 'paintFrameHintFixed')}</p>
</section>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}

	.value {
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}

	.note {
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--muted);
	}

	/* The same restyled ToggleGroup as the brush row opposite, so the two
	   segmented controls in the column are one control seen twice. */
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

	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
	}

	.shape-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 6px 2px 4px;
		border: 1.5px solid var(--line);
		border-radius: 10px;
		background: var(--white);
		color: var(--green);
		font-family: inherit;
		cursor: pointer;
		transition:
			background-color 0.15s,
			color 0.15s;
	}

	/* Not on the chosen one: its own rule below is less specific, so hovering the
	   button that is already pressed would otherwise wash the green out. */
	.shape-btn:hover:not(:disabled):not(.active) {
		background: var(--cream2);
	}

	.shape-btn.active {
		background: var(--green);
		border-color: var(--green);
		color: var(--white);
	}

	.shape-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.shape-label {
		font-size: 11px;
		font-weight: 600;
	}

	input[type='range'] {
		width: 100%;
		accent-color: var(--green);
		cursor: pointer;
	}

	input[type='range']:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
</style>
