<!--
  The front page's few words about woven hearts, under the gallery: what one is, how it is
  woven and how old the custom is, with links to the guide and the history. The gallery
  above is nearly all pictures; this is the page's running text on its subject, for readers
  who came for the thing and not a template, and for search engines.
-->
<script lang="ts">
	import { t, type Language } from '$lib/i18n';
	import { href } from '$lib/i18n/routes';

	let { lang }: { lang: Language } = $props();
</script>

<section class="about-hearts" aria-labelledby="about-hearts-heading">
	<h2 id="about-hearts-heading">{t('frontAboutTitle', lang)}</h2>
	<div class="columns">
		<div>
			<h3>{t('frontWhatTitle', lang)}</h3>
			<p>{t('frontWhatText', lang)}</p>
		</div>
		<div>
			<h3>{t('frontHowTitle', lang)}</h3>
			<p>{t('frontHowText', lang)}</p>
			<a href={href('howTo', lang)}>{t('frontHowLink', lang)} →</a>
		</div>
		<div>
			<h3>{t('historyTitle', lang)}</h3>
			<p>{t('frontHistoryText', lang)}</p>
			<a href={href('history', lang)}>{t('frontHistoryLink', lang)} →</a>
		</div>
	</div>
</section>

<style>
	.about-hearts {
		box-sizing: border-box;
		width: 100%;
		max-width: 1280px;
		margin: 0 auto;
		padding: 0 40px 56px;
	}

	/* The gallery's category headings, so the section reads as one more of them. */
	h2 {
		margin: 0 0 28px;
		padding-bottom: 10px;
		border-bottom: 1px solid var(--line);
		text-align: center;
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}

	.columns {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 40px;
	}

	.columns > div {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
	}

	h3 {
		margin: 0;
		font-size: 19px;
		font-weight: 600;
		color: var(--deep);
	}

	p {
		margin: 0;
		font-size: 16px;
		line-height: 1.55;
		color: var(--ink);
	}

	a {
		color: var(--green);
		font-size: 15px;
		font-weight: 600;
		text-decoration: none;
	}

	a:hover {
		color: var(--red);
	}

	@media (max-width: 899px) {
		.about-hearts {
			padding: 0 24px 40px;
		}

		.columns {
			grid-template-columns: minmax(0, 1fr);
			gap: 28px;
			max-width: 640px;
		}
	}

	@media (max-width: 599px) {
		.about-hearts {
			padding: 0 16px 32px;
		}
	}
</style>
