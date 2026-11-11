<!-- One of the guide's pen drawings: the shapes come from $lib/guide/drawings, the colours from the page. -->
<script lang="ts">
	import type { Drawing } from '$lib/guide/sketch';
	import { t, type Language, type TranslationKey } from '$lib/i18n';

	interface Props {
		drawing: Drawing;
		lang?: Language;
		class?: string;
	}

	let { drawing, lang = 'da', class: className = undefined }: Props = $props();
</script>

<svg
	class={className}
	viewBox="0 0 {drawing.width} {drawing.height}"
	style:--pen="{(drawing.width / 190).toFixed(2)}px"
	aria-hidden="true"
	focusable="false"
>
	{#each drawing.shapes as shape, i (i)}
		<path class="fill-{shape.fill} line-{shape.line}" d={shape.d} />
	{/each}
	{#each drawing.labels as label, i (i)}
		<text class={label.tone} x={label.x} y={label.y} text-anchor={label.anchor}>
			{label.key ? t(label.text as TranslationKey, lang) : label.text}
		</text>
	{/each}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
	path {
		fill: none;
		fill-rule: evenodd;
		stroke: var(--deep);
		stroke-width: var(--pen);
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.fill-red { fill: var(--red); }
	.fill-red-shade { fill: var(--red-dark); }
	.fill-white { fill: var(--white); }
	.fill-white-shade { fill: #d9e0d6; }
	.fill-sheer { fill: rgb(255 255 255 / 0.84); }
	.fill-steel { fill: #d3dcd5; }
	.fill-handle { fill: var(--gold); }
	.fill-dark { fill: var(--deep); }
	.fill-shade { fill: rgb(var(--deep-rgb) / 0.13); }
	.line-none { stroke: none; }
	.line-thin { stroke-width: calc(var(--pen) * 0.7); }
	.line-cut { stroke-width: calc(var(--pen) * 1.9); }
	.line-dash { stroke-dasharray: calc(var(--pen) * 3.2) calc(var(--pen) * 2.6); }
	.line-print, .line-print-dash {
		stroke: var(--sage-dark);
		stroke-width: calc(var(--pen) * 0.8);
	}
	.line-print-dash { stroke-dasharray: calc(var(--pen) * 3.2) calc(var(--pen) * 2.6); }
	text {
		font-family: inherit;
		font-size: calc(var(--pen) * 8.3);
		fill: var(--deep);
	}
	.strong, .button { font-weight: 700; }
	.light { fill: var(--white); }
	.note { fill: var(--muted); }
</style>
