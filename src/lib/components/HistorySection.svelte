<!--
  The about page's history: H.C. Andersen's heart, the oldest known, then the
  old printed pages some gallery hearts are drawn after, each with our
  versions of its hearts beside it.

  Andersen's heart is shown in Museum Odense's photograph, credited and linked
  as the museum asks; our copy, with the metadata stripped, is the one
  hcandersen-homepage.dk publishes. Of the printed pages only those free to show
  are pictured: Hans H. Koch died in 1922, the 1922 Familie-Journal page names
  no designer, and the designer of Alfred Jacobsen's 1924 sheet signed only
  "ThLL" (Jacobsen himself died in 1924). Their scans are copies, with the
  metadata stripped, of the ones aldus.dk and the Papermatrix blog publish,
  credited and linked under each picture. Later sources (Per V. Mortensen's drawings, the books of the
  1970s–90s) are still under copyright, so the last paragraph names and links
  them without pictures.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import heartCards from '$lib/data/heart-cards.json';
	import { heartImagePath } from '$lib/heartImage';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import { heartHref } from '$lib/i18n/routes';
	import { parseDescription } from '$lib/utils/descriptionLinks';
	import { heartName, type Named } from '$lib/utils/heartName';

	let { lang }: { lang: Language } = $props();

	const CARDS = heartCards as Record<string, Named>;

	interface Source {
		id: string;
		image: string;
		width: number;
		height: number;
		/** Shown small, beside its text: a single heart, not a page to read. */
		small?: boolean;
		title: TranslationKey;
		text: TranslationKey;
		alt: TranslationKey;
		/** Under the picture: whose scan it is, or where the original is; may hold a link. */
		caption: TranslationKey;
		/** How the page's own numbering of a heart reads, "Kochs nr. 3". */
		number?: TranslationKey;
		/** Our hearts drawn after the page, with the source's own number (3, or 365e). */
		hearts: { id: string; number: number | string }[];
	}

	const SOURCES: Source[] = [
		{
			id: 'andersen',
			image: 'hca-hjerte.jpg',
			width: 550,
			height: 531,
			small: true,
			title: 'historyAndersenTitle',
			text: 'historyAndersenText',
			alt: 'historyAndersenAlt',
			caption: 'historyAndersenCaption',
			hearts: []
		},
		{
			id: 'koch-1916',
			image: 'boernenes-magasin-1916.jpg',
			width: 1024,
			height: 710,
			title: 'historyKochTitle',
			text: 'historyKochText',
			alt: 'historyKochAlt',
			caption: 'historyKochCaption',
			number: 'historyKochNumber',
			hearts: [
				{ id: 'boelger', number: 1 },
				{ id: 'andreaskors', number: 2 },
				{ id: 'permo-cirkler', number: 3 },
				{ id: 'ni-firkanter', number: 4 },
				{ id: 'stjerneblomst', number: 5 },
				{ id: 'potteplante', number: 6 },
				{ id: 'hjertekloever', number: 7 },
			]
		},
		{
			id: 'familie-journal-1922',
			image: 'familie-journal-1922.jpg',
			width: 801,
			height: 1065,
			title: 'historyFamilieJournalTitle',
			text: 'historyFamilieJournalText',
			alt: 'historyFamilieJournalAlt',
			caption: 'historyFamilieJournalCaption',
			number: 'historyHeartNumber',
			hearts: [
                              { id: 'andreaskors', number: 2 },
                              { id: 'kompasrose', number: 4 }
                        ]
		},
		{
			id: 'jacobsen-1924',
			image: 'hjerter-til-juletraeet-1924.jpg',
			width: 1613,
			height: 1013,
			title: 'historyJacobsenTitle',
			text: 'historyJacobsenText',
			alt: 'historyJacobsenAlt',
			caption: 'historyJacobsenCaption',
			number: 'historyHeartNumber',
			hearts: [
				{ id: 'blomster-hjerte', number: '365e' },
				{ id: 'explosion', number: '365f' },
				{ id: 'plus', number: '365h' },
				{ id: 'circle', number: '366b' },
				{ id: 'flower', number: '366h' }
			]
		}
	];
</script>

{#snippet linked(text: string)}
	{#each parseDescription(text) as segment, i (i)}
		{#if segment.href}<a href={segment.href} target="_blank" rel="noopener">{segment.text}</a
			>{:else}{segment.text}{/if}
	{/each}
{/snippet}

<section class="history" aria-labelledby="history-heading">
	<h2 id="history-heading">{t('historyTitle', lang)}</h2>
	<p>{t('historyIntro', lang)}</p>

	{#each SOURCES as source (source.id)}
		{@const src = `${base}/about/history/${source.image}`}
		<article class="source" class:floated={source.small} aria-labelledby={`history-${source.id}`}>
			<h3 id={`history-${source.id}`}>{t(source.title, lang)}</h3>
			<figure class:portrait={source.height > source.width} class:small={source.small}>
				{#if source.small}
					<img
						{src}
						alt={t(source.alt, lang)}
						width={source.width}
						height={source.height}
						loading="lazy"
					/>
				{:else}
					<a href={src} target="_blank" rel="noopener">
						<img
							{src}
							alt={t(source.alt, lang)}
							width={source.width}
							height={source.height}
							loading="lazy"
						/>
					</a>
				{/if}
				<figcaption>{@render linked(t(source.caption, lang))}</figcaption>
			</figure>
			<p>{t(source.text, lang)}</p>
			{#if source.hearts.length && source.number}
				{@const number = source.number}
				<h4>{t('historyOurVersions', lang)}</h4>
				<ul class="hearts">
					{#each source.hearts as heart (heart.id)}
						<li>
							<a href={heartHref(heart.id, lang)}>
								<img
									src={`${base}${heartImagePath(heart.id)}`}
									alt=""
									width="800"
									height="800"
									loading="lazy"
								/>
								<span class="name">{heartName(CARDS[heart.id]!, lang)}</span>
								<span class="number">{t(number, lang, { n: String(heart.number) })}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</article>
	{/each}

	<p>{@render linked(t('historyMore', lang))}</p>
</section>

<style>
	.history {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin: 12px 0;
		padding: 28px 0;
		border-top: 1px solid var(--line, #dce3d5);
		border-bottom: 1px solid var(--line, #dce3d5);
	}

	h2 {
		margin: 0;
		font-size: 25px;
		line-height: 1.25;
		color: var(--ink, #294033);
	}

	p {
		margin: 0;
		font-size: 16px;
		line-height: 1.55;
		color: var(--ink);
	}

	p a,
	figcaption a {
		color: var(--green);
		font-weight: 600;
	}

	.source {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 12px;
	}

	h3 {
		margin: 0;
		font-size: 19px;
		font-weight: 600;
		color: var(--deep);
	}

	h4 {
		margin: 4px 0 0;
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}

	figure {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0;
	}

	figure img {
		display: block;
		width: 100%;
		height: auto;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--white);
	}

	/* A tall page would fill the screen at the column's full width. */
	figure.portrait {
		max-width: 420px;
	}

	/* One heart: not much bigger than the real one. */
	figure.small {
		max-width: 240px;
	}

	/* A small picture stands beside its text, which wraps round it. */
	.source.floated {
		display: flow-root;
	}

	.source.floated > * + * {
		margin-top: 12px;
	}

	.source.floated figure {
		float: left;
		width: 200px;
		margin-right: 24px;
		margin-bottom: 8px;
	}

	@media (max-width: 480px) {
		.source.floated figure {
			width: 140px;
			margin-right: 16px;
		}
	}

	figcaption {
		font-size: 13px;
		color: var(--muted);
	}

	.hearts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.hearts a {
		display: flex;
		flex-direction: column;
		gap: 2px;
		color: var(--ink);
		text-decoration: none;
	}

	.hearts img {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 8px;
	}

	.hearts .name {
		font-size: 14px;
		font-weight: 600;
		color: var(--green);
	}

	.hearts a:hover .name {
		color: var(--red);
	}

	.hearts .number {
		font-size: 12px;
		color: var(--muted);
	}
</style>
