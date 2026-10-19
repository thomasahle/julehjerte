<!--
  The site's paper colours — docs/redesign/DESIGN.md §3 "Nav", "As built:
  colours in the header": the two paper-colour swatches, the swap button and
  the colourful-mode button ("Farverig" / "Colourful", $lib/stores/colorMode),
  a round swatch of its own woven from four of the palette's papers.

  PageHeader renders it twice: compact in the bar from 900px up (`bar`), and
  as a labelled row in the burger menu below that (`menu`). Only one of them
  is ever displayed, but both are in the DOM, so their input ids carry the
  variant. The editor's header has neither: the editor has its own colour
  controls in its right-hand panel.

  Each press of the colourful button deals every heart that follows the site's
  pair a new random pair ($lib/utils/palette); it never turns the mode off.
  While the mode is on, the swatches are dimmed rather than changed: they still
  hold the site's pair, which is what comes back when the mode goes off, and
  picking a colour or swapping is what turns it off, since that is a visitor
  asking for one pair everywhere. The button's "on" ring is drawn from the
  class on <html>, which the head's inline script sets before the body paints,
  so a reload with the mode on does not show it off until hydration.
  `aria-pressed` says the same to a screen reader. Without JavaScript the group
  is hidden: none of it works then.

  Every control has a 44px hit area; in the bar the visible swatches and the
  colourful button are 22px circles and the swap button a 28px square, in the
  menu the circles are 28px.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { t, type Language } from '$lib/i18n';
	import {
		DEFAULT_COLORS,
		DEFAULT_COLORS_HEX,
		getColors,
		setLeftColor,
		setRightColor,
		flipColors,
		subscribeColors,
		type HeartColors
	} from '$lib/stores/colors';
	import { getColorMode, shuffleColorMode, subscribeColorMode, turnOffColorMode } from '$lib/stores/colorMode';
	import { trackColorMode } from '$lib/analytics';
	import { SwapIcon } from '$lib/components/icons';
	import { PALETTE } from '$lib/utils/palette';
	import { toHexColor } from '$lib/utils/heartColors';

	interface Props {
		lang: Language;
		variant: 'bar' | 'menu';
	}

	let { lang, variant }: Props = $props();

	let colors = $state<HeartColors>({ ...DEFAULT_COLORS });
	let colorful = $state(false);
	let leftInput = $state<HTMLInputElement | null>(null);
	let rightInput = $state<HTMLInputElement | null>(null);

	// The inputs carry static default values so the prerendered markup is valid;
	// the stored colours are applied here. A dynamic `value` attribute would be
	// stripped by Svelte during hydration, which makes Chrome warn about a colour
	// input momentarily holding "".
	$effect(() => {
		if (leftInput) leftInput.value = toHexColor(colors.left, DEFAULT_COLORS_HEX.left);
		if (rightInput) rightInput.value = toHexColor(colors.right, DEFAULT_COLORS_HEX.right);
	});

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

	// The presses in this page view, for the analytics event.
	let shuffles = 0;

	function shuffle() {
		shuffleColorMode();
		shuffles += 1;
		trackColorMode(true, shuffles);
	}

	/** A swatch or the swap button: one pair for every heart again. */
	function pickPair(change: () => void) {
		if (getColorMode()) {
			turnOffColorMode();
			trackColorMode(false);
		}
		change();
	}

	// The button's own picture: a 2×2 weave of four of the palette's papers
	// (the classic red, the spruce, the navy and the gold), with pale gaps
	// between the strips, so it reads as woven paper.
	const pick = (name: string, side: 'left' | 'right') => PALETTE.find((p) => p.name === name)![side];
	const WEAVE = [
		{ x: 0, y: 0, fill: pick('klassisk', 'right') },
		{ x: 12, y: 0, fill: pick('gran', 'right') },
		{ x: 0, y: 12, fill: pick('nat', 'right') },
		{ x: 12, y: 12, fill: pick('nat', 'left') }
	];
</script>

<div class="colors colors-{variant}" role="group" aria-label={t('paperColors', lang)}>
	{#if variant === 'menu'}
		<span class="colors-label" aria-hidden="true">{t('paperColors', lang)}</span>
	{/if}
	<!-- The two `value` attributes are written out rather than read from
	     DEFAULT_COLORS: a dynamic value on <input type="color"> makes Svelte set
	     the property and drop the attribute, which loses the no-JS default. The
	     effect above keeps them in step with the store. -->
	<label class="swatch" title={t('leftColor', lang)}>
		<span class="sr-only">{t('leftColor', lang)}</span>
		<span class="dot">
			<input
				type="color"
				id="left-color-{variant}"
				name="left-color"
				value="#ffffff"
				bind:this={leftInput}
				oninput={(e) => pickPair(() => setLeftColor((e.target as HTMLInputElement).value))}
			/>
		</span>
	</label>
	<label class="swatch" title={t('rightColor', lang)}>
		<span class="sr-only">{t('rightColor', lang)}</span>
		<span class="dot">
			<input
				type="color"
				id="right-color-{variant}"
				name="right-color"
				value="#b91313"
				bind:this={rightInput}
				oninput={(e) => pickPair(() => setRightColor((e.target as HTMLInputElement).value))}
			/>
		</span>
	</label>
	<button
		type="button"
		class="swap"
		onclick={() => pickPair(flipColors)}
		title={t('swapColors', lang)}
		aria-label={t('swapColors', lang)}
	>
		<span class="swap-box"><SwapIcon size={14} /></span>
	</button>
	<button
		type="button"
		class="colorful-toggle"
		aria-pressed={colorful}
		aria-label={t('colorfulMode', lang)}
		title={t('colorfulModeTitle', lang)}
		onclick={shuffle}
	>
		<span class="dot weave">
			<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
				<rect width="24" height="24" fill="#f6f1e4" />
				{#each WEAVE as cell (cell.fill)}
					<!-- Out to the circle's edge; only the gaps between cells stay light. -->
					<rect x={cell.x === 0 ? 0 : 12.75} y={cell.y === 0 ? 0 : 12.75} width="11.25" height="11.25" fill={cell.fill} />
				{/each}
				<!-- Over and under: each cell's strip runs on into the gap on one
				     side, alternating, as a woven square does. -->
				<rect x="11" y="3" width="2" height="6" fill={WEAVE[0].fill} />
				<rect x="15" y="11" width="6" height="2" fill={WEAVE[1].fill} />
				<rect x="3" y="11" width="6" height="2" fill={WEAVE[2].fill} />
				<rect x="11" y="15" width="2" height="6" fill={WEAVE[3].fill} />
			</svg>
		</span>
	</button>
</div>

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

	/* Each control is a transparent 44px target around what it shows. */
	.swatch,
	.swap,
	.colorful-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.dot {
		display: inline-flex;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 1px solid var(--line);
		overflow: hidden;
	}

	/* A colour input paints its swatch inside its own padding box, so it is
	   blown up and clipped by the round dot to fill it edge to edge. */
	.dot input {
		width: 150%;
		height: 150%;
		margin: -25%;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.swap-box {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		box-sizing: border-box;
		border-radius: 8px;
		border: 1.5px solid var(--line);
		background: var(--white);
		color: var(--green);
	}

	.swap:hover .swap-box {
		background: var(--cream2);
		color: var(--red);
	}

	.weave svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.colorful-toggle:hover .weave {
		border-color: var(--sage-dark);
	}

	/* On: a ring round the button, from the class on <html> so it is right on
	   the first frame. Pressing again reshuffles; it stays on. */
	:global(html.colorful) .weave {
		outline: 2px solid var(--green);
		outline-offset: 1px;
	}

	/* Dimmed, not hidden, while each heart has its own pair: they still hold
	   the site's pair, and picking from them turns the mode off. */
	:global(html.colorful) .swatch .dot,
	:global(html.colorful) .swap-box {
		opacity: 0.45;
	}

	:global(html.colorful) .swatch:hover .dot,
	:global(html.colorful) .swap:hover .swap-box {
		opacity: 1;
	}

	/* The menu's row: the label at the left, the controls at the right, a little
	   larger for a finger. */
	.colors-menu {
		display: flex;
		gap: 4px;
		padding: 4px 2px;
		border-bottom: 1px solid var(--line);
	}

	.colors-menu .dot {
		width: 28px;
		height: 28px;
	}

	/* The mode and the swatches need the scripts, so without them there is none. */
	:global(html.no-js) .colors {
		display: none;
	}
</style>
