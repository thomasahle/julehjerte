<!--
  The site's paper colours — docs/redesign/DESIGN.md §3 "Nav", "As built:
  colours in the header": three round buttons of one size.

    1. Red and white ("Rød og hvid"): a circle split into the default white and
       red. A press puts the classic pair on and turns the colourful mode off;
       pressed again while the classic pair is already on, it swaps the sides,
       and its picture follows (`html.paper-flipped`).
    2. Colourful ("Farverig", $lib/stores/colorMode): four papers in a plain
       2×2 grid. Each press deals every heart that follows the site's pair a
       new random pair ($lib/utils/palette), and the grid deals itself anew
       with them: it shows the strong papers of the first four pairs of the
       shuffle that differ in colour family (palette.iconPairs, the
       `--pal-icon-*` variables on <html>), or rowan red, spruce, navy and gold
       while the mode is off.
    3. Your own colours ("Egne farver"): split into the visitor's own pair,
       which is saved apart from the pair on show ($lib/stores/colors,
       getCustomColors), whenever there is one (`html.paper-has-custom`), a
       calm ring of the palette's pale papers before. A press opens the colour
       dialog on that pair (or, before there is one, on the pair on show): a
       preview, the two colour pickers, a swap button, the palette's twelve
       pairs as quick picks and "Færdig". Changes apply as they are made, are
       saved as the visitor's own pair, and turn the colourful mode off.
       "Færdig" puts the dialog's pair on even with nothing changed, so the
       visitor can go back to a pair made earlier; Escape, Back and the scrim
       just close it.

  Whichever of the three is on wears a 2px --green ring. The ring and the two
  pictures that follow the pair are drawn from the classes and the --paper-*
  tokens on <html>, which the head's inline script sets from storage before the
  body paints, so a reload shows the right state from the first frame.
  `aria-pressed` says the same to a screen reader on the first two; the third
  opens a dialog and says so. Without JavaScript the group is hidden: none of
  it works then.

  PageHeader renders this twice: compact in the bar from 900px up (`bar`,
  22px circles), and as a labelled row in the burger menu below that (`menu`,
  28px circles). Every button has a 44px hit area. Both copies are in the DOM,
  so the dialog's ids carry the variant. The editor-style header (Tegn, Mal,
  the designer) has no burger and carries only the `bar` copy, since the
  design tools have no colour controls of their own; Tegn and Mal drop it
  below 900px, where their bar is full.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { t, type Language } from '$lib/i18n';
	import {
		DEFAULT_COLORS,
		DEFAULT_COLORS_HEX,
		getColors,
		setColors,
		flipColors,
		getCustomColors,
		paperKind,
		setCustomColors,
		subscribeColors,
		type HeartColors
	} from '$lib/stores/colors';
	import { getColorMode, shuffleColorMode, subscribeColorMode, turnOffColorMode } from '$lib/stores/colorMode';
	import { trackColorMode, trackPaperColors } from '$lib/analytics';
	import { SwapIcon } from '$lib/components/icons';
	import Modal from '$lib/components/Modal.svelte';
	import { PALETTE } from '$lib/utils/palette';
	import { toHexColor } from '$lib/utils/heartColors';

	interface Props {
		lang: Language;
		variant: 'bar' | 'menu';
	}

	let { lang, variant }: Props = $props();

	let colors = $state<HeartColors>({ ...DEFAULT_COLORS });
	let colorful = $state(false);
	let kind = $derived(paperKind(colors));
	let classicOn = $derived(!colorful && kind !== 'custom');

	onMount(() => {
		colors = getColors();
		colorful = getColorMode();
		const offColors = subscribeColors((c) => {
			colors = c;
		});
		const offMode = subscribeColorMode((on) => {
			colorful = on;
		});
		return () => {
			offColors();
			offMode();
		};
	});

	/** Choosing a pair is asking for one pair everywhere: the colourful mode goes. */
	function leaveColorful() {
		if (!getColorMode()) return;
		turnOffColorMode();
		trackColorMode(false);
	}

	function classic() {
		if (classicOn) {
			flipColors();
			trackPaperColors('flip');
			return;
		}
		leaveColorful();
		if (kind !== 'classic') setColors({ ...DEFAULT_COLORS });
		trackPaperColors('classic');
	}

	// The presses in this page view, for the analytics event.
	let shuffles = 0;

	function shuffle() {
		shuffleColorMode();
		shuffles += 1;
		trackColorMode(true, shuffles);
	}

	// The colourful button's picture with the mode off: four of the palette's
	// papers, plain. With it on, the stylesheet fills cell k from the
	// shuffle's slot k instead.
	const pick = (name: string, side: 'left' | 'right') => PALETTE.find((p) => p.name === name)![side];
	const GRID = [
		{ x: 0, y: 0, fill: pick('rønnebær', 'right') },
		{ x: 12, y: 0, fill: pick('gran', 'right') },
		{ x: 0, y: 12, fill: pick('nat', 'right') },
		{ x: 12, y: 12, fill: pick('nat', 'left') }
	];

	// The dialog.
	let dialogOpen = $state(false);
	let customButton = $state<HTMLButtonElement | null>(null);
	let doneButton = $state<HTMLButtonElement | null>(null);
	let leftInput = $state<HTMLInputElement | null>(null);
	let rightInput = $state<HTMLInputElement | null>(null);
	const titleId = $derived(`paper-dialog-title-${variant}`);

	// The pair the dialog shows and edits: the visitor's own, or before they
	// have one, the pair on show.
	let draft = $state<HeartColors>({ ...DEFAULT_COLORS });

	// The inputs are given their value here rather than by attribute: a dynamic
	// `value` on <input type="color"> momentarily holds "" while Svelte sets it.
	$effect(() => {
		if (leftInput) leftInput.value = toHexColor(draft.left, DEFAULT_COLORS_HEX.left);
		if (rightInput) rightInput.value = toHexColor(draft.right, DEFAULT_COLORS_HEX.right);
	});

	function openDialog() {
		draft = getCustomColors() ?? getColors();
		dialogOpen = true;
	}

	/** Escape, Back, the scrim: just close. Changes made are already on. */
	function closeDialog() {
		if (!dialogOpen) return;
		dialogOpen = false;
		// The button that opened it is still there; focus goes back to it.
		tick().then(() => customButton?.focus());
	}

	/** "Færdig": the dialog's pair goes on, changed or not. */
	function done() {
		const shown = getColors();
		if (getColorMode() || shown.left !== draft.left || shown.right !== draft.right) {
			leaveColorful();
			setColors({ ...draft });
			trackPaperColors('saved');
		}
		setCustomColors(draft);
		closeDialog();
	}

	/** A change in the dialog: on at once, and saved as the visitor's own pair. */
	function applyDraft(next: HeartColors) {
		draft = { ...next };
		leaveColorful();
		setColors({ ...next });
		setCustomColors(next);
	}

	function pickSide(side: 'left' | 'right', value: string) {
		applyDraft(side === 'left' ? { ...draft, left: value } : { ...draft, right: value });
	}

	function swapInDialog() {
		applyDraft({ left: draft.right, right: draft.left });
		trackPaperColors('flip');
	}

	function preset(pair: HeartColors) {
		applyDraft({ left: pair.left, right: pair.right });
		trackPaperColors('preset');
	}

	const isCurrent = (pair: HeartColors) =>
		toHexColor(draft.left, '') === pair.left && toHexColor(draft.right, '') === pair.right;
</script>

<div class="colors colors-{variant}" role="group" aria-label={t('paperColors', lang)}>
	{#if variant === 'menu'}
		<span class="colors-label" aria-hidden="true">{t('paperColors', lang)}</span>
	{/if}
	<button
		type="button"
		class="round"
		aria-pressed={classicOn}
		aria-label={t('paperClassic', lang)}
		title={t('paperClassicTitle', lang)}
		onclick={classic}
	>
		<span class="dot classic-dot"></span>
	</button>
	<button
		type="button"
		class="round"
		aria-pressed={colorful}
		aria-label={t('colorfulMode', lang)}
		title={t('colorfulModeTitle', lang)}
		onclick={shuffle}
	>
		<span class="dot colorful-dot">
			<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
				{#each GRID as cell, i (cell.fill)}
					<rect class="cell-{i}" x={cell.x} y={cell.y} width="12" height="12" fill={cell.fill} />
				{/each}
			</svg>
		</span>
	</button>
	<button
		type="button"
		class="round"
		bind:this={customButton}
		aria-haspopup="dialog"
		aria-expanded={dialogOpen}
		aria-label={t('paperCustom', lang)}
		title={t('paperCustomTitle', lang)}
		onclick={openDialog}
	>
		<span class="dot custom-dot"></span>
	</button>
</div>

<Modal open={dialogOpen} labelledBy={titleId} width="min(400px, 100%)" initialFocus={doneButton} onClose={closeDialog}>
	<div class="dialog">
		<h2 id={titleId}>{t('paperDialogTitle', lang)}</h2>

		<div class="editor-row">
			<span
				class="preview"
				aria-hidden="true"
				style="--l: {draft.left}; --r: {draft.right};"
			></span>
			<div class="pickers">
				<label class="picker">
					<span class="picker-dot"
						><input
							type="color"
							bind:this={leftInput}
							oninput={(e) => pickSide('left', (e.target as HTMLInputElement).value)}
							onchange={() => trackPaperColors('custom')}
						/></span
					>
					<span>{t('leftColor', lang)}</span>
				</label>
				<label class="picker">
					<span class="picker-dot"
						><input
							type="color"
							bind:this={rightInput}
							oninput={(e) => pickSide('right', (e.target as HTMLInputElement).value)}
							onchange={() => trackPaperColors('custom')}
						/></span
					>
					<span>{t('rightColor', lang)}</span>
				</label>
				<button type="button" class="swap" onclick={swapInDialog}>
					<SwapIcon size={16} />
					<span>{t('swapColors', lang)}</span>
				</button>
			</div>
		</div>

		<h3>{t('paperPresets', lang)}</h3>
		<div class="presets">
			{#each PALETTE as pair (pair.name)}
				<button
					type="button"
					class="preset"
					aria-pressed={isCurrent(pair)}
					aria-label={pair.label[lang]}
					title={pair.label[lang]}
					onclick={() => preset(pair)}
				>
					<span class="dot" style="--l: {pair.left}; --r: {pair.right};"></span>
				</button>
			{/each}
		</div>

		<div class="actions">
			<button type="button" class="done" bind:this={doneButton} onclick={done}>
				{t('paperDone', lang)}
			</button>
		</div>
	</div>
</Modal>

<style>
	.colors {
		display: inline-flex;
		align-items: center;
	}

	.colors-label {
		margin-right: auto;
		font-size: 16px;
		font-weight: 500;
		color: var(--green);
	}

	/* Each button is a transparent 44px target around its circle. */
	.round,
	.preset {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.dot {
		display: block;
		box-sizing: border-box;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 1px solid var(--line);
		overflow: hidden;
		/* A split circle, left paper | right paper; each button sets the two. */
		background: linear-gradient(90deg, var(--l) 50%, var(--r) 50%);
	}

	.colors-menu .dot {
		width: 28px;
		height: 28px;
	}

	/* Grouped: the 44px targets overlap a little, so the circles sit closer
	   (10px apart in the bar, 8px in the menu) without shrinking the targets. */
	.colors-bar .round {
		margin: 0 -6px;
	}

	.colors-menu .round {
		margin: 0 -4px;
	}

	.round:hover .dot,
	.preset:hover .dot {
		border-color: var(--sage-dark);
	}

	.classic-dot {
		--l: #ffffff;
		--r: #b91313;
	}

	:global(html.paper-flipped) .classic-dot {
		--l: #b91313;
		--r: #ffffff;
	}

	.colorful-dot {
		background: none;
	}

	.colorful-dot svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	/* Nothing of the visitor's own yet: the palette's pale papers, calm. */
	.custom-dot {
		background: conic-gradient(#f0cbc6, #efe6cf, #cfe3d2, #dde8f0, #efdfe6, #f0cbc6);
	}

	/* The visitor's own pair, on show or not (the ring says whether it is). */
	:global(html.paper-has-custom) .custom-dot {
		--l: var(--custom-left);
		--r: var(--custom-right);
		background: linear-gradient(90deg, var(--l) 50%, var(--r) 50%);
	}

	/* In the colourful mode the grid shows four of the shuffle's strong papers,
	   from different colour families (palette.iconPairs). */
	:global(html.colorful) .colorful-dot .cell-0 {
		fill: var(--pal-icon-0);
	}

	:global(html.colorful) .colorful-dot .cell-1 {
		fill: var(--pal-icon-1);
	}

	:global(html.colorful) .colorful-dot .cell-2 {
		fill: var(--pal-icon-2);
	}

	:global(html.colorful) .colorful-dot .cell-3 {
		fill: var(--pal-icon-3);
	}

	@media (prefers-reduced-motion: no-preference) {
		.colorful-dot rect {
			transition: fill 0.4s ease;
		}
	}

	/* The one that is on wears the ring: from the classes on <html>, so it is
	   right on the first frame. */
	:global(html:not(.colorful):not(.paper-custom)) .classic-dot,
	:global(html.colorful) .colorful-dot,
	:global(html.paper-custom:not(.colorful)) .custom-dot,
	.preset[aria-pressed='true'] .dot {
		outline: 2px solid var(--green);
		outline-offset: 1px;
	}

	/* The menu's row: the label at the left, the buttons at the right. */
	.colors-menu {
		display: flex;
		gap: 4px;
		padding: 4px 2px;
		border-bottom: 1px solid var(--line);
	}

	/* The buttons need the scripts, so without them there are none. */
	:global(html.no-js) .colors {
		display: none;
	}

	/* The dialog. */
	.dialog h2 {
		margin: 0 0 16px;
		font-size: 20px;
		font-weight: 600;
		color: var(--deep);
	}

	.dialog h3 {
		margin: 20px 0 6px;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.editor-row {
		display: flex;
		align-items: center;
		gap: 20px;
	}

	.preview {
		flex: none;
		width: 88px;
		height: 88px;
		border-radius: 50%;
		border: 1px solid var(--line);
		background: linear-gradient(90deg, var(--l) 50%, var(--r) 50%);
	}

	.pickers {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.picker,
	.swap {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		font-size: 15px;
		color: var(--ink);
		cursor: pointer;
	}

	.picker-dot {
		display: inline-flex;
		flex: none;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: 1px solid var(--line);
		overflow: hidden;
	}

	/* A colour input paints its swatch inside its own padding box, so it is
	   blown up and clipped by the round dot to fill it edge to edge. */
	.picker-dot input {
		width: 150%;
		height: 150%;
		margin: -25%;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.swap {
		padding: 0 12px;
		border: 1.5px solid var(--line);
		border-radius: 10px;
		background: var(--white);
		color: var(--green);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
	}

	.swap:hover {
		background: var(--cream2);
	}

	.presets {
		display: grid;
		grid-template-columns: repeat(6, 44px);
		justify-content: space-between;
	}

	.presets .dot {
		width: 28px;
		height: 28px;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 20px;
	}

	.done {
		height: 44px;
		padding: 0 20px;
		border: 0;
		border-radius: 10px;
		background: var(--green);
		color: var(--white);
		font: inherit;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
	}

	.done:hover {
		background: var(--deep);
	}

	@media (max-width: 359px) {
		.presets {
			grid-template-columns: repeat(4, 44px);
		}
	}
</style>
