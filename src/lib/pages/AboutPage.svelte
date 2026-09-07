<!--
  The "Om" / "About" page — docs/redesign/DESIGN.md §6.

  STUB, same deal as HowToPage.svelte: enough for the nav link and the sitemap
  to resolve. The pages lane owns this file and fills in the editor paragraph,
  the open-source note, the credits list, "Foreslå et hjerte" and contact —
  every string is already in translations.ts (about*, credit*).
-->
<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { ArrowLeftIcon } from '$lib/components/icons';
	import { SITE_TITLE, SITE_TITLE_EN } from '$lib/config';
	import { t, type Language } from '$lib/i18n';
	import { href } from '$lib/i18n/routes';

	interface Props {
		lang: Language;
	}

	let { lang }: Props = $props();
</script>

<svelte:head>
	<title>{t('aboutTitle', lang)} - {lang === 'en' ? SITE_TITLE_EN : SITE_TITLE}</title>
</svelte:head>

<PageHeader {lang} active="about" />

<article class="page">
	<h1>{t('aboutTitle', lang)}</h1>
	<p class="intro">{t('aboutIntro', lang)}</p>
	<p>{t('aboutEditorText', lang)}</p>
	<p>{t('aboutOpenSource', lang)}</p>

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

	p {
		margin: 0 0 16px;
		max-width: 640px;
		font-size: 16px;
		color: var(--ink);
	}

	.intro {
		font-size: 17px;
		color: var(--muted);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 16px;
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
