<!--
  The front page's hero — docs/redesign/DESIGN.md §3 "Hero".

  Hanging hearts over the winter landscape, with the wordmark, the tagline and
  the two calls to action. <Scene band> under it draws the sky, the snow strip
  and the landscape (which is thereby inlined once for the whole page); the two
  overlay SVGs here are the stacked layout's starry sky and its corner firs, both
  <use>s of ids in that drawing's <defs>.

  Which hearts hang here is not decided in this component and not in the browser
  at all: the page is prerendered with a fixed set (HERO_HEART_IDS), and the
  inline script emitted after the gallery swaps in a random set cloned from the
  cards, while the page is still parsing. See $lib/front/heroBootstrap and
  front/HeroHearts. Nothing moves, because only *which* heart hangs in a slot
  changes, and the layer stays invisible until the swap has happened, so the
  fixed set is only ever seen by a visitor without JavaScript.
-->
<script lang="ts">
	import Fir from '$lib/components/Fir.svelte';
	import Scene from '$lib/components/Scene.svelte';
	import { FIR_FILLS } from '$lib/landscape';
	import { t, type Language } from '$lib/i18n';
	import { href as routeHref } from '$lib/i18n/routes';
	import { ArrowRightIcon, PencilIcon } from '$lib/components/icons';
	import type { HeroHeart } from '$lib/front/galleryHearts';
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
		/** The prerendered hearts, one per desktop slot, in slot order. */
		desktop: readonly (HeroHeart | undefined)[];
		/** The same for the stacked hero's three slots. */
		mobile: readonly (HeroHeart | undefined)[];
		/**
		 * Show the hearts straight away, without waiting for the bootstrap script
		 * — true only when this render *is* the one that drew them, i.e. after a
		 * client-side navigation. See HeroHearts.
		 */
		revealed?: boolean;
		/** Height in px of the landscape band below 900px. */
		band?: number;
	}

	let { lang, desktop, mobile, revealed = false, band = 230 }: Props = $props();
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

	<div class="hero-inner">
		<div class="hero-hearts hero-hearts-m">
			<HeroHearts
				{lang}
				slots={HERO_SLOTS_MOBILE}
				hearts={mobile}
				idPrefix="hero-m"
				{revealed}
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
				{lang}
				slots={HERO_SLOTS_DESKTOP}
				hearts={desktop}
				idPrefix="hero-d"
				{revealed}
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
