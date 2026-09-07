<script lang="ts">
	import { onMount } from 'svelte';
	import type { Finger, GridSize } from '$lib/types/heart';
	import {
		DEFAULT_COLORS,
		getColors,
		subscribeColors,
		type HeartColors
	} from '$lib/stores/colors';
	import { computeWeaveData } from '$lib/rendering/svgWeave';
	import { BASE_CANVAS_SIZE, BASE_CENTER, MIN_GRID_SIZE, MAX_GRID_SIZE } from '$lib/constants';
	import { clampInt } from '$lib/utils/math';
	import { computeHeartViewBoxFromOverlap } from '$lib/rendering/heartSvg';

	// Props - same interface as PaperHeart.svelte
	interface Props {
		readonly?: boolean;
		idPrefix?: string;
		initialFingers?: Finger[];
		initialGridSize?: GridSize | number;
		initialWeaveParity?: 0 | 1 | number;
		size?: number;
		/**
		 * The heart's own colours (`HeartDesign.colors`), when it has any. Without
		 * them the heart follows the site-wide colour store, as gallery hearts do.
		 */
		colors?: HeartColors;
	}

	let {
		readonly = false,
		idPrefix = undefined,
		initialFingers = undefined,
		initialGridSize = 3,
		initialWeaveParity = 0,
		size = 800,
		colors = undefined
	}: Props = $props();

	// Stable ID for clip paths (avoid Math.random which breaks SSR/hydration).
	const componentId = $derived.by(() => (idPrefix && idPrefix.length > 0 ? idPrefix : 'paper-heart'));

	// The site-wide pair, and what this heart actually paints with.
	let storeColors = $state<HeartColors>({ ...DEFAULT_COLORS });
	let heartColors = $derived(colors ?? storeColors);

	function normalizeGridSize(raw: GridSize | number): GridSize {
		if (typeof raw === 'number' && Number.isFinite(raw)) {
			const n = clampInt(raw, MIN_GRID_SIZE, MAX_GRID_SIZE);
			return { x: n, y: n };
		}
		const x = (raw as GridSize)?.x;
		const y = (raw as GridSize)?.y;
		if (typeof x === 'number' && typeof y === 'number') {
			return {
				x: clampInt(x, MIN_GRID_SIZE, MAX_GRID_SIZE),
				y: clampInt(y, MIN_GRID_SIZE, MAX_GRID_SIZE)
			};
		}
		return { x: 3, y: 3 };
	}

	function normalizeWeaveParity(raw: unknown): 0 | 1 {
		const v = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 0;
		return v % 2 === 1 ? 1 : 0;
	}

	// Geometry props are large; keep them out of deeply reactive `$state` proxies.
	let gridSize = $derived(normalizeGridSize(initialGridSize));
	let weaveParity = $derived<0 | 1>(normalizeWeaveParity(initialWeaveParity));
	let fingers = $derived<Finger[]>(initialFingers ?? []);

	// Computed weave data
	let weaveData = $derived.by(() => {
		if (!fingers.length) return null;
		return computeWeaveData(fingers, gridSize, weaveParity);
	});

	// Calculate overlap center (for rotation)
	let overlapCenter = $derived.by(() => {
		if (!weaveData) return { x: BASE_CENTER, y: BASE_CENTER };
		return {
			x: weaveData.overlap.left + weaveData.overlap.width / 2,
			y: weaveData.overlap.top + weaveData.overlap.height / 2
		};
	});

	// The rotation transform (applied to the group)
	let rotationTransform = $derived(`rotate(45, ${overlapCenter.x}, ${overlapCenter.y})`);

	// Calculate viewBox based on measured bounds (with fallback)
	let heartTransform = $derived.by(() => {
		if (!weaveData) return { viewBox: `0 0 ${BASE_CANVAS_SIZE} ${BASE_CANVAS_SIZE}`, transform: '' };

		const { viewBox } = computeHeartViewBoxFromOverlap(weaveData.overlap, { paddingRatio: 0.021, square: true });
		return { viewBox, transform: rotationTransform };
	});

	onMount(() => {
		// Initialize colors from store and subscribe to changes
		storeColors = getColors();
		const unsubscribe = subscribeColors((c) => {
			storeColors = c;
		});

		return () => {
			unsubscribe();
		};
	});

	// Calculate display size - for readonly mode, use CSS scaling
	let displayWidth = $derived(size);
	let displayHeight = $derived(size);
</script>

<!--
	A read-only heart is decorative: the card's select button, its "Detaljer" link
	and the visible name all carry the heart's name, so the graphic itself would
	only add an unnamed `img` node to the accessibility tree (38 of them on the
	front page). The editor's interactive instance keeps its own semantics.
-->
<svg
	viewBox={heartTransform.viewBox}
	width={displayWidth}
	height={displayHeight}
	preserveAspectRatio="xMidYMid meet"
	class="paper-heart-svg"
	class:readonly
	xmlns="http://www.w3.org/2000/svg"
	style="overflow: visible"
	aria-hidden={readonly ? 'true' : undefined}
	focusable={readonly ? 'false' : undefined}
>
	{#if weaveData}
		<g transform={heartTransform.transform}>
			<defs>
				<!-- Clip path for the overlap rectangle (used for weave pattern) -->
				<clipPath id="overlap-{componentId}">
					<rect
						x={weaveData.overlap.left}
						y={weaveData.overlap.top}
						width={weaveData.overlap.width}
						height={weaveData.overlap.height}
					/>
				</clipPath>
			</defs>

			<!-- Layer 1: Left lobe (direct path fill, no clip-path needed) -->
			<path d={weaveData.leftLobeClip} fill={heartColors.left} />

			<!-- Layer 2: Right lobe (direct path fill, no clip-path needed) -->
			<path d={weaveData.rightLobeClip} fill={heartColors.right} />

			<!-- Layer 3: Weave pattern in overlap region -->
			<!-- Paint left color base, then overlay strips with evenodd for checkerboard effect -->
			<g clip-path="url(#overlap-{componentId})">
				<rect
					x={weaveData.overlap.left}
					y={weaveData.overlap.top}
					width={weaveData.overlap.width}
					height={weaveData.overlap.height}
					fill={heartColors.left}
				/>
				<path
					d={[
						...weaveData.rightOnTopStrips.map(s => s.pathData),
						...weaveData.leftOnTopStrips.map(s => s.pathData)
					].join(' ')}
					fill={heartColors.right}
					fill-rule="evenodd"
				/>
			</g>
		</g>
	{:else}
		<!-- Fallback: simple colored rectangle when no data -->
		<rect
			x={BASE_CANVAS_SIZE / 4}
			y={BASE_CANVAS_SIZE / 4}
			width={BASE_CANVAS_SIZE / 2}
			height={BASE_CANVAS_SIZE / 2}
			fill={heartColors.left}
			opacity="0.3"
		/>
	{/if}
</svg>

<style>
	.paper-heart-svg {
		display: block;
		max-width: 100%;
		height: auto;
	}

	.paper-heart-svg.readonly {
		pointer-events: none;
	}
</style>
