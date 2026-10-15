<script lang="ts">
	import GuideTrace from '$lib/components/GuideTrace.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { ArrowRightIcon } from '$lib/components/icons';
	import { t, tArray, type Language } from '$lib/i18n';
	import { href, heartHref } from '$lib/i18n/routes';
	import { pageTitle } from '$lib/seo';

	let { lang }: { lang: Language } = $props();
	let titles = $derived(tArray('noPrinterStepTitles', lang));
	let texts = $derived(tArray('noPrinterStepTexts', lang));
	let notes = $derived(tArray('noPrinterStepNotes', lang));
	let captions = $derived(tArray('noPrinterCaptions', lang));
	let questions = $derived(tArray('noPrinterQuestions', lang));
	let answers = $derived(tArray('noPrinterAnswers', lang));
</script>

<svelte:head><title>{pageTitle('noPrinter', lang)}</title></svelte:head>

<PageHeader {lang} active="howto" />
<main id="main-content" tabindex="-1">
	<header class="intro">
		<a class="back" href={href('howTo', lang)}><span aria-hidden="true">←</span> {t('navHowTo', lang)}</a>
		<h1>{t('noPrinterTitle', lang)}</h1>
		<p>{t('noPrinterIntro', lang)}</p>
	</header>

	<div class="preparation">
		<section aria-labelledby="materials-heading">
			<h2 id="materials-heading">{t('guideMaterialsTitle', lang)}</h2>
			<ul>{#each tArray('noPrinterMaterials', lang) as item (item)}<li>{item}</li>{/each}</ul>
		</section>
		<aside class="paper-test">
			<h2>{t('noPrinterStartTitle', lang)}</h2>
			<p>{t('noPrinterStartText', lang)}</p>
			<a href={heartHref('classic-3x3', lang)}>{t('guideStartLink', lang)} <span aria-hidden="true">→</span></a>
		</aside>
	</div>

	<section aria-labelledby="steps-heading">
		<h2 id="steps-heading">{t('noPrinterStepsTitle', lang)}</h2>
		<ol class="steps">
			{#each titles as title, i (i)}
				<li class="step">
					<figure>
						<GuideTrace step={i + 1} {lang} />
						<figcaption>{captions[i]}</figcaption>
					</figure>
					<div class="instructions">
						<h3><span class="number" aria-hidden="true">{i + 1}</span><span><span class="sr-only">{t('howToStepLabel', lang, { n: i + 1 })}: </span>{title}</span></h3>
						<p>{texts[i]}</p>
						<p class="note">{notes[i]}</p>
						{#if i === 2}
							<details>
								<summary>{t('noPrinterScreenHelpTitle', lang)}</summary>
								<p>{t('noPrinterScreenHelpTrace', lang)}</p>
								<a href={heartHref('classic-3x3', lang)}>{t('noPrinterScreenHelpTraceLink', lang)} <span aria-hidden="true">→</span></a>
								<p>{t('noPrinterScreenHelpText', lang)}</p>
								<a href="https://support.apple.com/{lang === 'da' ? 'da-dk' : 'en-us'}/111795">{t('noPrinterScreenHelpLink', lang)} <span aria-hidden="true">↗</span></a>
							</details>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	</section>

	<section class="finish" aria-labelledby="finish-heading">
		<div>
			<h2 id="finish-heading">{t('noPrinterFinishTitle', lang)}</h2>
			<p>{t('noPrinterFinishText', lang)}</p>
		</div>
		<a class="btn btn-primary" href={`${href('howTo', lang)}#weave-heading`}><ArrowRightIcon size={18} />{t('noPrinterFinishLink', lang)}</a>
	</section>

	<section class="questions" aria-labelledby="questions-heading">
		<h2 id="questions-heading">{t('noPrinterQuestionsTitle', lang)}</h2>
		<div class="question-grid">
			{#each questions as question, i (i)}
				<section><h3>{question}</h3><p>{answers[i]}</p></section>
			{/each}
		</div>
	</section>
</main>

<style>
	main {
		display: grid;
		gap: 48px;
		max-width: 1160px;
		margin: 0 auto;
		padding: 40px 40px 64px;
	}
	h1, h2, h3, p, figure {
		margin: 0;
	}
	h1, h2, h3 {
		color: var(--deep);
		font-weight: 600;
		text-wrap: balance;
	}
	h1 {
		font-size: 46px;
		line-height: 1.1;
	}
	h2 {
		font-size: 26px;
		line-height: 1.25;
		margin-bottom: 20px;
	}
	h3 {
		font-size: 22px;
		line-height: 1.3;
		margin-bottom: 16px;
	}
	p, li {
		color: var(--ink);
		font-size: 16px;
		line-height: 1.65;
	}
	a:not(.btn) {
		color: var(--green);
		text-underline-offset: 3px;
	}
	a:not(.btn):hover {
		color: var(--red);
	}
	.intro {
		display: grid;
		gap: 20px;
		max-width: 820px;
	}
	.intro p {
		font-size: 19px;
		line-height: 1.6;
		color: var(--muted);
	}
	.back {
		font-size: 14px;
		width: fit-content;
	}
	.preparation {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 40px;
		align-items: start;
	}
	.preparation h2 {
		font-size: 22px;
		margin-bottom: 14px;
	}
	ul {
		list-style: disc;
		margin: 0;
		padding-left: 20px;
	}
	ul li + li {
		margin-top: 8px;
	}
	.paper-test {
		padding: 24px;
		border-radius: 14px;
		background: var(--cream2);
	}
	.paper-test a {
		display: inline-block;
		margin-top: 16px;
		font-weight: 600;
	}
	.steps {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 24px;
	}
	.step {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.3fr);
		border: 1px solid var(--line);
		border-radius: 16px;
		overflow: hidden;
		background: white;
	}
	figure {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 18px;
		background: var(--cream2);
	}
	figcaption {
		font-size: 14px;
		line-height: 1.5;
		text-align: center;
		color: var(--muted);
		padding: 8px 12px 4px;
	}
	.instructions {
		align-self: center;
		padding: 30px;
	}
	.instructions h3 {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}
	.number {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 30px;
		height: 30px;
		font-size: 15px;
		border-radius: 50%;
		color: white;
		background: var(--green);
	}
	.note {
		font-size: 15px;
		line-height: 1.6;
		border-left: 3px solid var(--gold);
		margin-top: 18px;
		padding-left: 14px;
	}
	details {
		margin-top: 22px;
		font-size: 15px;
	}
	summary {
		cursor: pointer;
		color: var(--green);
		font-weight: 600;
	}
	details p {
		margin: 12px 0;
		font-size: 15px;
	}
	.finish {
		display: grid;
		gap: 22px;
		justify-items: start;
		padding: 28px;
		background: var(--cream2);
		border-radius: 14px;
	}
	.finish h2 {
		margin-bottom: 12px;
	}
	.finish .btn {
		white-space: normal;
		height: auto;
		min-height: 44px;
		padding: 12px 20px;
	}
	.question-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 28px 40px;
	}
	.question-grid section {
		border-top: 1px solid var(--line);
		padding-top: 20px;
	}
	.question-grid h3 {
		font-size: 19px;
		margin-bottom: 10px;
	}
	@media (max-width: 899px) {
		main {
			padding: 32px 24px 48px;
			gap: 36px;
		}
		h1 {
			font-size: 38px;
		}
		.preparation {
			gap: 24px;
		}
		.step {
			grid-template-columns: minmax(0, 0.85fr) minmax(0, 1fr);
		}
		figure {
			padding: 10px;
		}
		.instructions {
			padding: 24px;
		}
	}
	@media (max-width: 699px) {
		main {
			padding: 28px 16px 40px;
		}
		h1 {
			font-size: 34px;
		}
		.intro p {
			font-size: 18px;
		}
		.preparation, .step, .question-grid {
			grid-template-columns: 1fr;
		}
		figure {
			align-items: center;
			padding: 14px;
		}
		figure :global(svg) {
			max-width: 380px;
		}
		figcaption {
			max-width: 340px;
		}
		.instructions {
			padding: 24px 20px;
		}
		.finish {
			padding: 24px 20px;
		}
	}
</style>
