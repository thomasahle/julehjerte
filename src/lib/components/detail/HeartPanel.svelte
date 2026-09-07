<!--
  The detail page's right-hand text panel — docs/redesign/DESIGN.md §4.

  Name and credit, the paragraph about this heart, the two facts (difficulty and
  symmetry) and a link on to the illustrated guide. A translucent white card,
  because it sits on the scene's sky.

  The five weaving steps used to be repeated here; they now live only on
  /saadan-goer-du/ (the guide the link leads to), and every gallery heart has a
  written description of its own instead — $lib/data/heartDescriptions.
-->
<script lang="ts">
	import DifficultyDots from '$lib/components/DifficultyDots.svelte';
	import { t, type Language } from '$lib/i18n';
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
		<div class="about">
			<p class="description">{description}</p>
		</div>
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

	.about {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
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



	/* Below 1100 the panel stacks under the stage and grows down into the
	   landscape drawing at the foot of the scene: firs, deer and gold stars came
	   through the 55% white and sat between the lines of the paragraph. Over
	   plain sky the frosted card is the intended treatment, so only the widths
	   that share space with the drawing get an opaque ground. */
	@media (max-width: 1099px) {
		.panel {
			background: var(--white);
		}
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
