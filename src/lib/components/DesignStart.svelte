<!--
  The /design start screen: the two featured ways in (a figure, a name) and four
  for people who already have an idea.

  Every drawing is real: gallery hearts, the heart the name card opens with,
  and figures from the generator's catalogue. They are drawn while
  prerendering ($lib/server/designStart), so the browser downloads none of
  their sources. They paint with the site's --paper-left / --paper-right, so the
  header's swatches recolour them; a few hearts set their own --paper-right to
  show that the colours can be changed.

  The winter landscape is inlined here, so a page showing this screen must not
  render <Landscape> anywhere else (see Landscape.svelte).
-->
<script module lang="ts">
	export type HeartArt = { viewBox: string; markup: string };
	export type StartArt = {
		hearts: Record<string, HeartArt>;
		motifs: { id: string; box: number; art: string }[];
		/** The name on the name card's slip and in its heart. */
		name: string;
	};
</script>

<script lang="ts">
	import { base } from '$app/paths';
	import Landscape from '$lib/components/Landscape.svelte';
	import { ArrowRightIcon } from '$lib/components/icons';
	import { t, type Language } from '$lib/i18n';
	import { href } from '$lib/i18n/routes';

	let {
		lang,
		art,
		onchoose
	}: { lang: Language; art: StartArt; onchoose: (mode: 'figure' | 'text') => void } = $props();

	const steps = ['generatorStepIdea', 'generatorStepAdjust', 'generatorStepCut'] as const;
</script>

{#snippet heart(slot: string)}
	<svg class="heart" viewBox={art.hearts[slot].viewBox} aria-hidden="true"
		>{@html art.hearts[slot].markup}</svg
	>
{/snippet}

<main id="main-content" class="start" tabindex="-1">
	<div class="land" aria-hidden="true"><Landscape class="land-svg" /></div>
	<div class="intro">
		<div>
			<p class="eyebrow">{t('generatorStartEyebrow', lang)}</p>
			<h1>{t('generatorStart', lang)}</h1>
			<p class="lede">{t('generatorIntro', lang)}<br />{t('generatorIntroMore', lang)}</p>
		</div>
		<div class="intro-art" aria-hidden="true">
			{@render heart('introTree')}{@render heart('introStar')}{@render heart('introHeart')}
		</div>
	</div>

	<div class="featured">
		<button class="choice" onclick={() => onchoose('figure')}>
			<div class="art">
				<span class="badge">{t('generatorStartBadge', lang)}</span>
				<div class="motifs" aria-hidden="true">
					{#each art.motifs as motif (motif.id)}<span
							><svg viewBox="0 0 {motif.box} {motif.box}" fill="currentColor"
								>{@html motif.art}</svg
							></span
						>{/each}
				</div>
				<div class="art-heart">{@render heart('figure')}</div>
			</div>
			<div class="body">
				<div>
					<h2>{t('generatorFigure', lang)}</h2>
					<p>{t('generatorFigureHint', lang)}</p>
				</div>
				<span class="arrow"><ArrowRightIcon /></span>
			</div>
		</button>
		<button class="choice name-card" onclick={() => onchoose('text')}>
			<div class="art" aria-hidden="true">
				<div class="name-slip">
					<small>{t('generatorNameSlip', lang)}</small>{art.name}<span class="cursor"></span>
				</div>
				<div class="art-heart">{@render heart('name')}</div>
			</div>
			<div class="body">
				<div>
					<h2>{t('generatorStartText', lang)}</h2>
					<p>{t('generatorTextHint', lang)}</p>
				</div>
				<span class="arrow"><ArrowRightIcon /></span>
			</div>
		</button>
	</div>

	<h2 class="section-line">{t('generatorHaveIdea', lang)}</h2>
	<div class="others">
		<a class="choice other" href="{href('editor', lang)}?tab=escher">
			<div class="art pair" aria-hidden="true">
				{@render heart('escherFront')}{@render heart('escherBack')}
			</div>
			<div class="body">
				<div>
					<h3>{t('generatorEscher', lang)}</h3>
					<p>{t('generatorEscherHint', lang)}</p>
				</div>
				<span class="arrow"><ArrowRightIcon /></span>
			</div>
		</a>
		<a class="choice other" href={href('paint', lang)}>
			<div class="art picture" aria-hidden="true">
				<img class="photo" src="{base}/hearts/photos/5star-small.jpg" alt="" width="231" height="240" />
				<span class="flow"><ArrowRightIcon /></span>
				{@render heart('picture')}
			</div>
			<div class="body">
				<div>
					<h3>{t('generatorPicture', lang)}</h3>
					<p>{t('generatorPictureHint', lang)}</p>
				</div>
				<span class="arrow"><ArrowRightIcon /></span>
			</div>
		</a>
		<a class="choice other" href={href('paint', lang)}>
			<div class="art" aria-hidden="true">
				<svg class="tool" viewBox="0 0 180 125">
					<rect x="9" y="6" width="162" height="113" rx="10" fill="#fffdf6" />
					<path d="M25 33H155M25 56H155M25 79H155M48 18V105M82 18V105M116 18V105M150 18V105" stroke="#ecede6" />
					<path d="M40 79Q49 35 72 55Q91 8 111 53Q157 51 116 85Q94 113 67 84Q38 97 40 79Z" fill="var(--paper-right)" />
					<path d="m119 71 32-32 10 10-32 32-18 9Z" fill="#ddb868" />
					<path d="m111 90 4-12 9 8Z" fill="#334736" />
				</svg>
			</div>
			<div class="body">
				<div>
					<h3>{t('generatorPaint', lang)}</h3>
					<p>{t('generatorPaintHint', lang)}</p>
				</div>
				<span class="arrow"><ArrowRightIcon /></span>
			</div>
		</a>
		<a class="choice other" href={href('editor', lang)}>
			<div class="art" aria-hidden="true">
				<svg class="tool" viewBox="0 0 180 125">
					<rect x="9" y="6" width="162" height="113" rx="10" fill="#fffdf6" />
					<path d="M25 33H155M25 56H155M25 79H155M48 18V105M82 18V105M116 18V105M150 18V105" stroke="#ecede6" />
					<path d="M28 93C62 91 44 26 86 28S130 89 155 37" fill="none" stroke="#bd302d" stroke-width="3" />
					<path d="M48 47 109 9M111 92 162 73" stroke="#d39b91" stroke-width="1.5" />
					<g fill="#fff" stroke="#bd302d" stroke-width="2">
						<circle cx="48" cy="47" r="3" /><circle cx="109" cy="9" r="3" /><circle cx="111" cy="92" r="3" /><circle cx="162" cy="73" r="3" />
						<rect x="81" y="23" width="9" height="9" /><rect x="24" y="88" width="9" height="9" /><rect x="151" y="32" width="9" height="9" />
					</g>
				</svg>
			</div>
			<div class="body">
				<div>
					<h3>{t('generatorDraw', lang)}</h3>
					<p>{t('generatorDrawHint', lang)}</p>
				</div>
				<span class="arrow"><ArrowRightIcon /></span>
			</div>
		</a>
	</div>

	<ol class="steps" aria-label={t('generatorSteps', lang)}>
		{#each steps as step, i (step)}
			<li>
				{#if i}<span class="step-arrow"><ArrowRightIcon /></span>{/if}<i>{i + 1}</i>{t(step, lang)}
			</li>
		{/each}
	</ol>
	<a class="first" href={href('howTo', lang)}>{t('generatorFirstHeart', lang)}</a>
</main>

<style>
	.start {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		padding: 40px max(32px, calc((100% - 1170px) / 2)) 26px;
		background: linear-gradient(var(--cream2), #f0f2e9 440px, var(--page));
	}
	/* The landscape's lower edge, faded behind the cards. Wide windows show
	   less of its height, so its top fades out instead of ending in a line. */
	.land {
		position: absolute;
		left: 0;
		right: 0;
		bottom: -15px;
		height: 210px;
		overflow: hidden;
		opacity: 0.26;
		mask-image: linear-gradient(transparent, #000 65%);
		z-index: -1;
		pointer-events: none;
	}
	.land :global(.land-svg) {
		position: absolute;
		bottom: 0;
		left: 50%;
		width: max(100%, 630px);
		height: auto;
		transform: translateX(-50%);
	}
	.intro {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 32px;
		min-height: 127px;
		margin-bottom: 23px;
	}
	.eyebrow {
		margin: 0;
		font-size: 11px;
		font-weight: 650;
		letter-spacing: 1.7px;
		text-transform: uppercase;
		color: var(--green);
	}
	h1 {
		margin: 12px 0 0;
		font-size: 43px;
		font-weight: 600;
		line-height: 1.1;
		letter-spacing: -1.7px;
		color: var(--deep);
	}
	.lede {
		max-width: 600px;
		margin: 14px 0 0;
		font-size: 16px;
		line-height: 1.6;
		color: var(--muted-on-sky);
	}
	.heart {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.intro-art {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		padding-right: 18px;
	}
	.intro-art .heart {
		width: 94px;
		filter: drop-shadow(1px 6px 5px rgb(var(--deep-rgb) / 0.08));
	}
	.intro-art .heart:nth-child(1) {
		width: 69px;
		margin: 34px -13px 0 0;
		transform: rotate(-14deg);
		--paper-right: #426653;
	}
	.intro-art .heart:nth-child(2) {
		width: 112px;
		transform: rotate(4deg);
	}
	.intro-art .heart:nth-child(3) {
		width: 71px;
		margin: 29px 0 0 -8px;
		transform: rotate(15deg);
		--paper-right: #bc9a53;
	}
	.featured {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
	}
	.choice {
		display: block;
		width: 100%;
		padding: 0;
		overflow: hidden;
		border: 1px solid #d8dfd4;
		border-radius: 17px;
		background: var(--white);
		color: inherit;
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition:
			transform 0.16s,
			box-shadow 0.16s,
			border-color 0.16s;
	}
	.choice:hover {
		transform: translateY(-3px);
		border-color: #8fa78f;
		box-shadow: 0 9px 22px rgb(var(--deep-rgb) / 0.07);
	}
	.art {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		height: 117px;
		background: #f0f1e9;
	}
	.featured .art {
		height: 178px;
		background: #edf0e8;
	}
	.featured .name-card .art {
		background: #f0e8dc;
	}
	.body {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 19px 23px 20px;
	}
	.body h2,
	.body h3 {
		margin: 0 0 7px;
		font-size: 23px;
		font-weight: 600;
		letter-spacing: -0.5px;
		color: var(--deep);
	}
	.body p {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--muted);
	}
	.arrow {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 33px;
		height: 33px;
		border-radius: 50%;
		background: var(--page);
		color: var(--green);
	}
	.arrow :global(svg) {
		width: 18px;
		height: 18px;
	}
	.badge {
		position: absolute;
		top: 15px;
		left: 18px;
		z-index: 1;
		padding: 6px 9px;
		border-radius: 5px;
		background: rgb(255 255 255 / 0.85);
		color: var(--green);
		font-size: 11px;
		font-weight: 600;
	}
	.motifs {
		display: grid;
		grid-template-columns: repeat(3, 45px);
		gap: 12px;
		margin: 24px 40px 0 0;
		transform: rotate(-7deg);
	}
	.motifs span {
		display: grid;
		place-items: center;
		width: 45px;
		height: 45px;
		border-radius: 10px;
		background: #fbfcf7;
		box-shadow: 0 3px 4px rgb(var(--deep-rgb) / 0.03);
		color: var(--green);
	}
	.motifs svg {
		width: 28px;
		height: 28px;
	}
	.art-heart {
		position: relative;
		width: 164px;
		margin-top: 8px;
		filter: drop-shadow(1px 7px 5px rgb(var(--deep-rgb) / 0.09));
	}
	.name-card .art-heart {
		width: 170px;
		margin-left: 28px;
		transform: rotate(9deg);
	}
	.name-slip {
		padding: 15px 20px;
		border: 1px solid #ded6c7;
		border-radius: 8px;
		background: #fffaf1;
		box-shadow: 0 5px 12px rgb(71 52 28 / 0.04);
		color: var(--green);
		font-size: 28px;
		font-weight: 600;
		letter-spacing: 4px;
		transform: rotate(-5deg);
	}
	.name-slip small {
		display: block;
		margin-bottom: 7px;
		color: #776d5d;
		font-size: 10px;
		font-weight: 400;
		letter-spacing: 0.5px;
	}
	.cursor {
		margin-left: 3px;
		border-left: 2px solid #ad9b76;
	}
	.section-line {
		display: flex;
		align-items: center;
		gap: 14px;
		margin: 26px 0 15px;
		font-size: 12px;
		font-weight: 400;
		color: var(--muted);
	}
	.section-line::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--line);
	}
	.others {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
	}
	.other .body {
		align-items: flex-start;
		padding: 16px;
	}
	.other .body h3 {
		margin-bottom: 6px;
		font-size: 17px;
		letter-spacing: -0.2px;
	}
	.other .body p {
		font-size: 12px;
		line-height: 1.55;
	}
	.other .arrow {
		width: 18px;
		height: 22px;
		background: transparent;
	}
	.pair .heart {
		width: 89px;
		margin-right: -19px;
		transform: rotate(-12deg);
		filter: drop-shadow(1px 3px 4px rgb(0 0 0 / 0.07));
	}
	.pair .heart:last-child {
		margin: 13px 0 0;
		transform: rotate(12deg);
		--paper-right: #3d5b48;
	}
	.photo {
		width: 91px;
		height: 91px;
		object-fit: cover;
		border: 5px solid white;
		border-radius: 4px;
		box-shadow: 0 3px 5px rgb(0 0 0 / 0.07);
		transform: rotate(-7deg);
	}
	.flow {
		display: grid;
		margin: 0 8px;
		color: #849680;
	}
	.flow :global(svg) {
		width: 20px;
		height: 20px;
	}
	.picture .heart {
		width: 90px;
		transform: rotate(8deg);
	}
	.tool {
		width: 142px;
		height: 102px;
		filter: drop-shadow(1px 4px 4px rgb(0 0 0 / 0.07));
	}
	.steps {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 11px;
		margin: 31px 0 0;
		padding: 0;
		list-style: none;
		font-size: 12px;
		color: var(--green);
	}
	.steps li {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.steps i {
		display: grid;
		place-items: center;
		width: 21px;
		height: 21px;
		border: 1px solid #9db59f;
		border-radius: 50%;
		font-size: 10px;
		font-style: normal;
	}
	.step-arrow {
		display: grid;
		margin-right: 4px;
		opacity: 0.5;
	}
	.step-arrow :global(svg) {
		width: 14px;
		height: 14px;
	}
	.first {
		display: block;
		width: fit-content;
		margin: 19px auto 0;
		color: var(--muted);
		font-size: 12px;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	@media (prefers-reduced-motion: reduce) {
		.choice {
			transition: none;
		}
		.choice:hover {
			transform: none;
		}
	}
	@media (max-width: 1120px) {
		.start {
			padding-left: 28px;
			padding-right: 28px;
		}
		h1 {
			font-size: 38px;
		}
		.motifs {
			margin-right: 23px;
		}
		.other .body {
			padding: 14px 12px;
		}
	}
	@media (max-width: 900px) {
		.start {
			padding-top: 30px;
		}
		.intro-art {
			display: none;
		}
		.intro {
			min-height: 0;
			margin-bottom: 26px;
		}
		h1 {
			font-size: 37px;
		}
		.others {
			grid-template-columns: 1fr 1fr;
		}
		.featured .art {
			height: 160px;
		}
		.motifs {
			grid-template-columns: repeat(2, 38px);
			gap: 8px;
			margin: 25px 16px 0 0;
		}
		.motifs span {
			width: 38px;
			height: 38px;
		}
		.motifs span:nth-child(n + 5) {
			display: none;
		}
		.art-heart {
			width: 150px;
		}
		.name-slip {
			padding: 13px;
			font-size: 21px;
		}
		.name-card .art-heart {
			width: 145px;
			margin-left: 4px;
		}
		.body {
			padding: 18px;
		}
		.body h2 {
			font-size: 20px;
		}
		.body p {
			font-size: 13px;
		}
	}
	@media (max-width: 600px) {
		.start {
			padding: 28px 16px 24px;
		}
		h1 {
			max-width: 330px;
			font-size: 34px;
			letter-spacing: -1.1px;
		}
		.lede {
			margin-top: 13px;
			font-size: 14px;
			line-height: 1.65;
		}
		/* Both sentences wrap anyway; a forced break would strand a word. */
		.lede br {
			display: none;
		}
		.eyebrow {
			font-size: 10px;
			letter-spacing: 1.4px;
		}
		.featured {
			grid-template-columns: 1fr;
			gap: 14px;
		}
		.featured .art {
			height: 157px;
		}
		.art-heart {
			width: 146px;
		}
		.motifs {
			grid-template-columns: repeat(3, 40px);
			gap: 10px;
			margin: 28px 27px 0 0;
		}
		.motifs span {
			width: 40px;
			height: 40px;
		}
		.motifs span:nth-child(n + 5) {
			display: grid;
		}
		.featured .body {
			padding: 18px 19px;
		}
		.body h2 {
			font-size: 21px;
		}
		.name-slip {
			margin-right: 6px;
			padding: 14px 17px;
			font-size: 26px;
		}
		.name-card .art-heart {
			width: 150px;
			margin-left: 5px;
		}
		.badge {
			top: 12px;
			left: 14px;
			font-size: 10px;
		}
		.others {
			gap: 12px;
		}
		.other .art {
			height: 101px;
		}
		.other .body {
			gap: 5px;
			padding: 14px 12px 15px;
		}
		.other .body h3 {
			font-size: 16px;
		}
		.other .body p {
			font-size: 11px;
		}
		.other .arrow {
			display: none;
		}
		.pair .heart {
			width: 72px;
		}
		.photo {
			width: 68px;
			height: 73px;
			border-width: 3px;
		}
		.picture .heart {
			width: 66px;
		}
		.flow {
			margin: 0 3px;
		}
		.flow :global(svg) {
			width: 14px;
			height: 14px;
		}
		.tool {
			width: 123px;
			height: 86px;
		}
		.steps {
			flex-wrap: wrap;
			gap: 10px;
			margin-top: 25px;
			font-size: 10px;
			line-height: 1.5;
		}
		.steps i {
			width: 18px;
			height: 18px;
		}
		.step-arrow :global(svg) {
			width: 11px;
			height: 11px;
		}
		.first {
			margin-top: 18px;
		}
	}
	@media (max-width: 360px) {
		.motifs {
			grid-template-columns: repeat(3, 32px);
			gap: 8px;
			margin-right: 15px;
		}
		.motifs span {
			width: 32px;
			height: 32px;
		}
		.motifs svg {
			width: 26px;
			height: 26px;
		}
		.art-heart {
			width: 132px;
		}
		.name-card .art-heart {
			width: 124px;
		}
		.name-slip {
			padding: 13px;
			font-size: 22px;
		}
	}
</style>
