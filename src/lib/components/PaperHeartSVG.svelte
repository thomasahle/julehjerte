<script lang="ts">
	import { onMount } from 'svelte';
	import type { Finger, GridSize } from '$lib/types/heart';
	import {
		getColors,
		subscribeColors,
		type HeartColors
	} from '$lib/stores/colors';
	import {
		computeWeaveData,
		type WeaveData
	} from '$lib/rendering/svgWeave';
	import { BASE_CANVAS_SIZE, BASE_CENTER, MIN_GRID_SIZE, MAX_GRID_SIZE } from '$lib/constants';
	import { clampInt } from '$lib/utils/math';
	import { computeHeartViewBoxFromOverlap } from '$lib/rendering/heartSvg';

	// Props - same interface as PaperHeart.svelte
	interface Props {
		readonly?: boolean;
		initialFingers?: Finger[];
		initialGridSize?: GridSize | number;
		initialWeaveParity?: 0 | 1 | number;
		size?: number;
		onFingersChange?: (
			fingers: Finger[],
			gridSize: GridSize,
			weaveParity: 0 | 1
		) => void;
	}

	let {
		readonly = false,
		initialFingers = undefined,
		initialGridSize = 3,
		initialWeaveParity = 0,
		size = 800,
		onFingersChange = undefined
	}: Props = $props();

	// Generate unique ID for clip paths
	const componentId = Math.random().toString(36).slice(2, 9);

	// Colors from store
	let heartColors = $state<HeartColors>({ left: '#ffffff', right: '#cc0000' });

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

	// State
	let gridSize = $state(normalizeGridSize(initialGridSize));
	let weaveParity = $state<0 | 1>(normalizeWeaveParity(initialWeaveParity));
	let fingers = $state<Finger[]>(initialFingers ?? []);

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

	// Initialize from props
	$effect.pre(() => {
		if (initialFingers) {
			fingers = initialFingers;
		}
		gridSize = normalizeGridSize(initialGridSize);
		weaveParity = normalizeWeaveParity(initialWeaveParity);
	});

	onMount(() => {
		// Initialize colors from store and subscribe to changes
		heartColors = getColors();
		const unsubscribe = subscribeColors((c) => {
			heartColors = c;
		});

		return () => {
			unsubscribe();
		};
	});

	// Calculate display size - for readonly mode, use CSS scaling
	let displayWidth = $derived(size);
	let displayHeight = $derived(size);
</script>

<svg
	viewBox={heartTransform.viewBox}
	width={displayWidth}
	height={displayHeight}
	preserveAspectRatio="xMidYMid meet"
	class="paper-heart-svg"
	class:readonly
	xmlns="http://www.w3.org/2000/svg"
	style="overflow: visible"
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
	}

	.paper-heart-svg.readonly {
		pointer-events: none;
	}
</style>
