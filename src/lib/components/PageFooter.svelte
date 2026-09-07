<!--
  The site footer — docs/redesign/DESIGN.md §3 "Footer": a centred wrapping row
  on --cream2 with the two paper-colour swatches and a swap button, the language
  toggle, GitHub and the copyright.

  Rendered once by the root layout, so it is on every page except the editor,
  which has its own colour controls in its right-hand panel.
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
		getColors,
		setLeftColor,
		setRightColor,
		flipColors,
		subscribeColors,
		type HeartColors
	} from '$lib/stores/colors';
	import { SwapIcon } from '$lib/components/icons';
	import GitHubLink from '$lib/components/GitHubLink.svelte';
	import { toHexColor } from '$lib/utils/heartColors';

	// Baked in at prerender time, like the rest of the page.
	const year = new Date().getFullYear();

	let colors = $state<HeartColors>({ ...DEFAULT_COLORS });
	let leftInput = $state<HTMLInputElement | null>(null);
	let rightInput = $state<HTMLInputElement | null>(null);

	// The inputs carry static default values so the prerendered markup is valid; the
	// stored colours are applied here. A dynamic `value` attribute would be stripped
	// by Svelte during hydration, which makes Chrome warn about a colour input
	// momentarily holding "".
	$effect(() => {
		if (leftInput) leftInput.value = toHexColor(colors.left, DEFAULT_COLORS_HEX.left);
		if (rightInput) rightInput.value = toHexColor(colors.right, DEFAULT_COLORS_HEX.right);
	});

	let lang = $derived(langFromPathname($page.url.pathname, base));
	let languageHref = $derived(
		otherLanguageUrl(
			$page.url.pathname,
			browser ? $page.url.search : '',
			browser ? $page.url.hash : ''
		)
	);

	onMount(() => {
		colors = getColors();
		return subscribeColors((c) => {
			colors = c;
		});
	});
</script>

<footer class="site-footer">
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

		<a class="footer-link" href={languageHref} title={t('switchLanguage', lang)}>
			{lang === 'da' ? 'EN' : 'DA'}
		</a>

		<GitHubLink variant="plain" />

		<span class="made-by">
			{t('madeBy', lang)}
			<a href="https://thomasahle.com" target="_blank" rel="noopener">Thomas Ahle</a>,
			{lang === 'da' ? 'julen' : 'Christmas'}
			{year}
		</span>
	</div>
</footer>

<style>
	.site-footer {
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

	.footer-link {
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
	}
</style>
