<!--
  The "Sådan gør du" / "How to" guide — docs/redesign/DESIGN.md §5.

  Intro, then the five illustrated guide cards (the drawings come from
  GuideStep.svelte, ported from `guideSvg()` in the mockup generator), the tips
  below them, and the way back to the gallery and the editor.

  The route files under src/routes/ are thin: they render this component with a
  fixed `lang`, because /saadan-goer-du/ and /en/how-to/ sit OUTSIDE the
  [[lang=lang]] tree (their slugs differ per language) and so have no lang
  param to read. Every link is built through $lib/i18n/routes.

  The root layout supplies this page's <meta name="description"> from the route
  table (howToMetaDescription), so <svelte:head> here carries only the title.
-->
<script lang="ts">
	import GuideStep from '$lib/components/GuideStep.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { ArrowRightIcon, PencilIcon } from '$lib/components/icons';
	import { SITE_TITLE, SITE_TITLE_EN } from '$lib/config';
	import { t, tArray, type Language } from '$lib/i18n';
	import { href } from '$lib/i18n/routes';

	interface Props {
		lang: Language;
	}

	let { lang }: Props = $props();

	// The same five steps the detail page lists; exactly five, one per drawing.
	let steps = $derived(tArray('instructions', lang));
	let tips = $derived([t('tipPaper', lang), t('tipSize', lang), t('tipGlue', lang)]);
</script>

<svelte:head>
	<title>{t('howToTitle', lang)} - {lang === 'en' ? SITE_TITLE_EN : SITE_TITLE}</title>
</svelte:head>

<PageHeader {lang} active="howto" />

<main class="how-to" id="main-content" tabindex="-1">
	<header class="intro">
		<h1>{t('howToTitle', lang)}</h1>
		<p>{t('howToIntro', lang)}</p>
	</header>

	<ol class="steps">
		{#each steps as step, i (i)}
			<li class="card">
				<div class="art">
					<GuideStep step={i + 1} {lang} />
				</div>
				<div class="caption">
					<span class="number" aria-hidden="true">{i + 1}</span>
					<p>
						<span class="sr-only">{t('howToStepLabel', lang, { n: i + 1 })}: </span
						>{step}
					</p>
				</div>
			</li>
		{/each}
	</ol>

	<section class="tips" aria-labelledby="tips-heading">
		<h2 id="tips-heading">{t('tipsTitle', lang)}</h2>
		<ul>
			{#each tips as tip (tip)}
				<li>{tip}</li>
			{/each}
		</ul>
	</section>

	<div class="actions">
		<a class="btn btn-primary" href={href('home', lang)}>
			<ArrowRightIcon size={18} />
			{t('heroSeeTemplates', lang)}
		</a>
		<a class="btn btn-outline" href={href('editor', lang)}>
			<PencilIcon size={18} />
			{t('createNewHeart', lang)}
		</a>
	</div>
</main>

<style>
	.how-to {
		display: flex;
		flex-direction: column;
		gap: 32px;
		box-sizing: border-box;
		width: 100%;
		max-width: 1280px;
		margin: 0 auto;
		padding: 48px 40px 56px;
	}

	.intro {
		display: flex;
		flex-direction: column;
		gap: 14px;
		max-width: 760px;
	}

	h1 {
		margin: 0;
		font-size: 44px;
		font-weight: 600;
		line-height: 1.05;
		color: var(--deep);
	}

	.intro p {
		margin: 0;
		font-size: 17px;
		line-height: 1.55;
		color: var(--muted);
	}

	/* The five guide cards. The numbers are drawn in the circles, so the list
	   markers are off and each step carries its own "Trin n" label for readers. */
	.steps {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 24px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--white);
		border: 1px solid var(--line);
		border-radius: 14px;
	}

	.art {
		height: 200px;
		padding: 10px;
		box-sizing: border-box;
		background: var(--cream2);
	}

	.caption {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 14px 16px 16px;
	}

	.number {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--green);
		color: var(--white);
		font-size: 13px;
		font-weight: 600;
	}

	.caption p {
		margin: 0;
		font-size: 15px;
		line-height: 1.45;
		color: var(--ink);
	}

	.tips {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.tips h2 {
		margin: 0;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--line);
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}

	.tips ul {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 16px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tips li {
		padding: 18px;
		border-radius: 12px;
		background: var(--cream2);
		font-size: 15px;
		line-height: 1.5;
		color: var(--ink);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		padding-top: 4px;
	}

	@media (max-width: 899px) {
		.how-to {
			gap: 26px;
			padding: 32px 24px 40px;
		}

		h1 {
			font-size: 34px;
		}

		.intro p {
			font-size: 16px;
		}
	}

	@media (max-width: 599px) {
		.how-to {
			padding: 24px 16px 32px;
		}

		h1 {
			font-size: 30px;
		}

		.steps {
			gap: 16px;
		}

		/* One card per row on a phone, so let the drawing grow with the card
		   instead of sitting small in the middle of a fixed 200px band. */
		.art {
			height: auto;
			aspect-ratio: 4 / 3;
		}
	}
</style>
