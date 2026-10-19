<script lang="ts">
	import { base } from '$app/paths';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { t, type Language } from '$lib/i18n';
	import { heartHref } from '$lib/i18n/routes';
	import { pageTitle } from '$lib/seo';
	import { archiveRecords, filterArchive, hasArchiveTemplate, type ArchiveFilter } from '$lib/archive';

	let { lang }: { lang: Language } = $props();
	let query = $state('');
	let source = $state('');
	let filter = $state<ArchiveFilter>('all');
	const PAGE_SIZE = 60;
	let pageNumber = $state(1);
	let resultSummary = $state<HTMLParagraphElement | null>(null);
	let records = $derived(archiveRecords(lang));
	let sources = $derived([...new Set(records.map(record => record.source))].sort((a, b) => a.localeCompare(b, lang)));
	let shown = $derived(filterArchive(records, query, source, filter));
	let pageCount = $derived(Math.max(1, Math.ceil(shown.length / PAGE_SIZE)));
	let currentPage = $derived(Math.min(pageNumber, pageCount));
	let pageRecords = $derived(shown.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));
	let localCount = $derived(records.filter(record => record.kind === 'juleflet').length);

	function changePage(next: number) {
		pageNumber = Math.max(1, Math.min(next, pageCount));
		// Bring the new page's start into view, including for keyboard users who
		// used the controls below the cards. Search never depends on this page.
		resultSummary?.focus();
	}
</script>

<svelte:head>
	<title>{pageTitle('archive', lang)}</title>
</svelte:head>

<PageHeader {lang} />

{#snippet pagination()}
	{#if pageCount > 1}
		<nav class="pagination" aria-label={t('archivePagination', lang)}>
			<button class="btn btn-outline" type="button" disabled={currentPage === 1} onclick={() => changePage(currentPage - 1)}>{t('archivePreviousPage', lang)}</button>
			<span>{t('archivePageCount', lang, { page: currentPage, pages: pageCount })}</span>
			<button class="btn btn-outline" type="button" disabled={currentPage === pageCount} onclick={() => changePage(currentPage + 1)}>{t('archiveNextPage', lang)}</button>
		</nav>
	{/if}
{/snippet}

<main class="archive" id="main-content" tabindex="-1">
	<header class="introduction">
		<p class="eyebrow">{t('archiveEyebrow', lang)}</p>
		<h1>{t('archiveTitle', lang)}</h1>
		<p>{t('archiveIntro', lang)}</p>
		<p class="scope">{t('archiveScope', lang, { local: localCount, references: records.length - localCount })}</p>
		<p class="scope">{t('archiveAvailability', lang)}</p>
	</header>

	<form class="filters" role="search" onsubmit={(event) => event.preventDefault()}>
		<label class="search">
			<span>{t('archiveSearch', lang)}</span>
			<input type="search" bind:value={query} oninput={() => pageNumber = 1} placeholder={t('archiveSearchHint', lang)} />
		</label>
		<label>
			<span>{t('archiveSourceFilter', lang)}</span>
			<select bind:value={source} onchange={() => pageNumber = 1}>
				<option value="">{t('archiveAllSources', lang)}</option>
				{#each sources as item (item)}<option value={item}>{item}</option>{/each}
			</select>
		</label>
		<label>
			<span>{t('archiveAvailabilityFilter', lang)}</span>
			<select bind:value={filter} onchange={() => pageNumber = 1}>
				<option value="all">{t('archiveAllRecords', lang)}</option>
				<option value="juleflet">{t('archiveJulefletTemplates', lang)}</option>
				<option value="templates">{t('archiveWithTemplates', lang)}</option>
				<option value="references">{t('archiveReferences', lang)}</option>
			</select>
		</label>
	</form>
	<p class="results" role="status" tabindex="-1" bind:this={resultSummary}>
		{t('archiveResultCount', lang, { shown: shown.length, total: records.length })}
		{#if shown.length} · {t('archivePageCount', lang, { page: currentPage, pages: pageCount })}{/if}
	</p>
	{@render pagination()}

	{#if !shown.length}
		<p class="empty">{t('archiveNoResults', lang)}</p>
	{/if}
	<div class="records">
		{#each pageRecords as record (record.id)}
			<article class="record" id={record.id}>
				{#if record.thumbnail && record.heartId}
					<a class="thumbnail" href={heartHref(record.heartId, lang)} tabindex="-1" aria-hidden="true">
						<img src={`${base}${record.thumbnail}`} alt="" loading="lazy" decoding="async" width="120" height="90" />
					</a>
				{/if}
				<div class="record-body">
					<p class="record-source">{record.source}</p>
					<h2>
						<a href={record.heartId ? heartHref(record.heartId, lang) : record.sourceUrls[0]}>
							{record.title || t('archiveUntitled', lang)}
						</a>
					</h2>
					<p class="availability" class:available={hasArchiveTemplate(record)}>
						{#if record.kind === 'juleflet'}{t('archiveLocalStatus', lang)}
						{:else if record.preservedTemplates?.length}{t('archivePreservedStatus', lang)}
						{:else if record.templateUrls.length}{t('archiveExternalStatus', lang)}
						{:else}{t('archiveReferenceStatus', lang)}{/if}
					</p>
					{#if record.credits.length}
						<p class="credit">{record.creditRole === 'drawings' ? t('archiveDrawingCredit', lang) : record.creditRole === 'publisher' ? t('publisher', lang) : t('archiveCredit', lang)}: {record.credits.join(' · ')}</p>
					{:else}
						<p class="credit">{t('archiveUnknownCredit', lang)}</p>
					{/if}
					{#if record.date}<p class="credit">{t('date', lang)}: {record.date}</p>{/if}
					{#if record.license && record.license !== 'unknown'}
						<p class="credit">{t('archiveLicense', lang)}: {#if record.licenseUrl}<a href={record.licenseUrl}>{record.license === 'custom-restriction' ? t('archiveLicenseRestricted', lang) : record.license}</a>{:else}{record.license}{/if}</p>
					{/if}
					<div class="links">
						{#if record.heartId}<a href={heartHref(record.heartId, lang)}>{t('archiveOpenHeart', lang)}</a>{/if}
						{#each record.preservedTemplates ?? [] as template (template.url)}
							<a href={`${base}${template.url}`}>{t('archiveSavedOriginal', lang)}: {template.name}</a>
						{/each}
						{#each record.templateUrls as url, i (url)}
							<a href={url}>{t('archiveSourceTemplate', lang)}{record.templateUrls.length > 1 ? ` ${i + 1}` : ''}{url.startsWith('https://web.archive.org/') ? ' · Wayback Machine' : ''}</a>
						{/each}
						{#if !record.templateUrls.length && record.imageUrls.length}
							<a href={record.imageUrls[0]}>{t('archiveViewReference', lang)}</a>
						{/if}
					</div>
					<details>
						<summary>{t('archiveProvenance', lang)}</summary>
						{#if record.history === 'permo'}
							<p>{t('archivePermoHistory', lang)}</p>
							{#if record.historyUrl}<p><a href={record.historyUrl}>{t('archiveHistoricSource', lang)}</a></p>{/if}
						{/if}
						{#if record.license === 'unknown'}<p>{t('archiveLicenseUnknown', lang)}</p>{/if}
						{#if record.sourceUrls.length}
							<ul class="source-links">
								{#each record.sourceUrls as url (url)}<li><a href={url}>{url}</a></li>{/each}
							</ul>
						{:else}<p>{t('archiveNoSource', lang)}</p>{/if}
						{#if record.relatedTemplateUrls.length}
							<p>{t('archiveUnverifiedTemplates', lang)}</p>
							<ul class="source-links">
								{#each record.relatedTemplateUrls as url (url)}<li><a href={url}>{url}</a></li>{/each}
							</ul>
						{/if}
					</details>
				</div>
			</article>
		{/each}
	</div>
	{@render pagination()}
</main>

<style>
	.archive { max-width: 1200px; margin: 0 auto; padding: 56px 40px 72px; }
	.introduction { max-width: 760px; }
	.eyebrow { color: var(--green); font-size: 13px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
	h1 { margin: 12px 0 20px; color: var(--deep); font-size: clamp(32px, 5vw, 48px); font-weight: 600; line-height: 1.08; }
	.introduction > p { margin-bottom: 14px; line-height: 1.6; }
	.scope { color: var(--muted); font-size: 14px; }
	.filters { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 32px; padding: 20px; border-radius: 14px; background: var(--cream2); }
	.filters label { display: flex; flex: 1 1 200px; flex-direction: column; gap: 8px; min-width: 0; color: var(--green); font-size: 13px; font-weight: 600; }
	.filters .search { flex-grow: 2; }
	input, select { box-sizing: border-box; width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--sage-dark); border-radius: 8px; background: var(--white); color: var(--ink); font: inherit; font-size: 15px; }
	.results { margin: 22px 0 16px; color: var(--muted); font-size: 14px; }
	.pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 20px 0; color: var(--muted); font-size: 14px; }
	.pagination button:disabled { opacity: .45; cursor: default; }
	.records { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
	.record { display: flex; gap: 16px; align-items: start; padding: 22px; border: 1px solid var(--line); border-radius: 12px; background: var(--white); }
	.record-body { flex: 1; min-width: 0; }
	.thumbnail { flex: 0 0 96px; }
	.thumbnail img { width: 96px; height: 96px; object-fit: contain; border-radius: 6px; }
	.record-source { color: var(--muted); font-size: 12px; margin-bottom: 5px; }
	h2 { color: var(--deep); font-size: 18px; line-height: 1.35; font-weight: 600; margin: 0 0 10px; overflow-wrap: anywhere; }
	h2 a { color: inherit; text-decoration: none; }
	h2 a:hover { text-decoration: underline; }
	.availability { color: var(--muted); font-size: 12px; line-height: 1.5; margin-bottom: 10px; }
	.available { color: var(--green); font-weight: 600; }
	.credit { font-size: 13px; line-height: 1.5; color: var(--muted); margin: 5px 0; }
	.links { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 14px; font-size: 13px; line-height: 1.6; }
	a { color: var(--green); text-underline-offset: 3px; }
	details { margin-top: 14px; color: var(--muted); font-size: 13px; line-height: 1.6; }
	summary { cursor: pointer; color: var(--green); padding: 4px 0; }
	details p { margin: 10px 0; }
	.source-links { padding-left: 18px; margin: 10px 0; overflow-wrap: anywhere; }
	.source-links li { margin: 5px 0; }
	.empty { padding: 32px 0; }
	@media (max-width: 800px) { .archive { padding: 36px 24px 48px; } .records { grid-template-columns: 1fr; } }
	@media (max-width: 500px) { .archive { padding: 28px 16px 40px; } .filters { padding: 16px; } .record { padding: 18px; gap: 12px; } .thumbnail { flex-basis: 72px; } .thumbnail img { width: 72px; height: 72px; } }
</style>
