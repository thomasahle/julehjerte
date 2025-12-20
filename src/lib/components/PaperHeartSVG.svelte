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
		buildLobeClipPath,
		type WeaveData
	} from '$lib/rendering/svgWeave';
	import { BASE_CANVAS_SIZE, BASE_CENTER, MIN_GRID_SIZE, MAX_GRID_SIZE } from '$lib/constants';
	import { clampInt } from '$lib/utils/math';

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

	// State for measured bounds (use getBBox for actual rendered bounds)
	let measuredBounds = $state<{ x: number; y: number; width: number; height: number } | null>(null);
	let heartGroupEl = $state<SVGGElement | null>(null);
	let lobeLeftEl = $state<SVGPathElement | null>(null);
	let lobeRightEl = $state<SVGPathElement | null>(null);
	let svgEl = $state<SVGSVGElement | null>(null);

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

	function toDomMatrix(m: DOMMatrixReadOnly | SVGMatrix): DOMMatrixReadOnly {
		// SVGMatrix is deprecated but still returned by getCTM in some browsers.
		// DOMMatrix is standard and works with DOMPoint.matrixTransform.
		if (m instanceof DOMMatrix) return m;
		return new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
	}

	function measurePathBounds(
		svg: SVGSVGElement,
		pathEl: SVGPathElement
	): { x: number; y: number; width: number; height: number } | null {
		let total: number;
		try {
			total = pathEl.getTotalLength();
		} catch {
			return null;
		}
		if (!Number.isFinite(total) || total <= 0) return null;

		const pathToViewportRaw = pathEl.getCTM();
		const svgToViewportRaw = svg.getCTM();
		if (!pathToViewportRaw || !svgToViewportRaw) return null;
		// getCTM() is relative to the SVG viewport (includes viewBox scaling).
		// Convert to SVG user units by canceling out the SVG's own CTM.
		const ctm = toDomMatrix(svgToViewportRaw).inverse().multiply(toDomMatrix(pathToViewportRaw));

		const samples = 128;
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (let i = 0; i <= samples; i++) {
			const len = (total * i) / samples;
			const p = pathEl.getPointAtLength(len);
			const tp = new DOMPoint(p.x, p.y).matrixTransform(ctm);
			if (tp.x < minX) minX = tp.x;
			if (tp.y < minY) minY = tp.y;
			if (tp.x > maxX) maxX = tp.x;
			if (tp.y > maxY) maxY = tp.y;
		}

		if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
			return null;
		}
		return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
	}

	function unionBounds(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
		const minX = Math.min(a.x, b.x);
		const minY = Math.min(a.y, b.y);
		const maxX = Math.max(a.x + a.width, b.x + b.width);
		const maxY = Math.max(a.y + a.height, b.y + b.height);
		return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
	}

	// Measure bounds after render using the actual lobe path geometry (robust to transforms).
	$effect(() => {
		if (svgEl && heartGroupEl && weaveData && lobeLeftEl && lobeRightEl) {
			const svg = svgEl;
			const leftEl = lobeLeftEl;
			const rightEl = lobeRightEl;
			// Use requestAnimationFrame to ensure paths are rendered
			requestAnimationFrame(() => {
				try {
					const left = measurePathBounds(svg, leftEl);
					const right = measurePathBounds(svg, rightEl);
					if (!left || !right) return;
					const bbox = unionBounds(left, right);
					if (bbox.width > 0 && bbox.height > 0) measuredBounds = bbox;
				} catch (e) {
					// getBBox might fail if element not in DOM
				}
			});
		}
	});

	// Calculate viewBox based on measured bounds (with fallback)
	let heartTransform = $derived.by(() => {
		if (!weaveData) return { viewBox: `0 0 ${BASE_CANVAS_SIZE} ${BASE_CANVAS_SIZE}`, transform: '' };

			// If we have measured bounds, use them for perfect centering.
			// measuredBounds is already in the rotated coordinate space (we sample points with CTM applied).
			if (measuredBounds) {
				// Match Paper.js fit behavior: it scales using max(bounds.w, bounds.h),
				// which is equivalent to fitting into a square viewBox.
				const minX = measuredBounds.x;
				const minY = measuredBounds.y;
				const width = measuredBounds.width;
				const height = measuredBounds.height;
				const boundsSize = Math.max(width, height);
				// Paper.js uses available = displayedSize - 2*(displayedSize*0.02) => 0.96*displayedSize,
				// so padding per side is ~2.08% of the bounds size.
				const padding = boundsSize * 0.021;
				const side = boundsSize + 2 * padding;
				const cx = minX + width / 2;
				const cy = minY + height / 2;
				const viewBox = `${cx - side / 2} ${cy - side / 2} ${side} ${side}`;
				return { viewBox, transform: rotationTransform };
			}

		// Fallback: use calculated bounds (before measurement is ready)
		const { overlap } = weaveData;
		const earLeft = overlap.height / 2;
		const earTop = overlap.width / 2;

		const preRotBounds = {
			left: overlap.left - earLeft,
			top: overlap.top - earTop,
			right: overlap.left + overlap.width,
			bottom: overlap.top + overlap.height
		};

		const cos45 = Math.SQRT1_2;
		const sin45 = Math.SQRT1_2;

		const corners = [
			{ x: preRotBounds.left, y: preRotBounds.top },
			{ x: preRotBounds.right, y: preRotBounds.top },
			{ x: preRotBounds.left, y: preRotBounds.bottom },
			{ x: preRotBounds.right, y: preRotBounds.bottom }
		];

		const rotatedCorners = corners.map(({ x, y }) => {
			const dx = x - overlapCenter.x;
			const dy = y - overlapCenter.y;
			return {
				x: dx * cos45 - dy * sin45 + overlapCenter.x,
				y: dx * sin45 + dy * cos45 + overlapCenter.y
			};
		});

		const rotatedMinX = Math.min(...rotatedCorners.map(c => c.x));
		const rotatedMaxX = Math.max(...rotatedCorners.map(c => c.x));
		const rotatedMinY = Math.min(...rotatedCorners.map(c => c.y));
		const rotatedMaxY = Math.max(...rotatedCorners.map(c => c.y));

		// Match Paper.js fit behavior: fit into a square viewBox.
		const width = rotatedMaxX - rotatedMinX;
		const height = rotatedMaxY - rotatedMinY;
		const boundsSize = Math.max(width, height);
		const padding = boundsSize * 0.021;
		const side = boundsSize + 2 * padding;
		const cx = (rotatedMinX + rotatedMaxX) / 2;
		const cy = (rotatedMinY + rotatedMaxY) / 2;
		const viewBox = `${cx - side / 2} ${cy - side / 2} ${side} ${side}`;

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
	bind:this={svgEl}
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
			<g bind:this={heartGroupEl}>
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
				<path bind:this={lobeLeftEl} d={weaveData.leftLobeClip} fill={heartColors.left} />

				<!-- Layer 2: Right lobe (direct path fill, no clip-path needed) -->
				<path bind:this={lobeRightEl} d={weaveData.rightLobeClip} fill={heartColors.right} />

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
