<script lang="ts">
	/**
	 * The mathematics behind the cuts, the second half of the About page's
	 * section on how a motif becomes a weave: that every picture can be woven
	 * once shared cuts are allowed (in three drawings of the argument), that
	 * finding the fewest is hard (a network of roads made into a heart), and
	 * how many the pictures of the smallest heart need. The full argument is
	 * in docs/weaving-paper.
	 */
	import { t, type Language } from '$lib/i18n';
	import { PICTURES_BY_SHARED_CUTS, SIMPLEST_PICTURES } from '$lib/about/sharedCutPictures';
	let { lang }: { lang: Language } = $props();

	const steps = ['aboutMathsStep1', 'aboutMathsStep2', 'aboutMathsStep3'] as const;
	const hard = ['aboutMathsHard1', 'aboutMathsHard2', 'aboutMathsHard3'] as const;
	const total = PICTURES_BY_SHARED_CUTS.reduce((sum, n) => sum + n, 0);
	// The numbers from four shared cuts on, which have no drawings here.
	const rest = PICTURES_BY_SHARED_CUTS.slice(SIMPLEST_PICTURES.length)
		.map((count, i) => t('aboutMathsCountMore', lang, { count, cuts: i + SIMPLEST_PICTURES.length }));

	// The island's circle: its left point, where one shared cut ends, and its
	// lowest, where the other does.
	const island = { x: 73, y: 27, r: 14 };
	const long = `M${island.x - island.r},${island.y}A${island.r},${island.r} 0 1 1 ${island.x},${island.y + island.r}`;
	const short = `M${island.x - island.r},${island.y}A${island.r},${island.r} 0 0 0 ${island.x},${island.y + island.r}`;

	// The simplest network with three roads at each point has four points. It
	// is drawn the way its picture lies in the heart: x at the top, y at the
	// bottom, w and z at the sides, the road x–y round the outside.
	const point = { x: [42, 12], y: [42, 78], w: [15, 45], z: [69, 45] } as const;
	const at = (p: readonly [number, number]) => p.join(',');
	const road = (from: keyof typeof point, to: keyof typeof point) => `M${at(point[from])}L${at(point[to])}`;
	const outside = `M${at(point.x)}C105,0 105,90 ${at(point.y)}`;
	// The round trip x, y, z, w leaves out the roads x–z and w–y.
	const left = [road('x', 'z'), road('w', 'y')];
	const trip = [outside, road('y', 'z'), road('z', 'w'), road('w', 'x')];

	// Its picture on the weave's square: each point is a field, and two fields
	// touch at the middle of the road between their points. The road x–y is
	// the one opened out to the square's sides, so the fields of x and y hold
	// two opposite corners. The other five touchings are the centre and the
	// corners of a diamond, NEAR and FAR from the square's first corner.
	const NEAR = 13, FAR = 100 - NEAR;
	const fields = [
		`M0,0H50V${NEAR}L${NEAR},50H0Z`,
		`M100,100H50V${FAR}L${FAR},50H100Z`,
		`M50,${NEAR}L${FAR},50H50Z`,
		`M${NEAR},50L50,${FAR}V50Z`
	];
	// At the middle of a road the trip leaves out, one field's two sides go to
	// one sheet and the other field's two to the other; each field's third
	// side goes to the sheet that did not get its other two. Each sheet's cut
	// is then one line across the square, through every touching.
	const across = `M0,50H${NEAR}L50,${FAR}V${NEAR}L${FAR},50H100`;
	const down = `M50,0V${NEAR}L${NEAR},50H${FAR}L50,${FAR}V100`;
	// The heart: two sheets, each a square with a round end, woven where the
	// squares overlap. Drawn on a 400 by 350 canvas, the weave 100 units wide.
	const HEART = 'translate(100 80) rotate(45 100 100) scale(2)';
	const sheets = ['M0,0A50,50 0 0 0 0,100H100V0Z', 'M0,0A50,50 0 0 1 100,0V100H0Z'];
</script>

<div class="maths">
	<h3>{t('aboutMathsTitle', lang)}</h3>
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
	<p>{t('aboutMathsEveryRule', lang)}</p>

	<h3>{t('aboutMathsHardTitle', lang)}</h3>
	<p>{t('aboutMathsHardText', lang)}</p>
	<ol class="steps">
		{#each hard as step, i (step)}
			<li>
				{#if i === 0}
					<svg viewBox="0 0 100 87.5" role="img" aria-label={t(step, lang)}>
						{#each left as d (d)}<path {d} class="road" />{/each}
						{#each trip as d (d)}<path {d} class="road trip" />{/each}
						{#each Object.values(point) as p (at(p))}
							<circle cx={p[0]} cy={p[1]} r="4.2" class="colour" />
						{/each}
					</svg>
				{:else}
					<svg viewBox="0 0 400 350" role="img" aria-label={t(step, lang)}>
						<g transform={HEART}>
							{#if i === 1}
								<path d={sheets[0]} class="paper edge" />
								<path d={sheets[1]} class="colour" />
								<rect width="100" height="100" class="paper" />
								{#each fields as d (d)}<path {d} class="colour" />{/each}
							{:else}
								{#each sheets as d (d)}<path {d} class="paper edge" />{/each}
								{#each fields as d (d)}<path {d} class="colour soft" />{/each}
								<path d={across} class="a" />
								<path d={down} class="b" />
							{/if}
						</g>
					</svg>
				{/if}
				<p><span class="number">{i + 1}</span>{t(step, lang)}</p>
			</li>
		{/each}
	</ol>

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
</div>

<style>
	h3 {
		font-size: 17px;
		line-height: 1.4;
		margin: 30px 0 8px;
		color: #375033;
	}
	.maths > p {
		font-size: 14px;
		line-height: 1.8;
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
		stroke-width: 2.4;
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
	.road {
		fill: none;
		stroke: #b9c2b0;
		stroke-width: 1.6;
	}
	.road.trip {
		stroke: #294033;
		stroke-width: 3;
		stroke-linecap: round;
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
		.counts li {
			grid-template-columns: 1fr;
			gap: 6px;
		}
	}
</style>
