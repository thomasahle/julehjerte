<!--
  The detail page's right-hand text panel — docs/redesign/DESIGN.md §4.

  Name and credit, the description, the two facts (difficulty and symmetry), and
  the five weaving steps with a link on to the illustrated guide. A translucent
  white card, because it sits on the scene's sky.
-->
<script lang="ts">
	import DifficultyDots from '$lib/components/DifficultyDots.svelte';
	import StepList from './StepList.svelte';
	import { ArrowRightIcon } from '$lib/components/icons';
	import { t, type Language } from '$lib/i18n';
	import { href as routeHref } from '$lib/i18n/routes';
	import type { HeartInfo } from '$lib/types/heart';

	/** One "Udgiver: …" row under the credit line, optionally a link. */
	interface MetaRow {
		label: string;
		value: string;
		url: string | null;
	}

	interface Props {
		lang: Language;
		info: HeartInfo;
		/** "af Thomas · 3 × 3 striber" — already formatted by stripsLabel(). */
		stripsLabel: string;
		description?: string | null;
		/** Publisher, source, date … whichever the heart carries. */
		extraMeta?: MetaRow[];
		/** One template for both lobes, or one per side. */
		sharedTemplate: boolean;
		/** A heart someone sent by link, not one from the gallery. */
		isShared?: boolean;
	}

	let {
		lang,
		info,
		stripsLabel,
		description = null,
		extraMeta = [],
		sharedTemplate,
		isShared = false
	}: Props = $props();
</script>

<div class="panel">
	{#if isShared}
		<p class="shared-note">{t('sharedHeart', lang)}</p>
	{/if}

	<div class="panel-head">
		<h1>{info.name}</h1>
		<p class="credit">
			{#if info.author}
				{t('by', lang)}
				{#if info.authorUrl}
					<a href={info.authorUrl} target="_blank" rel="noopener noreferrer">{info.author}</a>
				{:else}
					{info.author}
				{/if}
				&middot;
			{/if}
			{stripsLabel}
		</p>
		{#if extraMeta.length}
			<p class="credit-extra">
				{#each extraMeta as row, i (row.label)}
					{#if i > 0}&middot;{/if}
					<span>
						{row.label}:
						{#if row.url}
							<a href={row.url} target="_blank" rel="noopener noreferrer">{row.value}</a>
						{:else}
							{row.value}
						{/if}
					</span>
				{/each}
			</p>
		{/if}
	</div>

	{#if description}
		<p class="description">{description}</p>
	{/if}

	<div class="facts">
		<div class="fact">
			<span class="fact-label">{t('difficulty', lang)}</span>
			<DifficultyDots level={info.difficulty} {lang} size={10} />
		</div>
		<div class="fact">
			<span class="fact-label">{t('symmetry', lang)}</span>
			<span class="fact-value">
				{sharedTemplate ? t('symmetryOneTemplate', lang) : t('symmetryTwoTemplates', lang)}
			</span>
		</div>
	</div>

	<div class="how-to">
		<h2>{t('howToMake', lang)}</h2>
		<StepList {lang} />
		<a class="guide-link" href={routeHref('howTo', lang)}>
			{t('seeIllustratedGuide', lang)}
			<ArrowRightIcon size={16} />
		</a>
	</div>
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 22px;
		padding: 24px 28px;
		border-radius: 16px;
		background: rgb(255 255 255 / 0.55);
	}

	.shared-note {
		margin: 0;
		color: var(--green);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.panel-head {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.panel h1 {
		margin: 0;
		font-size: 44px;
		font-weight: 600;
		line-height: 1.05;
		color: var(--deep);
	}

	.credit {
		margin: 0;
		font-size: 16px;
		color: var(--muted);
	}

	.credit-extra {
		margin: 0;
		font-size: 14px;
		color: var(--muted);
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.credit a,
	.credit-extra a {
		color: var(--green);
		text-decoration: none;
	}

	.credit a:hover,
	.credit-extra a:hover {
		color: var(--red);
		text-decoration: underline;
	}

	.description {
		margin: 0;
		font-size: 17px;
		line-height: 1.5;
		color: var(--ink);
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		padding: 16px 0;
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}

	.fact {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.fact-label {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.fact-value {
		font-size: 15px;
		color: var(--ink);
	}

	.how-to {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.how-to h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: var(--deep);
	}

	.guide-link {
		display: inline-flex;
		align-items: center;
		align-self: flex-start;
		gap: 6px;
		font-size: 14px;
		font-weight: 600;
		color: var(--green);
		text-decoration: none;
	}

	.guide-link:hover {
		color: var(--red);
	}

	@media (max-width: 899px) {
		.panel h1 {
			font-size: 36px;
		}
	}

	@media (max-width: 599px) {
		.panel {
			padding: 20px 18px;
			gap: 18px;
		}

		.panel h1 {
			font-size: 30px;
		}

		.description {
			font-size: 16px;
		}

		.facts {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
