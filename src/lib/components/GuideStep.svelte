<!-- The four preparation drawings. The detailed loop diagrams live in GuideWeave. -->
<script lang="ts">
	import { t, type Language } from '$lib/i18n';

	interface Props {
		/** Which preparation step to draw, 1-4. */
		step: number;
		lang: Language;
		class?: string;
	}

	let { step, lang, class: className = undefined }: Props = $props();

	/**
	 * A printed template: the silhouette as the PDF prints it (rounded top,
	 * straight sides), the two strip cuts, and the dashed fold along the bottom.
	 */
	function template(x: number, y: number, w: number, h: number) {
		const r = w / 2;
		return {
			d: `M ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} L ${x + w} ${y + h} L ${x} ${y + h} Z`,
			strips: [1, 2].map((k) => ({ x: x + (w * k) / 3, y1: y + h, y2: y + r + 6 })),
			fold: { x1: x, x2: x + w, y: y + h }
		};
	}

	// Step 1: the sheet coming out of the printer. Steps 2 and 3: the template
	// lying on the folded paper, at two sizes.
	const PRINTED = template(101, 24, 38, 66);
	const ON_FOLD = template(132, 46, 56, 104);
	const CUTTING = template(84, 30, 72, 132);

	// Step 4: the same silhouette, now cut out of the coloured paper.
	const CUT_OUT = template(84, 26, 72, 134).d;

</script>

<svg viewBox="0 0 240 180" class={className} aria-hidden="true" focusable="false">
	{#if step === 1}
		<!-- Print: the template comes out of the printer. -->
		<rect class="printer-body" x="60" y="116" width="120" height="42" rx="8" />
		<rect class="printer-dark" x="75" y="104" width="90" height="14" rx="3" />
		<rect class="sheet" x="84" y="14" width="72" height="96" rx="3" />
		<path class="tmpl" d={PRINTED.d} stroke-width="1.6" />
		{#each PRINTED.strips as strip (strip.x)}
			<line class="tmpl-strip" x1={strip.x} y1={strip.y1} x2={strip.x} y2={strip.y2} />
		{/each}
		<line
			class="tmpl-fold"
			x1={PRINTED.fold.x1}
			y1={PRINTED.fold.y}
			x2={PRINTED.fold.x2}
			y2={PRINTED.fold.y}
		/>
		<rect class="printer-dark" x="70" y="154" width="100" height="6" rx="2" />
	{:else if step === 2}
		<!-- Fold: the coloured paper folded in half, the template's dashed line on the fold. -->
		<rect class="paper" x="18" y="26" width="58" height="124" rx="2" />
		<line class="paper-fold" x1="18" y1="88" x2="76" y2="88" />
		<path class="arrow" d="M86 44 C 110 60, 110 96, 86 116" />
		<path class="arrow" d="m92 106-6 10-11-3" />
		<rect class="paper" x="124" y="34" width="72" height="116" rx="2" />
		<rect class="paper-edge" x="124" y="146" width="72" height="4" rx="2" />
		<path class="tmpl" d={ON_FOLD.d} stroke-width="1.6" fill-opacity="0.92" />
		{#each ON_FOLD.strips as strip (strip.x)}
			<line class="tmpl-strip" x1={strip.x} y1={strip.y1} x2={strip.x} y2={strip.y2} />
		{/each}
		<line
			class="tmpl-fold"
			x1={ON_FOLD.fold.x1}
			y1={ON_FOLD.fold.y}
			x2={ON_FOLD.fold.x2}
			y2={ON_FOLD.fold.y}
		/>
		<text class="label" x="160" y="170">{t('guideLabelFoldLine', lang)}</text>
	{:else if step === 3}
		<!-- Cut the outline, through both layers. -->
		<rect class="paper" x="70" y="22" width="100" height="140" rx="2" />
		<rect class="paper-edge" x="70" y="158" width="100" height="4" rx="2" />
		<path class="tmpl" d={CUTTING.d} stroke-width="1.4" fill-opacity="0.92" />
		{#each CUTTING.strips as strip (strip.x)}
			<line class="tmpl-strip" x1={strip.x} y1={strip.y1} x2={strip.x} y2={strip.y2} />
		{/each}
		<line
			class="tmpl-fold"
			x1={CUTTING.fold.x1}
			y1={CUTTING.fold.y}
			x2={CUTTING.fold.x2}
			y2={CUTTING.fold.y}
		/>
		<path class="cut" d="M 84 66 A 36 36 0 0 1 156 66 L 156 162" />
		<g class="scissors" transform="translate(168 128) rotate(-75) scale(1.4)">
			<circle cx="-6" cy="-6" r="3" />
			<circle cx="-6" cy="6" r="3" />
			<path d="M8-8-3.9 3.9" />
			<path d="M2.5 2.5 8 8" />
			<path d="M-3.9-3.9 0 0" />
		</g>
	{:else if step === 4}
		<!-- Cut the strips up from the fold. -->
		<path class="paper" d={CUT_OUT} />
		<path class="paper-outline" d={CUT_OUT} />
		<line class="strip-cut" x1="108" y1="160" x2="108" y2="70" />
		<line class="strip-cut" x1="132" y1="160" x2="132" y2="70" />
		<line class="fold-edge" x1="84" y1="160" x2="156" y2="160" />
		<g class="scissors" transform="translate(132 170) rotate(-90) scale(1.4)">
			<circle cx="-6" cy="-6" r="3" />
			<circle cx="-6" cy="6" r="3" />
			<path d="M8-8-3.9 3.9" />
			<path d="M2.5 2.5 8 8" />
			<path d="M-3.9-3.9 0 0" />
		</g>
		<path class="arrow" d="M192 150 V 84" />
		<path class="arrow" d="m186 92 6-8 6 8" />
		<text class="label" x="192" y="72">{t('guideLabelFromFold', lang)}</text>
	{/if}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	/* Step 1 — the printer and the sheet it prints. */
	.printer-body {
		fill: var(--sage-dark);
	}

	.printer-dark {
		fill: var(--deep);
	}

	.sheet {
		fill: var(--white);
		stroke: var(--line);
	}

	/* The printed template: white silhouette, green cut lines, dashed fold. */
	.tmpl {
		fill: var(--white);
		stroke: var(--green);
	}

	.tmpl-strip {
		stroke: var(--green);
		stroke-width: 1.4;
		stroke-linecap: round;
	}

	.tmpl-fold {
		stroke: var(--green);
		stroke-width: 1.6;
		stroke-dasharray: 4 3;
	}

	/* The coloured paper; --red-dark is the shaded fold edge. */
	.paper {
		fill: var(--red);
	}

	.paper-edge {
		fill: var(--red-dark);
	}

	.paper-outline {
		fill: none;
		stroke: var(--red-dark);
		stroke-width: 1.5;
	}

	.paper-fold,
	.fold-edge {
		stroke: var(--white);
		stroke-dasharray: 4 3;
		opacity: 0.9;
	}

	.paper-fold {
		stroke-width: 1.4;
	}

	.fold-edge {
		stroke-width: 1.6;
	}

	/* Step 3 — the line the scissors follow. */
	.cut {
		fill: none;
		stroke: var(--red);
		stroke-width: 3;
		stroke-linecap: round;
	}

	/* Step 4 — the strips cut up from the fold. */
	.strip-cut {
		stroke: var(--white);
		stroke-width: 3;
		stroke-linecap: round;
	}

	.scissors {
		fill: none;
		stroke: var(--deep);
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.arrow {
		fill: none;
		stroke: var(--red);
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* Labels are repeated in the adjacent preparation instructions. */
	.label {
		fill: var(--muted);
		font-family: inherit;
		font-size: 10.5px;
		text-anchor: middle;
	}

</style>
