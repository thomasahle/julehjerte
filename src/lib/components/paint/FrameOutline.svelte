<!--
  The protected motif's outline, drawn over a found heart (PAINT.md §11).

  "Vis det beskyttede motiv": with a free band the search filled part of the
  square itself, and the visitor has to be able to see where their own picture
  ended and the machine's weave began — otherwise the difference in the motif is
  a number with nothing on screen to point at.

  A separate `<svg>` laid over `PaperHeartSVG` rather than a layer inside it: the
  heart component is shared with the gallery, the front page and the editor, and
  a paint-mode overlay has no business in any of them. The two agree because they
  are given the same viewBox and the same quarter turn about the same centre —
  both computed here from the design's own overlap rectangle, which is exactly
  what the heart computes from.
-->
<script lang="ts">
	import { computeHeartViewBoxFromOverlap } from '$lib/rendering/heartSvg';
	import { inferOverlapRect } from '$lib/utils/overlapRect';
	import { shapeOutline, type Frame } from '$lib/paint/frame';
	import type { HeartDesign } from '$lib/types/heart';

	interface Props {
		design: HeartDesign;
		frame: Frame;
		/** The same pixel size the heart under it was rendered at. */
		size: number;
	}

	let { design, frame, size }: Props = $props();

	let overlap = $derived(inferOverlapRect(design.fingers, design.gridSize));
	let view = $derived(computeHeartViewBoxFromOverlap(overlap, { paddingRatio: 0.021, square: true }));
	let centre = $derived({
		x: overlap.left + overlap.width / 2,
		y: overlap.top + overlap.height / 2
	});

	/** The outline in the heart's own pixel frame: the woven square is the overlap rect. */
	let outline = $derived(shapeOutline(frame.shape, frame.size));
	let path = $derived.by(() => {
		const toX = (u: number) => overlap.left + u * overlap.width;
		const toY = (v: number) => overlap.top + v * overlap.height;
		if (outline.kind === 'circle') {
			// The overlap rect is square for our hearts only when the grid is, so the
			// circle is written as an ellipse and stays the shape the mask marked.
			const rx = outline.r * overlap.width;
			const ry = outline.r * overlap.height;
			const cx = toX(outline.cx);
			const cy = toY(outline.cy);
			return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
		}
		return `${outline.points
			.map((p, i) => `${i ? 'L' : 'M'} ${toX(p.x)} ${toY(p.y)}`)
			.join(' ')} Z`;
	});

	/** The dashes are in the heart's units, so they read the same at any size. */
	let stroke = $derived(Math.max(1.5, overlap.width / 80));
</script>

<svg
	class="frame-outline"
	viewBox={view.viewBox}
	width={size}
	height={size}
	preserveAspectRatio="xMidYMid meet"
	aria-hidden="true"
	focusable="false"
	xmlns="http://www.w3.org/2000/svg"
>
	<g transform="rotate(45, {centre.x}, {centre.y})">
		<!-- Two strokes: a pale one under a dark dashed one, so the outline reads on
		     the white paper and on the red alike. -->
		<path d={path} fill="none" stroke="var(--white)" stroke-width={stroke * 2.2} opacity="0.7" />
		<path
			d={path}
			fill="none"
			stroke="var(--green)"
			stroke-width={stroke}
			stroke-dasharray="{stroke * 3} {stroke * 2}"
		/>
	</g>
</svg>

<style>
	.frame-outline {
		position: absolute;
		inset: 0;
		margin: auto;
		/* Purely a picture over a picture: never in the way of the pointer. */
		pointer-events: none;
		overflow: visible;
	}
</style>
