<!--
  The site's paper colours — docs/redesign/DESIGN.md §3 "Nav", "As built:
  colours in the header": the two paper-colour swatches, the swap button and
  the colourful-mode toggle ("Farverig" / "Colourful", $lib/stores/colorMode).

  PageHeader renders it twice: compact in the bar from 900px up (`bar`), and
  as a labelled row in the burger menu below that (`menu`). Only one of them
  is ever displayed, but both are in the DOM, so their input ids carry the
  variant. The editor's header has neither: the editor has its own colour
  controls in its right-hand panel.

  While the colourful mode is on, every heart that follows the site's pair has
  a pair of its own ($lib/utils/palette). The swatches are dimmed rather than
  changed then: they still hold the site's pair, which is what comes back when
  the mode goes off, and picking a colour or swapping turns it off, since that
  is a visitor asking for one pair everywhere. The pressed look is drawn from
  the class on <html>, which the head's inline script sets before the body
  paints, so a reload with the mode on does not show the toggle off until
  hydration. Without JavaScript the group is hidden: none of it works then.

  Every control has a 44px hit area; in the bar the visible swatch is a 22px
  circle and the swap button a 28px square inside it.
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
	import { getColorMode, setColorMode, subscribeColorMode } from '$lib/stores/colorMode';
	import { trackColorMode } from '$lib/analytics';
	import { PaletteIcon, SwapIcon } from '$lib/components/icons';
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

	function changeColorMode(on: boolean) {
		if (on === getColorMode()) return;
		setColorMode(on);
		trackColorMode(on);
	}

	/** A swatch or the swap button: one pair for every heart again. */
	function pickPair(change: () => void) {
		changeColorMode(false);
		change();
	}
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
		title={t('colorfulModeTitle', lang)}
		onclick={() => changeColorMode(!colorful)}
	>
		<span class="toggle-pill">
			<PaletteIcon size={16} />
			<span class="toggle-label">{t('colorfulMode', lang)}</span>
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

	/* The header's pill (app.css .pill), with the palette in front. */
	.toggle-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border: 1.5px solid var(--line);
		border-radius: 999px;
		background: var(--white);
		color: var(--green);
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		line-height: 1;
		white-space: nowrap;
	}

	.colorful-toggle:hover .toggle-pill {
		background: var(--cream2);
	}

	:global(html.colorful) .toggle-pill {
		border-color: var(--green);
		background: var(--green);
		color: var(--white);
	}

	:global(html.colorful) .colorful-toggle:hover .toggle-pill {
		border-color: var(--deep);
		background: var(--deep);
	}

	/* Dimmed, not hidden, while each heart has its own pair: they still hold
	   the site's pair, and picking from them turns the mode off. */
	:global(html.colorful) .dot,
	:global(html.colorful) .swap-box {
		opacity: 0.45;
	}

	:global(html.colorful) .swatch:hover .dot,
	:global(html.colorful) .swap:hover .swap-box {
		opacity: 1;
	}

	/* The bar is crowded between 900 and 1100px (wordmark, three links, EN and
	   GitHub): the toggle keeps its palette and says its name in its title and
	   to a screen reader only. */
	@media (max-width: 1099px) {
		.colors-bar .toggle-label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
			white-space: nowrap;
		}

		.colors-bar .toggle-pill {
			padding: 6px 8px;
		}
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

	.colors-menu .toggle-pill {
		padding: 8px 14px;
		font-size: 14px;
	}

	/* The mode and the swatches need the scripts, so without them there is none. */
	:global(html.no-js) .colors {
		display: none;
	}
</style>
