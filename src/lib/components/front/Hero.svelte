<!--
  The front page's hero — docs/redesign/DESIGN.md §3 "Hero".

  Hanging hearts over the winter landscape, with the wordmark, the tagline and
  the two calls to action. <Scene band> under it draws the sky, the snow strip
  and the landscape (which is thereby inlined once for the whole page); the two
  overlay SVGs here are the stacked layout's starry sky and its corner firs, both
  <use>s of ids in that drawing's <defs>.

  The random swap lives here because nothing outside the hero can see it: the
  page is prerendered with a fixed set of hearts (HERO_HEART_IDS) — which keeps
  the server and client markup in agreement, and is what a visitor without
  JavaScript gets to see — and after mount a random set of the same size takes
  over the same slots. Nothing moves, because only *which* heart hangs in a slot
  changes.

  The prerendered set is never shown to a visitor whose browser runs the swap:
  HeroHearts starts at opacity 0 and is only raised here, once the random hearts
  are in the DOM. That is also why there is a single layer and no cross-fade —
  there is nothing to fade out of.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Fir from '$lib/components/Fir.svelte';
	import Scene from '$lib/components/Scene.svelte';
	import { FIR_FILLS } from '$lib/landscape';
	import { t, type Language } from '$lib/i18n';
	import { href as routeHref } from '$lib/i18n/routes';
	import { ArrowRightIcon, PencilIcon } from '$lib/components/icons';
	import {
		HERO_HEART_IDS,
		HERO_HEART_IDS_MOBILE,
		pickRandomHeartIds
	} from '$lib/utils/randomHearts';
	import type { HeartDesign } from '$lib/types/heart';
	import HeroHearts from './HeroHearts.svelte';
	import ScrollHint from './ScrollHint.svelte';
	import SkyDecor from './SkyDecor.svelte';
	import {
		HERO_SKY_DOTS,
		HERO_SKY_STARS,
		HERO_SLOTS_DESKTOP,
		HERO_SLOTS_MOBILE
	} from './heroSlots';

	interface Props {
		lang: Language;
		/** The gallery hearts, by id — the pool the hero draws its slots from. */
		designs: Record<string, HeartDesign>;
		/** Height in px of the landscape band below 900px. */
		band?: number;
	}

	let { lang, designs, band = 230 }: Props = $props();

	/** Length of the fade that brings the hearts in; HeroHearts reads --hero-fade. */
	const HERO_FADE_MS = 300;

	/** The set picked after mount. Null while the prerendered set stands in. */
	let heroRandomIds = $state.raw<string[] | null>(null);
	/** Raises the hearts out of their opacity 0 start. Only ever set in the browser. */
	let heroShown = $state(false);

	let heroDesktopIds = $derived<readonly string[]>(heroRandomIds ?? HERO_HEART_IDS);
	let heroMobileIds = $derived<readonly string[]>(
		heroRandomIds ? heroRandomIds.slice(0, HERO_SLOTS_MOBILE.length) : HERO_HEART_IDS_MOBILE
	);

	onMount(() => {
		const picked = pickRandomHeartIds(HERO_SLOTS_DESKTOP.length);
		// A pool too small to fill the hero would mean a broken build; show the
		// prerendered set rather than an empty sky.
		if (picked.length === HERO_SLOTS_DESKTOP.length) heroRandomIds = picked;

		// Both in the same update, so no frame can exist in which the hearts on
		// screen are the prerendered ones. Whether that reads as a fade is the
		// browser's call and either answer is right: if the page has already
		// painted the empty sky there is an opacity to transition from and the
		// hearts fade in; if hydration beat the first paint there is nothing to
		// fade from and they are simply there. What must not happen is making
		// visibility wait on a frame callback — a page that is never asked to
		// render (a background tab, a headless browser) would never show them.
		heroShown = true;
	});
</script>

<Scene {band}>
	<svg
		class="hero-sky-m"
		viewBox="0 0 420 300"
		preserveAspectRatio="xMidYMin meet"
		aria-hidden="true"
		focusable="false"
	>
		<SkyDecor stars={HERO_SKY_STARS} dots={HERO_SKY_DOTS} />
	</svg>

	<svg
		class="hero-tree-m"
		viewBox="0 0 390 230"
		preserveAspectRatio="xMinYMax meet"
		aria-hidden="true"
		focusable="false"
	>
		<Fir x={70} tipY={128} height={100} fill={FIR_FILLS[1]} symbol="pine-b" widthFactor={0.9} />
		<Fir x={20} tipY={52} height={178} fill={FIR_FILLS[0]} symbol="pine-c" widthFactor={0.85} />
	</svg>

	<div class="hero-inner" style:--hero-fade="{HERO_FADE_MS}ms">
		<div class="hero-hearts hero-hearts-m">
			<HeroHearts
				slots={HERO_SLOTS_MOBILE}
				ids={heroMobileIds}
				{designs}
				idPrefix="hero-m"
				shown={heroShown}
			/>
		</div>

		<div class="hero-text">
			<h1>{t('siteWordmark', lang)}</h1>
			<h2>{t('heroTagline', lang)}</h2>
			<p>{t('heroIntro', lang)}</p>
			<div class="hero-btns">
				<a class="btn btn-primary" href={routeHref('editor', lang)}>
					<PencilIcon size={18} />
					{t('createNewHeart', lang)}
				</a>
				<a class="btn btn-outline hero-btn-secondary" href="#skabeloner">
					<ArrowRightIcon size={18} />
					{t('heroSeeTemplates', lang)}
				</a>
			</div>
		</div>

		<div class="hero-hearts hero-hearts-d">
			<HeroHearts
				slots={HERO_SLOTS_DESKTOP}
				ids={heroDesktopIds}
				{designs}
				idPrefix="hero-d"
				shown={heroShown}
			/>
		</div>
	</div>

	<ScrollHint {lang} />
</Scene>

<style>
	.hero-sky-m,
	.hero-tree-m {
		display: none;
		position: absolute;
		pointer-events: none;
	}

	/* A flex container paints absolutely positioned children in order-modified
	   document order, and the landscape is order: 10 below 900px — so the corner
	   firs need a stacking order of their own to stay on top of it. */
	.hero-tree-m {
		z-index: 1;
	}

	.hero-inner {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 640px;
		gap: 40px;
		align-items: start;
		height: 660px;
		padding: 0 40px 0 80px;
		box-sizing: border-box;
	}

	.hero-text {
		display: flex;
		flex-direction: column;
		gap: 18px;
		max-width: 560px;
		padding-top: 88px;
	}

	.hero-text h1 {
		margin: 0;
		font-size: 56px;
		font-weight: 600;
		line-height: 1.05;
		color: var(--deep);
	}

	.hero-text h2 {
		margin: 0;
		font-size: 24px;
		/* The mockup leaves the h2 at the default line-height; the inherited 1.5
		   pushed the paragraph — and the whole page below it — down by 7px. */
		line-height: normal;
		font-weight: 500;
		color: var(--green);
	}

	.hero-text p {
		margin: 0;
		max-width: 480px;
		font-size: 17px;
		line-height: 1.55;
		/* --muted is 4.02:1 on the hero's --sky, under the AA minimum for body text. */
		color: var(--muted-on-sky);
	}

	.hero-btns {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		padding-top: 8px;
	}

	.hero-hearts {
		position: relative;
	}

	.hero-hearts-d {
		height: 560px;
	}

	.hero-hearts-m {
		display: none;
	}

	@media (max-width: 1199px) {
		.hero-inner {
			grid-template-columns: minmax(0, 1fr) 480px;
			height: 600px;
			padding: 0 32px 0 56px;
		}

		.hero-hearts-d {
			width: 640px;
			height: 420px;
			transform: scale(0.75);
			transform-origin: 0 0;
		}

		.hero-text {
			padding-top: 72px;
		}

		.hero-text h1 {
			font-size: 48px;
		}

		.hero-text h2 {
			font-size: 21px;
		}
	}

	@media (max-width: 899px) {
		.hero-inner {
			display: flex;
			flex-direction: column;
			align-items: center;
			text-align: center;
			height: auto;
			padding: 0 24px 22px;
		}

		.hero-hearts-d {
			display: none;
		}

		.hero-hearts-m {
			display: block;
			width: 100%;
			max-width: 420px;
			height: 250px;
		}

		.hero-text {
			align-items: center;
			max-width: 520px;
			padding-top: 10px;
			gap: 12px;
		}

		.hero-text h1 {
			font-size: 44px;
		}

		.hero-text h2 {
			font-size: 19px;
		}

		.hero-text p {
			font-size: 15px;
		}

		.hero-btns {
			justify-content: center;
		}

		.hero-sky-m {
			display: block;
			left: 0;
			right: 0;
			top: 0;
			width: 100%;
			height: 300px;
		}
	}

	@media (max-width: 599px) {
		.hero-text h1 {
			font-size: 38px;
		}

		.hero-text h2 {
			font-size: 17px;
		}

		.hero-btn-secondary {
			display: none;
		}

		.hero-tree-m {
			display: block;
			left: 0;
			bottom: -1px;
			width: 100%;
			height: 230px;
		}
	}
</style>
