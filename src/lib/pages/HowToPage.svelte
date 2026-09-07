<!--
  The "Sådan gør du" / "How to" guide — docs/redesign/DESIGN.md §5.

  STUB. The foundation lane put this here so the nav link, the sitemap and the
  detail page's "Se den illustrerede vejledning" link all resolve; the pages
  lane owns this file and replaces the body with the five illustrated guide
  cards (`GuideStep.svelte`, ported from `guideSvg()` in the mockup generator)
  and the tips below them.

  The route files under src/routes/ are thin: they render this component with a
  fixed `lang`, because /saadan-goer-du/ and /en/how-to/ sit OUTSIDE the
  [[lang=lang]] tree (their slugs differ per language) and so have no lang
  param to read. Build every link through $lib/i18n/routes.
-->
<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { ArrowLeftIcon } from '$lib/components/icons';
	import { SITE_TITLE, SITE_TITLE_EN } from '$lib/config';
	import { t, tArray, type Language } from '$lib/i18n';
	import { href } from '$lib/i18n/routes';

	interface Props {
		lang: Language;
	}

	let { lang }: Props = $props();

	let steps = $derived(tArray('instructions', lang));
</script>

<svelte:head>
	<title>{t('howToTitle', lang)} - {lang === 'en' ? SITE_TITLE_EN : SITE_TITLE}</title>
</svelte:head>

<PageHeader {lang} active="howto" />

<article class="page">
	<h1>{t('howToTitle', lang)}</h1>
	<p class="intro">{t('howToIntro', lang)}</p>

	<ol class="steps">
		{#each steps as step, i (i)}
			<li>{step}</li>
		{/each}
	</ol>

	<a class="back" href={href('home', lang)}>
		<ArrowLeftIcon size={16} />
		{t('backToTemplates', lang)}
	</a>
</article>

<style>
	.page {
		max-width: 880px;
		margin: 0 auto;
		padding: 32px 40px 56px;
	}

	h1 {
		margin: 0 0 12px;
		font-size: 40px;
	}

	.intro {
		margin: 0 0 28px;
		max-width: 640px;
		font-size: 17px;
		color: var(--muted);
	}

	.steps {
		margin: 0 0 32px;
		padding-left: 22px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-size: 16px;
		color: var(--ink);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
	}

	@media (max-width: 899px) {
		.page {
			padding: 24px 24px 40px;
		}

		h1 {
			font-size: 30px;
		}
	}
</style>
