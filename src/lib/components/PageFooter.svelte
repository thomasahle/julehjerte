<!--
  The site footer — docs/redesign/DESIGN.md §3 "Footer": a centred wrapping row
  on --cream2 with the two paper-colour swatches and a swap button, the language
  toggle, GitHub and the copyright.

  Rendered once by the root layout on every page, including the design tools.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { t, langFromPathname } from '$lib/i18n';
	import { otherLanguageUrl } from '$lib/i18n/routes';
	import {
		DEFAULT_COLORS,
		DEFAULT_COLORS_HEX,
		COLOR_PRESETS,
		getColors,
		setColors,
		setLeftColor,
		setRightColor,
		flipColors,
		subscribeColors,
		type HeartColors
	} from '$lib/stores/colors';
	import { SwapIcon } from '$lib/components/icons';
	import GitHubLink from '$lib/components/GitHubLink.svelte';
	import { toHexColor, toHexColors } from '$lib/utils/heartColors';

	// Baked in at prerender time, like the rest of the page. The site's first
	// season was Christmas 2025, so the line reads "julen 2025, 2026" and gains
	// the current year from then on.
	const FIRST_SEASON = 2025;
	const year = new Date().getFullYear();
	const seasons =
		year > FIRST_SEASON ? `${FIRST_SEASON}, ${year}` : `${FIRST_SEASON}`;

	let colors = $state<HeartColors>({ ...DEFAULT_COLORS });
	let leftInput = $state<HTMLInputElement | null>(null);
	let rightInput = $state<HTMLInputElement | null>(null);
	let footer: HTMLElement;
	let hexColors = $derived(toHexColors(colors, DEFAULT_COLORS_HEX));

	// The inputs carry static default values so the prerendered markup is valid; the
	// stored colours are applied here. A dynamic `value` attribute would be stripped
	// by Svelte during hydration, which makes Chrome warn about a colour input
	// momentarily holding "".
	$effect(() => {
		if (leftInput)
			leftInput.value = toHexColor(colors.left, DEFAULT_COLORS_HEX.left);
		if (rightInput)
			rightInput.value = toHexColor(colors.right, DEFAULT_COLORS_HEX.right);
	});

	let lang = $derived(langFromPathname($page.url.pathname, base));
	let languageHref = $derived.by(() => {
		// Shallow navigation updates page.state, but leaves page.url unchanged.
		// Read the current hash so the generator's inputs survive a language switch.
		void $page.state;
		return otherLanguageUrl(
			$page.url.pathname,
			browser ? window.location.search : '',
			browser ? window.location.hash : ''
		);
	});

	onMount(() => {
		colors = getColors();
		const unsubscribe = subscribeColors((c) => {
			colors = c;
		});
		const measure = () =>
			document.documentElement.style.setProperty(
				'--site-footer-height',
				`${footer.getBoundingClientRect().height}px`
			);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(footer);
		return () => {
			unsubscribe();
			observer.disconnect();
			document.documentElement.style.removeProperty('--site-footer-height');
		};
	});
</script>

<footer class="site-footer" bind:this={footer}>
	<div class="footer-row">
		<span class="colors">
			<span class="colors-label">{t('footerColors', lang)}</span>
			<!-- The two `value` attributes are written out rather than read from
			     DEFAULT_COLORS: a dynamic value on <input type="color"> makes Svelte
			     set the property and drop the attribute, which loses the no-JS
			     default. updateInputs() below keeps them in step with the store. -->
			<label class="swatch" title={t('leftColor', lang)}>
				<span class="sr-only">{t('leftColor', lang)}</span>
				<input
					type="color"
					id="left-color"
					name="left-color"
					value="#ffffff"
					bind:this={leftInput}
					oninput={(e) => setLeftColor((e.target as HTMLInputElement).value)}
				/>
			</label>
			<label class="swatch" title={t('rightColor', lang)}>
				<span class="sr-only">{t('rightColor', lang)}</span>
				<input
					type="color"
					id="right-color"
					name="right-color"
					value="#b91313"
					bind:this={rightInput}
					oninput={(e) => setRightColor((e.target as HTMLInputElement).value)}
				/>
			</label>
			<button
				type="button"
				class="swap"
				onclick={flipColors}
				title={t('swapColors', lang)}
				aria-label={t('swapColors', lang)}
			>
				<SwapIcon size={14} />
			</button>
		</span>

		<div class="presets" role="group" aria-label={t('footerPresets', lang)}>
			<span class="colors-label">{t('footerPresets', lang)}</span>
			{#each COLOR_PRESETS as preset (preset.key)}
				<button
					type="button"
					class="preset"
					style={`--preset-left:${preset.colors.left};--preset-right:${preset.colors.right}`}
					aria-label={t(preset.key, lang)}
					title={t(preset.key, lang)}
					aria-pressed={hexColors.left === preset.colors.left &&
						hexColors.right === preset.colors.right}
					onclick={() => setColors(preset.colors)}
					><span aria-hidden="true"></span></button
				>
			{/each}
		</div>

		<a
			class="footer-link"
			href={languageHref}
			title={t('switchLanguage', lang)}
		>
			{lang === 'da' ? 'EN' : 'DA'}
		</a>

		<GitHubLink variant="plain" />

		<span class="made-by">
			{t('madeBy', lang)}
			<a href="https://thomasahle.com" target="_blank" rel="noopener"
				>Thomas Ahle</a
			>,
			{lang === 'da' ? 'julen' : 'Christmas'}
			{seasons}
		</span>
	</div>
</footer>

<style>
	.site-footer {
		flex: none;
		background: var(--cream2);
		color: var(--muted);
		font-size: 14px;
	}

	.footer-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 28px;
		padding: 32px 40px;
	}

	.colors {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}

	.presets {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.presets .colors-label {
		margin-right: 4px;
	}
	.preset {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		padding: 3px;
		border: 1px solid transparent;
		border-radius: 50%;
		background: transparent;
		cursor: pointer;
	}
	.preset span {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 1px solid rgb(0 0 0 / 15%);
		background: linear-gradient(
			135deg,
			var(--preset-left) 50%,
			var(--preset-right) 50%
		);
	}
	.preset:hover,
	.preset[aria-pressed='true'] {
		border-color: var(--green);
	}
	.preset:focus-visible,
	.swatch:focus-within,
	.swap:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 3px;
	}

	.colors-label {
		font-size: 13px;
		color: var(--muted);
	}

	.swatch {
		display: inline-flex;
		width: 26px;
		height: 26px;
		padding: 0;
		border-radius: 50%;
		border: 1px solid var(--line);
		overflow: hidden;
		cursor: pointer;
	}

	/* A colour input paints its swatch inside its own padding box, so it is
	   blown up and clipped by the round label to fill it edge to edge. */
	.swatch input {
		width: 150%;
		height: 150%;
		margin: -25%;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.swap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border-radius: 8px;
		border: 1.5px solid var(--line);
		background: var(--white);
		color: var(--green);
		cursor: pointer;
	}

	.swap:hover {
		background: var(--page);
		color: var(--red);
	}

	/* WCAG 2.5.8 wants 24x24 CSS px; "EN" on its own is 19x21, and this is the
	   control at the end of a long scroll on a phone. Padding rather than a
	   bigger font, so the row's rhythm is unchanged. */
	.footer-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 24px;
		min-height: 24px;
		padding: 2px 6px;
		margin: -2px -6px;
		text-decoration: none;
		color: var(--green);
		font-weight: 600;
	}

	.made-by a {
		color: inherit;
		text-decoration: none;
	}

	.made-by a:hover {
		color: var(--red);
	}

	@media (max-width: 599px) {
		.footer-row {
			gap: 14px;
			padding: 24px 16px;
		}
		.preset {
			width: 40px;
			height: 40px;
		}
	}
</style>
