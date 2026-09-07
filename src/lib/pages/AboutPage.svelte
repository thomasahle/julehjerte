<!--
  The "Om" / "About" page — docs/redesign/DESIGN.md §6, following `om()` in the
  mockup generator: what Juleflet.dk is, the editor, open source, who drew the
  templates, "Mangler der et hjerte?", contact, and the credits list of other
  good sites about woven hearts in the right-hand column.

  Same shape as HowToPage.svelte: /om/ and /en/about/ sit OUTSIDE the
  [[lang=lang]] tree because their slugs differ per language, so `lang` is a
  prop and every internal link goes through $lib/i18n/routes.

  The root layout supplies this page's <meta name="description"> from the route
  table (aboutMetaDescription), so <svelte:head> here carries only the title.
-->
<script lang="ts">
	import GitHubLink from '$lib/components/GitHubLink.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { ExternalIcon, PencilIcon, PlusIcon } from '$lib/components/icons';
	import { SITE_TITLE, SITE_TITLE_EN } from '$lib/config';
	import { t, type Language } from '$lib/i18n';
	import { href } from '$lib/i18n/routes';

	interface Props {
		lang: Language;
	}

	let { lang }: Props = $props();

	// Prefilled GitHub issue for a new heart — the same template the gallery links to.
	const SUGGEST_URL =
		'https://github.com/thomasahle/julehjerte/issues/new?title=Heart%20suggestion&body=%23%23%20Heart%20Design%20Suggestion%0A%0A**Name%3A**%20%0A**Description%3A**%20%0A**Grid%20size%3A**%20%0A%0A**Reference%20image%20or%20description%3A**%0A%0A%3C!--%20Please%20attach%20an%20image%20or%20describe%20the%20pattern%20--%3E';

	const ISSUES_URL = 'https://github.com/thomasahle/julehjerte/issues';
	const AUTHOR_URL = 'https://thomasahle.com';

	// Other sites worth knowing about. The names are proper nouns and stay the
	// same in both languages; the one-line descriptions come from translations.
	const CREDITS = [
		{
			name: 'Majbrit og Erik Ginnerskov',
			url: 'http://ginnerskov.dk/hjerter.php',
			key: 'creditGinnerskov'
		},
		{
			name: 'Alt Om Hobby',
			url: 'https://www.altomhobby.dk/e-bog/Julehjerte-skabeloner.pdf',
			key: 'creditAltOmHobby'
		},
		{
			name: 'Gerth Stølting Brodal',
			url: 'https://cs.au.dk/~gerth/julehjerter/',
			key: 'creditBrodal'
		},
		{
			name: 'Papermatrix',
			url: 'https://papermatrix.wordpress.com/links/',
			key: 'creditPapermatrix'
		},
		{
			name: 'Johan’s Hjerter',
			url: 'https://johansjulehjerter.dk/',
			key: 'creditJohansHjerter'
		}
	] as const;
</script>

<svelte:head>
	<title>{t('aboutTitle', lang)} - {lang === 'en' ? SITE_TITLE_EN : SITE_TITLE}</title>
</svelte:head>

<PageHeader {lang} active="about" />

<div class="about">
	<div class="story">
		<h1>{t('aboutTitle', lang)}</h1>
		<p>{t('aboutIntro', lang)}</p>
		<p class="accent">{t('aboutEditorText', lang)}</p>
		<div class="open-source">
			<p>{t('aboutOpenSource', lang)}</p>
			<GitHubLink />
		</div>
		<p>{t('aboutDesigners', lang)}</p>

		<section class="callout" aria-labelledby="missing-heading">
			<h2 id="missing-heading">{t('aboutMissingTitle', lang)}</h2>
			<p>{t('aboutMissingText', lang)}</p>
			<div class="actions">
				<a class="btn btn-outline" href={href('editor', lang)}>
					<PencilIcon size={18} />
					{t('createNewHeart', lang)}
				</a>
				<a class="btn btn-ghost" href={SUGGEST_URL} target="_blank" rel="noopener">
					<PlusIcon size={18} />
					{t('suggestHeart', lang)}
				</a>
			</div>
		</section>

		<section class="contact" aria-labelledby="contact-heading">
			<h2 id="contact-heading" class="section-title">{t('aboutContactTitle', lang)}</h2>
			<p>{t('aboutContactText', lang)}</p>
			<div class="contact-links">
				<!-- "Skriv på GitHub" means the issue tracker, not the repo root the
				     open-source pill above points at. -->
				<GitHubLink href={ISSUES_URL} variant="plain" showCount={false} />
				<a class="site-link" href={AUTHOR_URL} target="_blank" rel="noopener">
					thomasahle.com
					<ExternalIcon size={14} />
				</a>
			</div>
		</section>
	</div>

	<aside class="links" aria-labelledby="links-heading">
		<h2 id="links-heading" class="section-title">{t('aboutLinksTitle', lang)}</h2>
		<ul>
			{#each CREDITS as credit (credit.url)}
				<li>
					<a href={credit.url} target="_blank" rel="noopener">
						{credit.name}
						<ExternalIcon size={14} />
					</a>
					<span>{t(credit.key, lang)}</span>
				</li>
			{/each}
		</ul>
	</aside>
</div>

<style>
	.about {
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
		max-width: 640px;
	}

	h1 {
		margin: 0;
		font-size: 44px;
		font-weight: 600;
		line-height: 1.05;
		color: var(--deep);
	}

	.story > p,
	.open-source p {
		margin: 0;
		font-size: 17px;
		line-height: 1.55;
		color: var(--ink);
	}

	/* The paragraph and the repo link read as one block. */
	.open-source {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}

	/* The editor is what sets the site apart, so it gets the gold rule the
	   mockup puts on its pulled-out paragraph. */
	.accent {
		padding-left: 14px;
		border-left: 3px solid var(--gold);
		color: var(--muted);
	}

	.callout {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 18px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--white);
	}

	.callout h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: var(--deep);
	}

	.callout p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--muted);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		padding-top: 6px;
	}

	.contact {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.contact p {
		margin: 0;
		font-size: 15px;
		line-height: 1.55;
		color: var(--muted);
	}

	.contact-links {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
	}

	.site-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--green);
		font-size: 14px;
		font-weight: 600;
		text-decoration: none;
	}

	.site-link:hover {
		color: var(--red);
	}

	/* Shared by the contact heading and the links column. */
	.section-title {
		margin: 0;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--line);
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}

	.links {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.links ul {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.links li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 0;
		border-bottom: 1px solid var(--line);
	}

	.links a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 16px;
		font-weight: 600;
		color: var(--green);
		text-decoration: none;
	}

	.links a:hover {
		color: var(--red);
	}

	.links span {
		font-size: 14px;
		color: var(--muted);
	}

	@media (max-width: 1199px) {
		.about {
			grid-template-columns: minmax(0, 1fr);
			gap: 40px;
		}

		.links {
			max-width: 640px;
		}
	}

	@media (max-width: 899px) {
		.about {
			padding: 32px 24px 40px;
		}

		h1 {
			font-size: 34px;
		}

		.story > p {
			font-size: 16px;
		}
	}

	@media (max-width: 599px) {
		.about {
			padding: 24px 16px 32px;
		}

		h1 {
			font-size: 30px;
		}
	}
</style>
