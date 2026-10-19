<script lang="ts">
	import { base } from '$app/paths';
	import { t, type Language } from '$lib/i18n';
	import { href } from '$lib/i18n/routes';
	let { lang }: { lang: Language } = $props();
	const examples = [
		['star', 'aboutTopologyStar', 'aboutTopologyStarText'],
		['ring', 'aboutTopologyRing', 'aboutTopologyRingText'],
		['islands', 'aboutTopologyIslands', 'aboutTopologyIslandsText']
	] as const;
</script>

<section class="topology" aria-labelledby="topology-heading">
	<h2 id="topology-heading">{t('aboutTopologyTitle', lang)}</h2>
	<p>{t('aboutTopologyIntro', lang)}</p>
	<div class="examples">
		{#each examples as [id, title, description] (id)}
			<figure>
				<div class="diagrams">
					<img
						src={`${base}/about/topology/${id}.svg`}
						alt={t(title, lang)}
						width="400"
						height="350"
						loading="lazy"
					/><img
						src={`${base}/about/topology/${id}-cuts.svg`}
						alt={t('aboutTopologyDiagramAlt', lang)}
						width="400"
						height="400"
						loading="lazy"
					/>
				</div>
				<figcaption>
					<h3>{t(title, lang)}</h3>
					<p>{t(description, lang)}</p>
				</figcaption>
			</figure>
		{/each}
	</div>
	<p class="legend">{t('aboutTopologyLegend', lang)}</p>
	<p class="caution">{t('aboutTopologyCaution', lang)}</p>
	<a class="btn btn-outline" href={href('generator', lang)}
		>{t('aboutTopologyTry', lang)} →</a
	>
</section>

<style>
	.topology {
		margin: 34px 0;
		padding: 28px 0;
		border-top: 1px solid var(--line, #dce3d5);
		border-bottom: 1px solid var(--line, #dce3d5);
	}
	h2 {
		font-size: 25px;
		line-height: 1.25;
		margin: 0 0 14px;
		color: var(--ink, #294033);
	}
	.topology > p {
		font-size: 14px;
		line-height: 1.8;
	}
	.examples {
		display: grid;
		gap: 18px;
		margin: 24px 0;
	}
	figure {
		margin: 0;
		padding: 18px;
		border: 1px solid #dce3d5;
		border-radius: 16px;
		background: #fffefa;
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 19px;
		align-items: center;
	}
	.diagrams {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.diagrams img {
		width: 50%;
		height: auto;
		min-width: 0;
	}
	h3 {
		font-size: 16px;
		line-height: 1.4;
		margin: 0 0 8px;
		color: #375033;
	}
	figcaption p {
		font-size: 12px;
		line-height: 1.7;
		margin: 0;
		color: #67745c;
	}
	.topology > .legend {
		font-size: 11px;
		color: #637659;
	}
	.topology > .caution {
		font-size: 12px;
		color: #7c8572;
	}
	.btn {
		font-size: 12px;
		margin-top: 8px;
	}
	@media (max-width: 650px) {
		figure {
			grid-template-columns: 1fr;
			gap: 12px;
		}
		.diagrams {
			max-width: 340px;
			margin: auto;
		}
		.diagrams img {
			max-width: 160px;
		}
	}
</style>
