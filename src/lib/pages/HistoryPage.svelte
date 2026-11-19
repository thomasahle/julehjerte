<!--
  "Julehjertets historie" / the history of the woven heart: H.C. Andersen's heart, the old
  printed pages some gallery hearts are drawn after, and two later pictures (HistorySection),
  with the books of woven hearts in the right-hand column. It was a section of the about page
  until 2026-11-19 and got its own address so that it can be found by its subject; the about
  page keeps a few lines and a link.

  Same shape as AboutPage.svelte: /historie/ and /en/history/ sit OUTSIDE the [[lang=lang]]
  tree because their slugs differ per language, so `lang` is a prop and every internal link
  goes through $lib/i18n/routes. The root layout supplies the <meta name="description">
  (historyMetaDescription), so <svelte:head> here carries only the title.
-->
<script lang="ts">
	import HistorySection from '$lib/components/HistorySection.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { pageTitle } from '$lib/seo';
	import { t, type Language } from '$lib/i18n';
	import { href } from '$lib/i18n/routes';

	interface Props {
		lang: Language;
	}

	let { lang }: Props = $props();

	// Books of woven hearts, oldest first. Titles and names are as printed, in
	// both languages. (The history shows the first one's cover, with its source.)
	const BOOKS = [
		{ author: 'Jes Lottrup Knudsen', title: 'Julehjerter', by: 'Borgen, 1975' },
		{ author: 'Jes Lottrup Knudsen & Bo Frydendahl', title: 'Julehjerter på mange måder', by: 'Klematis, 1996' },
		{ author: 'Francis Jordt', title: 'Flettede julehjerter', by: '2002' },
		{ author: 'Knud Vægter', title: 'Sådan lærte min mor mig at flette julehjerter', by: 'Museet Falsters Minder, 2003' },
		{ author: 'Anna & Lene Schepper', title: 'The Art of Paper Weaving', by: 'Quarry, 2015' },
		{ author: 'Johan Rosenkilde', title: 'Johans julehjerter', by: 'Frydenlund, 2019' }
	] as const;
</script>

<svelte:head>
	<title>{pageTitle('history', lang)}</title>
</svelte:head>

<PageHeader {lang} active="about" />

<main class="page" id="main-content" tabindex="-1">
	<div class="story">
		<h1>{t('historyTitle', lang)}</h1>
		<p class="lead">{t('historyLead', lang)}</p>
		<p>{t('historyIntro', lang)}</p>
		<HistorySection {lang} />
		<p class="onward">
			<a href={href('home', lang)}>{t('historyToGallery', lang)} →</a>
			<a href={href('howTo', lang)}>{t('historyToGuide', lang)} →</a>
		</p>
	</div>

	<aside class="books" aria-labelledby="books-heading">
		<h2 id="books-heading">{t('aboutBooksTitle', lang)}</h2>
		<ul>
			{#each BOOKS as book (book.title)}
				<li>
					<cite>{book.title}</cite>
					<span>{book.author} · {book.by}</span>
				</li>
			{/each}
		</ul>
	</aside>
</main>

<style>
	.page {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 420px;
		gap: 64px;
		align-items: start;
		box-sizing: border-box;
		width: 100%;
		max-width: 1280px;
		margin: 0 auto;
		padding: 48px 40px 56px;
	}

	.story {
		display: flex;
		flex-direction: column;
		gap: 22px;
		max-width: 720px;
	}

	h1 {
		margin: 0;
		font-size: 44px;
		font-weight: 600;
		line-height: 1.05;
		color: var(--deep);
		text-wrap: balance;
	}

	.story > p {
		margin: 0;
		font-size: 17px;
		line-height: 1.55;
		color: var(--ink);
	}

	.story > .lead {
		font-size: 19px;
		color: var(--deep);
	}

	.onward {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 28px;
		padding-top: 20px;
		border-top: 1px solid var(--line);
	}

	.onward a {
		color: var(--green);
		font-size: 16px;
		font-weight: 600;
		text-decoration: none;
	}

	.onward a:hover {
		color: var(--red);
	}

	.books h2 {
		margin: 0;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--line);
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}

	.books ul {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.books li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 0;
		border-bottom: 1px solid var(--line);
	}

	.books cite {
		font-size: 16px;
		font-weight: 600;
		font-style: normal;
		color: var(--ink);
	}

	.books span {
		font-size: 14px;
		color: var(--muted);
	}

	@media (max-width: 1199px) {
		.page {
			grid-template-columns: minmax(0, 1fr);
			gap: 40px;
		}

		.books {
			max-width: 720px;
		}
	}

	@media (max-width: 899px) {
		.page {
			padding: 32px 24px 40px;
		}

		h1 {
			font-size: 34px;
		}
	}

	@media (max-width: 599px) {
		.page {
			padding: 24px 16px 32px;
		}

		h1 {
			font-size: 30px;
		}
	}
</style>
