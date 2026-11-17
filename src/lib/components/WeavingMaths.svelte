<script lang="ts">
	/**
	 * The mathematics behind the cuts, at the end of the About page: that
	 * every picture can be woven once shared cuts are allowed (in three
	 * drawings of the argument), that finding the fewest is hard (the drawing
	 * of the reduction from round trips in a network), and how many the
	 * pictures of the smallest heart need. The full argument is in
	 * docs/weaving-paper.
	 */
	import { t, type Language } from '$lib/i18n';
	import { PICTURES_BY_SHARED_CUTS, SIMPLEST_PICTURES } from '$lib/about/sharedCutPictures';
	let { lang }: { lang: Language } = $props();

	const steps = ['aboutMathsStep1', 'aboutMathsStep2', 'aboutMathsStep3'] as const;
	const total = PICTURES_BY_SHARED_CUTS.reduce((sum, n) => sum + n, 0);
	// The numbers from four shared cuts on, which have no drawings here.
	const rest = PICTURES_BY_SHARED_CUTS.slice(SIMPLEST_PICTURES.length)
		.map((count, i) => t('aboutMathsCountMore', lang, { count, cuts: i + SIMPLEST_PICTURES.length }));

	// The island's circle: its left point, where one shared cut ends, and its
	// lowest, where the other does.
	const island = { x: 73, y: 27, r: 14 };
	const long = `M${island.x - island.r},${island.y}A${island.r},${island.r} 0 1 1 ${island.x},${island.y + island.r}`;
	const short = `M${island.x - island.r},${island.y}A${island.r},${island.r} 0 0 0 ${island.x},${island.y + island.r}`;

	// A network of four points, three roads at each: three at the corners of a
	// triangle and one in its middle. Each point's triangle has the midpoints
	// of its three roads as corners; a corner point's triangle reaches round
	// the outside of its point, so its far side is drawn as a curve there.
	const point = { x: [14, 74], y: [86, 74], z: [50, 12], w: [50, 53.3] } as const;
	const at = (p: readonly [number, number]) => p.join(',');
	const between = (a: readonly [number, number], b: readonly [number, number]) => at([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
	const mid = {
		xy: between(point.x, point.y), yz: between(point.y, point.z), zx: between(point.z, point.x),
		wx: between(point.w, point.x), wy: between(point.w, point.y), wz: between(point.w, point.z)
	};
	// The curves round the outside of x, y and z.
	const round = { x: '-23,101.5', y: '123,101.5', z: '50,-35' };
	const roads = [['x', 'y'], ['y', 'z'], ['z', 'x'], ['w', 'x'], ['w', 'y'], ['w', 'z']] as const;
	const trip = [point.x, point.y, point.z, point.w].map(at).join(' ');
	const triangles = [
		`M${mid.zx}Q${round.x} ${mid.xy}L${mid.wx}Z`,
		`M${mid.xy}Q${round.y} ${mid.yz}L${mid.wy}Z`,
		`M${mid.yz}Q${round.z} ${mid.zx}L${mid.wz}Z`,
		`M${mid.wx}L${mid.wy}L${mid.wz}Z`
	];
	// The round trip x, y, z, w leaves out the roads x–z and w–y. At the middle
	// of each, one triangle's two sides there go to one sheet and the other
	// triangle's two to the other; each triangle's third side goes to the
	// sheet that did not get its other two. Each sheet's cut is then one
	// closed curve through all six midpoints.
	const sheetA = `M${mid.xy}Q${round.x} ${mid.zx}L${mid.wx}L${mid.wy}L${mid.wz}L${mid.yz}Q${round.y} ${mid.xy}Z`;
	const sheetB = `M${mid.yz}Q${round.z} ${mid.zx}L${mid.wz}L${mid.wx}L${mid.xy}L${mid.wy}Z`;
</script>

<section class="maths" aria-labelledby="maths-heading">
	<h2 id="maths-heading">{t('aboutMathsTitle', lang)}</h2>
	<p>{t('aboutMathsIntro', lang)}</p>

	<h3>{t('aboutMathsEveryTitle', lang)}</h3>
	<p>{t('aboutMathsEveryText', lang)}</p>
	<ol class="steps">
		{#each steps as step, i (step)}
			<li>
				<svg viewBox="-3 -3 106 106" role="img" aria-label={t(step, lang)}>
					{#if i === 0}
						<rect width="100" height="100" class="paper" />
						<path d="M0,0H50V50H0ZM50,50H100V100H50Z" class="colour" />
						<circle cx={island.x} cy={island.y} r={island.r} class="colour" />
						<rect width="100" height="100" class="edge" />
					{:else if i === 1}
						<rect width="100" height="100" class="paper edge" />
						<path d="M50,0V100" class="a" />
						<path d="M0,50H100" class="b" />
						<circle cx={island.x} cy={island.y} r={island.r} class="b loop" />
					{:else}
						<rect width="100" height="100" class="paper edge" />
						<path d="M50,0V{island.y}" class="a" />
						<path d={long} class="a" />
						<path d="M{island.x},50H50V100" class="a" />
						<path d="M0,50H50V{island.y}" class="b" />
						<path d={short} class="b" />
						<path d="M{island.x},50H100" class="b" />
						<path d="M50,{island.y}H{island.x - island.r}M{island.x},{island.y + island.r}V50" class="shared" />
					{/if}
				</svg>
				<p><span class="number">{i + 1}</span>{t(step, lang)}</p>
			</li>
		{/each}
	</ol>
	<p class="legend">{t('aboutTopologyLegend', lang)}</p>
	<p>{t('aboutMathsEveryRule', lang)}</p>

	<h3>{t('aboutMathsHardTitle', lang)}</h3>
	<p>{t('aboutMathsHardText', lang)}</p>
	<figure class="network">
		<div class="pair">
			<svg viewBox="0 0 100 86" role="img" aria-label={t('aboutMathsNetworkAlt', lang)}>
				{#each roads as [from, to] (from + to)}
					<path d="M{at(point[from])}L{at(point[to])}" class="road" />
				{/each}
				<polygon points={trip} class="trip" />
				{#each Object.values(point) as p (at(p))}
					<circle cx={p[0]} cy={p[1]} r="2.4" class="dot" />
				{/each}
			</svg>
			<svg viewBox="0 0 100 86" role="img" aria-label={t('aboutMathsTrianglesAlt', lang)}>
				{#each triangles as triangle (triangle)}
					<path d={triangle} class="colour soft" />
				{/each}
				<path d={sheetA} class="a" />
				<path d={sheetB} class="b" />
			</svg>
		</div>
		<figcaption>{t('aboutMathsHardCaption', lang)}</figcaption>
	</figure>

	<h3>{t('aboutMathsCountTitle', lang)}</h3>
	<p>{t('aboutMathsCountText', lang, { total })}</p>
	<ul class="counts">
		{#each SIMPLEST_PICTURES as pictures, cuts (cuts)}
			<li>
				<p>
					<strong>{t(cuts === 0 ? 'aboutMathsCutsNone' : cuts === 1 ? 'aboutMathsCutsOne' : 'aboutMathsCuts', lang, { cuts })}</strong>
					{t('aboutMathsPictures', lang, { count: PICTURES_BY_SHARED_CUTS[cuts] })}
				</p>
				<div class="pictures">
					{#each pictures as picture (picture)}
						<svg viewBox="-2 -2 124 124" aria-hidden="true">
							<rect width="120" height="120" class="paper" />
							<path d={picture} class="colour" fill-rule="evenodd" />
							<rect width="120" height="120" class="edge" />
						</svg>
					{/each}
				</div>
			</li>
		{/each}
	</ul>
	<p>{t('aboutMathsCountRest', lang, { list: rest.join(', ') })}</p>
</section>

<style>
	.maths {
		margin: 34px 0;
		padding-bottom: 28px;
		border-bottom: 1px solid var(--line, #dce3d5);
	}
	h2 {
		font-size: 25px;
		line-height: 1.25;
		margin: 0 0 14px;
		color: var(--ink, #294033);
	}
	h3 {
		font-size: 17px;
		line-height: 1.4;
		margin: 28px 0 8px;
		color: #375033;
	}
	.maths > p {
		font-size: 14px;
		line-height: 1.8;
	}
	.maths > .legend {
		font-size: 11px;
		color: #637659;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.paper {
		fill: #fffdf6;
	}
	.edge {
		fill: none;
		stroke: #b7c6b7;
		stroke-width: 0.6;
	}
	.paper.edge {
		fill: #fffdf6;
	}
	.colour {
		fill: #b82535;
	}
	.colour.soft {
		fill: #f3d9d2;
	}
	.a,
	.b,
	.shared {
		fill: none;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.a {
		stroke: #326ab3;
	}
	.b {
		stroke: #26734f;
	}
	.b.loop {
		stroke-dasharray: 3 3;
	}
	.shared {
		stroke: #b96813;
	}
	.steps {
		list-style: none;
		margin: 18px 0 10px;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}
	.steps li {
		padding: 14px;
		border: 1px solid #dce3d5;
		border-radius: 16px;
		background: #fffefa;
	}
	.steps p {
		font-size: 12px;
		line-height: 1.7;
		margin: 10px 0 0;
		color: #67745c;
	}
	.number {
		display: inline-block;
		width: 1.6em;
		height: 1.6em;
		margin-right: 0.5em;
		border-radius: 50%;
		background: #e7eede;
		color: #375033;
		font-weight: 700;
		text-align: center;
	}
	.network {
		margin: 18px 0;
		padding: 18px;
		border: 1px solid #dce3d5;
		border-radius: 16px;
		background: #fffefa;
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 19px;
		align-items: center;
	}
	.pair {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.pair svg {
		width: 50%;
		min-width: 0;
	}
	.road {
		fill: none;
		stroke: #b9c2b0;
		stroke-width: 1.6;
	}
	.trip {
		fill: none;
		stroke: #294033;
		stroke-width: 3;
		stroke-linejoin: round;
	}
	.dot {
		fill: #294033;
	}
	figcaption {
		font-size: 12px;
		line-height: 1.7;
		color: #67745c;
	}
	.counts {
		list-style: none;
		margin: 16px 0;
		padding: 0;
		display: grid;
		gap: 12px;
	}
	.counts li {
		display: grid;
		grid-template-columns: 11em 1fr;
		gap: 14px;
		align-items: center;
	}
	.counts p {
		font-size: 12px;
		line-height: 1.6;
		margin: 0;
		color: #67745c;
	}
	.counts strong {
		display: block;
		font-size: 14px;
		color: #375033;
	}
	.pictures {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 64px));
		gap: 8px;
	}
	@media (max-width: 650px) {
		.steps {
			grid-template-columns: 1fr;
		}
		.steps li {
			display: grid;
			grid-template-columns: 110px 1fr;
			gap: 14px;
			align-items: center;
		}
		.steps p {
			margin: 0;
		}
		.network {
			grid-template-columns: 1fr;
			gap: 12px;
		}
		.counts li {
			grid-template-columns: 1fr;
			gap: 6px;
		}
	}
</style>
