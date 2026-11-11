<script lang="ts">
	import GuideStep from '$lib/components/GuideStep.svelte';
	import GuideWeave from '$lib/components/GuideWeave.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { ArrowRightIcon, PencilIcon } from '$lib/components/icons';
	import { pageTitle } from '$lib/seo';
	import { t, tArray, type Language } from '$lib/i18n';
	import { href, heartPath } from '$lib/i18n/routes';
	import { base } from '$app/paths';
	import { onMount, tick } from 'svelte';

	let { lang }: { lang: Language } = $props();
	// The two halves are made with a printed template or one traced from a
	// screen: two rows, of which a phone shows the chosen one.
	let ways = $derived([
		{ way: 'print' as const, id: 'prepare-heading', title: t('guidePrepareTitle', lang), steps: tArray('instructions', lang), note: '' },
		{ way: 'screen' as const, id: 'trace-heading', title: t('guideTraceTitle', lang), steps: tArray('guideTraceSteps', lang), note: t('guideTraceNote', lang) }
	]);
	let way = $state<'print' | 'screen'>('print');
	async function showScreen() {
		way = 'screen';
		await tick();
		document.getElementById('trace-heading')?.scrollIntoView();
	}
	// Links to the old page without a printer arrive at the row that replaced it.
	onMount(() => {
		if (location.hash === '#trace-heading') void showScreen();
	});
	// One card for each white strip, and one for the heart they end as.
	let weaveSteps = $derived([
		...tArray('guideWeaveStepTitles', lang).map((title, i) => ({ title, text: tArray('guideWeaveStepTexts', lang)[i], row: i + 1, id: undefined })),
		{ title: t('guideFinishTitle', lang), text: t('guideFinishText', lang), row: 0, id: 'finish-heading' }
	]);
	let questions = $derived(tArray('guideQuestions', lang));
	let answers = $derived(tArray('guideAnswers', lang));
</script>

<svelte:head><title>{pageTitle('howTo', lang)}</title></svelte:head>

<PageHeader {lang} active="howto" />
<main class="how-to" id="main-content" tabindex="-1">
	<header class="intro">
		<h1>{t('howToTitle', lang)}</h1>
		<p>{t('howToIntro', lang)}</p>
	</header>

	<div class="before-you-start">
		<section class="materials" aria-labelledby="materials-heading">
			<h2 id="materials-heading">{t('guideMaterialsTitle', lang)}</h2>
			<ul>{#each tArray('guideMaterials', lang) as item (item)}<li>{item}</li>{/each}</ul>
		</section>
		<aside class="start">
			<h2>{t('guideStartTitle', lang)}</h2>
			<p>{t('guideStartText', lang)}</p>
			<a href={`${base}${heartPath('classic-3x3', lang)}`}>{t('guideStartLink', lang)} <span aria-hidden="true">→</span></a>
		</aside>
	</div>

	<div class="prepare">
		<div class="ways" role="radiogroup" aria-label={t('guideWayLabel', lang)}>
			<label><input type="radio" name="way" value="print" bind:group={way} /><span>{t('guideWayPrint', lang)}</span></label>
			<label><input type="radio" name="way" value="screen" bind:group={way} /><span>{t('guideWayScreen', lang)}</span></label>
		</div>
		{#each ways as row (row.way)}
			<section data-way={row.way} aria-labelledby={row.id}>
				<h2 id={row.id}>{row.title}</h2>
				<ol class="steps">
					{#each row.steps as step, i (i)}
						<li class="card">
							<div class="art"><GuideStep step={i + 1} way={row.way} {lang} /></div>
							<div class="caption">
								<span class="number" aria-hidden="true">{i + 1}</span>
								<p><span class="sr-only">{t('howToStepLabel', lang, { n: i + 1 })}: </span>{step}</p>
							</div>
						</li>
					{/each}
				</ol>
				{#if row.note}<p class="diagram-note">{row.note}</p>{/if}
			</section>
		{/each}
		<p class="note">{t('guidePrepareNote', lang)}</p>
	</div>

	<section class="weaving" aria-labelledby="weave-heading">
		<h2 id="weave-heading">{t('guideWeaveTitle', lang)}</h2>
		<p class="reading-width">{t('guideWeaveIntro', lang)}</p>
		<p class="reading-width" data-testid="guide-marks">{t('guideMarksNote', lang)}</p>
		<div class="loop-lesson">
			<h3>{t('guideLoopTitle', lang)}</h3>
			<p class="reading-width">{t('guideLoopText', lang)}</p>
			<div class="loop-pair">
				<figure><GuideWeave variant="inside" /><figcaption>{t('guideLoopInside', lang)}</figcaption></figure>
				<figure><GuideWeave variant="around" /><figcaption>{t('guideLoopAround', lang)}</figcaption></figure>
			</div>
			<p class="diagram-note">{t('guideLoopCaption', lang)}</p>
		</div>
		<ol class="weave-steps">
			{#each weaveSteps as step (step.title)}
				<li class="card">
					<div class="art"><GuideWeave variant={step.row ? 'rows' : 'finished'} row={step.row} /></div>
					<div class="weave-caption"><h3 id={step.id}>{step.title}</h3><p>{step.text}</p></div>
				</li>
			{/each}
		</ol>
		<p class="diagram-note">{t('guideWeaveDiagramCaption', lang)}</p>
	</section>

	<section class="questions" aria-labelledby="questions-heading">
		<h2 id="questions-heading">{t('guideQuestionsTitle', lang)}</h2>
		<div class="question-grid">
			{#each questions as question, i (i)}
				<section><h3>{question}</h3><p>{answers[i]}</p></section>
			{/each}
		</div>
	</section>

	<div class="actions">
		<a class="btn btn-primary" href={href('home', lang)}><ArrowRightIcon size={18} />{t('heroSeeTemplates', lang)}</a>
		<a class="btn btn-outline" href={href('generator', lang)}><PencilIcon size={18} />{t('heroDesignHeart', lang)}</a>
	</div>
</main>

<style>
	.how-to {
		display: flex;
		flex-direction: column;
		gap: 48px;
		box-sizing: border-box;
		width: 100%;
		max-width: 1280px;
		margin: 0 auto;
		padding: 48px 40px 56px;
	}
	h1, h2, h3, p {
		margin: 0;
	}
	h1 {
		font-size: 44px;
		font-weight: 600;
		line-height: 1.1;
		color: var(--deep);
		text-wrap: balance;
	}
	h2 {
		font-size: 28px;
		font-weight: 600;
		line-height: 1.2;
		color: var(--deep);
		margin-bottom: 20px;
	}
	h3 {
		font-size: 19px;
		font-weight: 600;
		line-height: 1.35;
		color: var(--deep);
		margin-bottom: 10px;
	}
	p, li {
		font-size: 16px;
		line-height: 1.65;
		color: var(--ink);
	}
	a:not(.btn) {
		color: var(--green);
		text-underline-offset: 3px;
	}
	a:not(.btn):hover {
		color: var(--red);
	}
	.intro {
		max-width: 800px;
		display: grid;
		gap: 18px;
	}
	.intro p {
		font-size: 18px;
		color: var(--muted);
	}
	.before-you-start {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 32px;
		align-items: start;
	}
	.materials h2, .start h2 {
		font-size: 22px;
		margin-bottom: 14px;
	}
	.materials ul {
		list-style: disc;
		margin: 0;
		padding-left: 20px;
	}
	.materials li + li {
		margin-top: 8px;
	}
	.start {
		background: var(--cream2);
		border-radius: 14px;
		padding: 24px;
	}
	.start a {
		display: inline-block;
		font-weight: 600;
		margin-top: 14px;
	}
	.steps, .weave-steps {
		display: grid;
		gap: 20px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.steps, .weave-steps {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.prepare {
		display: grid;
		gap: 40px;
	}
	.prepare .note {
		margin-top: 0;
	}
	/* The choice between the two rows is a phone's; wider screens show both. */
	.ways {
		display: none;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		overflow: hidden;
		background: var(--white);
	}
	.ways label {
		flex: 1 1 0;
		position: relative;
	}
	.ways input {
		position: absolute;
		inset: 0;
		opacity: 0;
		margin: 0;
		cursor: pointer;
	}
	.ways span {
		display: block;
		padding: 10px 8px;
		text-align: center;
		font-size: 15px;
		font-weight: 600;
		color: var(--green);
	}
	.ways input:checked + span {
		background: var(--green);
		color: var(--white);
	}
	.ways input:focus-visible + span {
		box-shadow:
			inset 0 0 0 3px var(--blue),
			inset 0 0 0 5px var(--white);
	}
	.weave-steps {
		margin-top: 28px;
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
		background: var(--cream2);
		padding: 12px;
	}
	.caption {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 18px;
	}
	.caption p {
		font-size: 15px;
		line-height: 1.55;
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
	.weave-caption {
		padding: 22px;
	}
	.reading-width {
		max-width: 800px;
	}
	.note {
		margin-top: 18px;
		padding-left: 16px;
		border-left: 3px solid var(--gold);
		max-width: 800px;
	}
	.loop-lesson {
		margin-top: 28px;
		padding: 28px;
		background: var(--cream2);
		border-radius: 16px;
	}
	.loop-pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px;
		margin-top: 24px;
	}
	figure {
		margin: 0;
		background: var(--page);
		border: 1px solid var(--line);
		border-radius: 12px;
		overflow: hidden;
	}
	figcaption {
		text-align: center;
		padding: 0 16px 20px;
		font-weight: 600;
		color: var(--deep);
	}
	.diagram-note {
		font-size: 14px;
		line-height: 1.5;
		color: var(--muted);
		margin-top: 16px;
		max-width: 800px;
	}
	.question-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 32px 48px;
	}
	.question-grid section {
		border-top: 1px solid var(--line);
		padding-top: 20px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}
	@media (max-width: 899px) {
		.how-to {
			padding: 32px 24px 40px;
			gap: 36px;
		}
		h1 {
			font-size: 36px;
		}
		h2 {
			font-size: 25px;
		}
		.steps {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.weave-steps {
			grid-template-columns: 1fr;
		}
		.weave-steps .card {
			display: grid;
			grid-template-columns: 1fr 1.2fr;
			align-items: center;
		}
	}
	@media (max-width: 599px) {
		.how-to {
			padding: 28px 16px 36px;
		}
		h1 {
			font-size: 32px;
		}
		.intro p {
			font-size: 17px;
		}
		.before-you-start, .steps, .loop-pair, .question-grid {
			grid-template-columns: 1fr;
		}
		.before-you-start {
			gap: 24px;
		}
		.prepare {
			gap: 24px;
		}
		.ways {
			display: flex;
		}
		.prepare:has(input[value='print']:checked) section[data-way='screen'],
		.prepare:has(input[value='screen']:checked) section[data-way='print'] {
			display: none;
		}
		.loop-lesson {
			padding: 20px 16px;
		}
		.weave-steps .card {
			display: flex;
			align-items: stretch;
		}
		.weave-caption {
			padding: 20px;
		}
	}
</style>
