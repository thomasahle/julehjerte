<script lang="ts">
	import { onMount, tick, type Component, type Snippet } from 'svelte';
	import type { IconProps } from '$lib/components/icons/types';
	import { Separator } from '$lib/components/ui/separator';
	import { ToggleGroup, ToggleGroupItem } from '$lib/components/ui/toggle-group';
	import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '$lib/components/ui/tooltip';
	import {
		ChevronRightIcon,
		CloseIcon,
		FitIcon,
		RedoIcon,
		SwapIcon,
		TrashIcon,
		UndoIcon
	} from '$lib/components/icons';
	import {
		NodeAddIcon,
		NodeCornerIcon,
		NodeCurveIcon,
		NodeSmoothIcon,
		NodeSymmetricIcon,
		SegmentCurveIcon,
		SegmentLineIcon
	} from '$lib/components/editor/icons';

	import { NARROW_QUERY } from '$lib/breakpoints';
	import { readPanelCollapsed, writePanelCollapsed } from '$lib/editor/panelState';
	import type { Finger, GridSize, Vec, LobeId, NodeType } from '$lib/types/heart';
	import { clamp, clampInt } from '$lib/utils/math';
	import { inferOverlapRect } from '$lib/utils/overlapRect';
	import { BASE_CANVAS_SIZE, CENTER, MAX_GRID_SIZE, MIN_GRID_SIZE, PRECISION_GRID_SIZE, STRIP_WIDTH } from '$lib/constants';
	import { computeWeaveData } from '$lib/rendering/svgWeave';
	import { computeHeartViewBoxFromOverlap } from '$lib/rendering/heartSvg';
	import { bezierPathBBox, closestPointOnBezier } from '$lib/geometry/curves';
	import { Point } from '$lib/geometry/point';
	import { snapSequentialQP, snapSequentialQPBezierControl, snapSequentialQPBezierJunction } from '$lib/algorithms/snapBezierControl';
	import { detectSymmetryModes } from '$lib/utils/symmetry';
	import {
		cloneSegments,
		fingerToSegments,
		mergeBezierSegments,
		reverseSegments,
		segmentsToPathData,
		updateFingerSegments,
		type BezierSegment
	} from '$lib/geometry/bezierSegments';
	import { dot, midpoint, normalize, perp, vecAdd, vecDist, vecLerp, vecScale, vecSub } from '$lib/geometry/vec';
	import { insertNodeInFinger, shiftNodeTypesOnDelete } from '$lib/editor/commands';
	import { bezierPointAt, findFingersWithIssues, intersectionMarginPx, segmentsIntersect } from '$lib/editor/curveIssues';
	import { findNearestOppositeAnchor, snapOppositeRadiusPx } from '$lib/editor/snapOpposite';
	import { toggleNumberInList } from '$lib/editor/selection';
	import {
		DEFAULT_COLORS,
		DEFAULT_COLORS_HEX,
		getColors,
		subscribeColors,
		type HeartColors
	} from '$lib/stores/colors';
	import { parseHexColor, toHexColors } from '$lib/utils/heartColors';
	import { stripsLabel as formatStrips, t as translate, type Language, type TranslationKey } from '$lib/i18n';

		interface Props {
			readonly?: boolean;
			idPrefix?: string;
			lang?: Language;
			initialFingers?: Finger[];
			initialGridSize?: GridSize | number;
			initialWeaveParity?: 0 | 1 | number;
			size?: number;
			fullPage?: boolean;
			/**
			 * Extra sections for the right-hand panel (docs/redesign/DESIGN.md §7).
			 * The editor route fills it with "Hjertedetaljer" and "Handlinger" so that
			 * all five panels share one floating 340px column and one collapse
			 * control. The snippet is authored in the route, so the route styles it;
			 * this component only supplies the column. Below 900px the route renders
			 * the same snippet itself, under the canvas, and passes nothing here.
			 */
			panelExtra?: Snippet;
			/**
			 * The heart's own colours, if it has any (`HeartDesign.colors`). Without
			 * them the canvas follows the site-wide colour store, and the first pick
			 * in the Farver section starts from that pair.
			 */
			initialColors?: HeartColors;
			/** Told what the visitor picked, so the route saves and shares it. */
			onColorsChange?: (colors: HeartColors) => void;
			onFingersChange?: (fingers: Finger[], gridSize: GridSize, weaveParity: 0 | 1) => void;
		}

	let {
		readonly = false,
		idPrefix = undefined,
			lang = 'da',
			initialFingers,
			initialGridSize = 3,
			initialWeaveParity = 0,
			size = 800,
			fullPage = false,
			panelExtra,
			initialColors = undefined,
			onColorsChange,
			onFingersChange
		}: Props = $props();

	// Stable ID for clip paths (avoid Math.random which breaks SSR/hydration).
	const componentId = $derived.by(() => (idPrefix && idPrefix.length > 0 ? idPrefix : 'heart-editor'));
	// UI strings in the language of the page hosting the editor.
	const tr = (key: TranslationKey) => translate(key, lang);
	const HANDLE_COLLAPSE_EPS = 0.25;
	const HANDLE_SNAP_EPS = 8;
	const OUTER_EDGE_TOL = 0.75;
	const OUTER_EDGE_REMOVE_TOL = 5;

	function normalizeGridSize(raw: GridSize | number): GridSize {
		if (typeof raw === 'number' && Number.isFinite(raw)) {
			const n = clampInt(raw, MIN_GRID_SIZE, MAX_GRID_SIZE);
			return { x: n, y: n };
		}
		const x = (raw as GridSize)?.x;
		const y = (raw as GridSize)?.y;
		if (typeof x === 'number' && typeof y === 'number') {
			return { x: clampInt(x, MIN_GRID_SIZE, MAX_GRID_SIZE), y: clampInt(y, MIN_GRID_SIZE, MAX_GRID_SIZE) };
		}
		return { x: 3, y: 3 };
	}

	function normalizeWeaveParity(raw: unknown): 0 | 1 {
		const v = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 0;
		return v % 2 === 1 ? 1 : 0;
	}

	// Touching the Farver section gives the heart colours of its own: from here on
	// it keeps them wherever it is shown, instead of following the site-wide pair.
	function setHeartColors(next: HeartColors) {
		designColors = next;
		onColorsChange?.(next);
	}

	function setLobeColor(lobe: LobeId, value: string) {
		const hex = parseHexColor(value);
		if (!hex) return;
		setHeartColors({ ...colorInputs, [lobe]: hex });
	}

	function flipLobeColors() {
		setHeartColors({ left: colorInputs.right, right: colorInputs.left });
	}

	function isHandleCollapsed(handle: Vec, anchor: Vec): boolean {
		return vecDist(handle, anchor) <= HANDLE_COLLAPSE_EPS;
	}

	function lobePrefix(lobe: LobeId) {
		return lobe === 'left' ? 'L' : 'R';
	}

	function idForBoundary(lobe: LobeId, index: number) {
		return `${lobePrefix(lobe)}-${index}`;
	}

	function boundaryIndexFromId(id: string): number {
		const idx = Number(id.split('-')[1]);
		return Number.isFinite(idx) ? idx : 0;
	}

	function boundaryCurveCount(size: GridSize, lobe: LobeId) {
		const strips = lobe === 'left' ? size.y : size.x;
		return Math.max(0, strips + 1);
	}

		function createDefaultFingers(sizeInput: GridSize): Finger[] {
			const size = normalizeGridSize(sizeInput);
			const width = size.x * STRIP_WIDTH;
			const height = size.y * STRIP_WIDTH;
		const left = CENTER.x - width / 2;
		const top = CENTER.y - height / 2;
		const right = left + width;
		const bottom = top + height;

		const result: Finger[] = [];
		const boundariesLeft = Math.max(0, size.y + 1);
		const boundariesRight = Math.max(0, size.x + 1);

		for (let i = 0; i < boundariesLeft; i++) {
			const t = size.y ? i / size.y : 0;
			const y = top + t * height;
			const p0: Vec = { x: right, y };
			const p3: Vec = { x: left, y };

				const isEdge = i === 0 || i === size.y;
				const bow = (t - 0.5) * height * 0.12;
				const p1: Vec = isEdge ? { ...p0 } : { x: p0.x - width * 0.3, y: p0.y + bow };
				const p2: Vec = isEdge ? { ...p3 } : { x: p3.x + width * 0.3, y: p3.y - bow };

				result.push({ id: `L-${i}`, lobe: 'left', segments: [{ p0, p1, p2, p3 }] });
			}

		for (let i = 0; i < boundariesRight; i++) {
			const t = size.x ? i / size.x : 0;
			const x = left + t * width;
			const p0: Vec = { x, y: bottom };
			const p3: Vec = { x, y: top };

				const isEdge = i === 0 || i === size.x;
				const bow = (t - 0.5) * width * 0.12;
				const p1: Vec = isEdge ? { ...p0 } : { x: p0.x + bow, y: p0.y - height * 0.3 };
				const p2: Vec = isEdge ? { ...p3 } : { x: p3.x - bow, y: p3.y + height * 0.3 };

				result.push({ id: `R-${i}`, lobe: 'right', segments: [{ p0, p1, p2, p3 }] });
			}

		return result;
	}

	function inferGridSizeFromFingers(curFingers: Finger[], fallbackGridSize: GridSize): GridSize {
		const leftCount = curFingers.filter((f) => f.lobe === 'left').length;
		const rightCount = curFingers.filter((f) => f.lobe === 'right').length;
		// Boundaries include the two outer edges, so strips = boundaries - 1.
		const x = clampInt(rightCount - 1, MIN_GRID_SIZE, MAX_GRID_SIZE);
		const y = clampInt(leftCount - 1, MIN_GRID_SIZE, MAX_GRID_SIZE);
		if (x === fallbackGridSize.x && y === fallbackGridSize.y) return fallbackGridSize;
		return { x, y };
	}

		function makeNewBoundary(lobe: LobeId, pos: number): Finger {
			const id = `${lobePrefix(lobe)}-tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
			const { left, right, top, bottom } = getOverlapRect();
			const width = right - left;
		const height = bottom - top;

		if (lobe === 'right') {
			const x = pos;
			const p0: Vec = { x, y: bottom };
			const p3: Vec = { x, y: top };
				// Add slight curve like createDefaultFingers (with bow = 0 for neutral curve)
				const p1: Vec = { x: p0.x, y: p0.y - height * 0.3 };
				const p2: Vec = { x: p3.x, y: p3.y + height * 0.3 };
				return { id, lobe, segments: [{ p0, p1, p2, p3 }] };
			}

		const y = pos;
		const p0: Vec = { x: right, y };
		const p3: Vec = { x: left, y };
			// Add slight curve like createDefaultFingers (with bow = 0 for neutral curve)
			const p1: Vec = { x: p0.x - width * 0.3, y: p0.y };
			const p2: Vec = { x: p3.x + width * 0.3, y: p3.y };
			return { id, lobe, segments: [{ p0, p1, p2, p3 }] };
		}

	// State
	// The site-wide pair, the heart's own (once it has any), and what is painted.
	let storeColors = $state<HeartColors>({ ...DEFAULT_COLORS });
	// Set once from `initialColors` in the init effect below, like the geometry props.
	let designColors = $state<HeartColors | null>(null);
	let heartColors = $derived(designColors ?? storeColors);
	// The two <input type="color"> only speak #rrggbb; the store's red is rgb().
	let colorInputs = $derived(toHexColors(heartColors, DEFAULT_COLORS_HEX));
	let gridSize = $state<GridSize>({ x: 3, y: 3 });
	let weaveParity = $state<0 | 1>(0);
	let fingers = $state<Finger[]>([]);
	let didInit = false;

	type SymmetryMode = 'off' | 'sym' | 'anti';

	let showCurves = $state(true);
	// Snap dragged anchors to nearby anchors of the opposite lobe (GitHub issue #2). Off by default.
	let snapToOpposite = $state(false);
	let withinCurveMode = $state<SymmetryMode>('off');
	let withinLobeMode = $state<SymmetryMode>('off');
	let betweenLobesMode = $state<SymmetryMode>('off');

	let symmetryWithinCurve = $derived(withinCurveMode !== 'off');
	let antiWithinCurve = $derived(withinCurveMode === 'anti');
	let symmetryWithinLobe = $derived(withinLobeMode !== 'off');
	let antiWithinLobe = $derived(withinLobeMode === 'anti');
	let symmetryBetweenLobes = $derived(betweenLobesMode !== 'off');
	let antiBetweenLobes = $derived(betweenLobesMode === 'anti');

	type CurveHit = { fingerId: string; segmentIndex: number; t: number };
	type DragTarget =
		| { kind: 'control'; fingerId: string; anchorIdx?: number; segmentIndex?: number; handle?: 'p1' | 'p2' }
		| { kind: 'path'; fingerId: string }
		| null;

	let selectedFingerId = $state<string | null>(null);
	let selectedAnchors = $state<number[]>([]);
	let selectedSegments = $state<number[]>([]);
	let lastCurveHit = $state<CurveHit | null>(null);
	let hoverFingerId = $state<string | null>(null);

	let dragTarget = $state<DragTarget>(null);
	let dragDirty = $state(false);
	let dragSnapshot = $state<HistorySnapshot | null>(null);
	let activePointerId = $state<number | null>(null);
	let dragStartPointer = $state<Vec | null>(null);
	let dragStartOffset = $state<Vec | null>(null);
	let lastFingerClickAt = 0;
	let lastFingerClickId: string | null = null;
	let lastFingerClickPos: Vec | null = null;
	const DOUBLE_CLICK_MS = 350;
	const DOUBLE_CLICK_DIST = 8;

	let prevWithinCurveMode: SymmetryMode = 'off';
	let prevWithinLobeMode: SymmetryMode = 'off';
	let prevBetweenLobesMode: SymmetryMode = 'off';

	type HistorySnapshot = {
		fingers: Finger[];
		gridSize: GridSize;
		weaveParity: 0 | 1;
		symmetry: {
			withinCurveMode: SymmetryMode;
			withinLobeMode: SymmetryMode;
			betweenLobesMode: SymmetryMode;
		};
		selectedFingerId: string | null;
		selectedAnchors: number[];
		selectedSegments: number[];
		lastCurveHit: CurveHit | null;
	};

	let undoStack = $state<HistorySnapshot[]>([]);
	let redoStack = $state<HistorySnapshot[]>([]);
	let canUndo = $derived(undoStack.length > 0);
	let canRedo = $derived(redoStack.length > 0);

		function cloneFinger(f: Finger): Finger {
			return { id: f.id, lobe: f.lobe, segments: cloneSegments(f.segments), nodeTypes: f.nodeTypes ? { ...f.nodeTypes } : undefined };
		}

	function snapshotState(): HistorySnapshot {
		return {
			fingers: fingers.map(cloneFinger),
			gridSize,
			weaveParity,
			symmetry: { withinCurveMode, withinLobeMode, betweenLobesMode },
			selectedFingerId,
			selectedAnchors: selectedAnchors.slice(),
			selectedSegments: selectedSegments.slice(),
			lastCurveHit: lastCurveHit ? { ...lastCurveHit } : null
		};
	}

	function restoreSnapshot(s: HistorySnapshot) {
		fingers = s.fingers.map(cloneFinger);
		gridSize = s.gridSize;
		weaveParity = s.weaveParity;
		withinCurveMode = s.symmetry.withinCurveMode;
		withinLobeMode = s.symmetry.withinLobeMode;
		betweenLobesMode = s.symmetry.betweenLobesMode;
		prevWithinCurveMode = withinCurveMode;
		prevWithinLobeMode = withinLobeMode;
		prevBetweenLobesMode = betweenLobesMode;
		selectedFingerId = s.selectedFingerId;
		selectedAnchors = s.selectedAnchors.slice();
		selectedSegments = s.selectedSegments.slice();
		lastCurveHit = s.lastCurveHit ? { ...s.lastCurveHit } : null;
		dragTarget = null;
	}

	function pushUndo(before: HistorySnapshot) {
		undoStack = [...undoStack, before];
		redoStack = [];
	}

	function undo() {
		const prev = undoStack[undoStack.length - 1];
		if (!prev) return;
		undoStack = undoStack.slice(0, -1);
		redoStack = [...redoStack, snapshotState()];
		restoreSnapshot(prev);
	}

	function redo() {
		const next = redoStack[redoStack.length - 1];
		if (!next) return;
		redoStack = redoStack.slice(0, -1);
		undoStack = [...undoStack, snapshotState()];
		restoreSnapshot(next);
	}

	function updateFinger(fingerId: string, update: (f: Finger) => Finger) {
		fingers = fingers.map((f) => (f.id === fingerId ? update(f) : f));
	}

	function getFingerById(id: string): Finger | undefined {
		return fingers.find((f) => f.id === id);
	}

	function getDragBaseFinger(fingerId: string): Finger | null {
		const base = dragSnapshot?.fingers.find((f) => f.id === fingerId);
		return base ?? getFingerById(fingerId) ?? null;
	}

		function clampEndpoints(fingerId: string) {
			updateFinger(fingerId, (f) => {
				const segments = cloneSegments(fingerToSegments(f));
				if (!segments.length) return f;
				const first = segments[0]!;
				const last = segments[segments.length - 1]!;
				const nextP0 = projectEndpoint(f, first.p0, 'p0');
			if (nextP0.x !== first.p0.x || nextP0.y !== first.p0.y) {
				const d = vecSub(nextP0, first.p0);
				first.p0 = nextP0;
				first.p1 = vecAdd(first.p1, d);
			}
			const nextP3 = projectEndpoint(f, last.p3, 'p3');
			if (nextP3.x !== last.p3.x || nextP3.y !== last.p3.y) {
				const d = vecSub(nextP3, last.p3);
				last.p3 = nextP3;
				last.p2 = vecAdd(last.p2, d);
			}
			return updateFingerSegments(f, segments);
		});
	}

	function translateFinger(fingerId: string, delta: Vec) {
		updateFinger(fingerId, (f) => {
			const segs = cloneSegments(fingerToSegments(f));
			for (const seg of segs) {
				seg.p0 = vecAdd(seg.p0, delta);
				seg.p1 = vecAdd(seg.p1, delta);
				seg.p2 = vecAdd(seg.p2, delta);
				seg.p3 = vecAdd(seg.p3, delta);
			}
			return updateFingerSegments(f, segs);
		});
	}

	function syncGridSizeToFingers() {
		const inferred = inferGridSizeFromFingers(fingers, gridSize);
		if (inferred.x !== gridSize.x || inferred.y !== gridSize.y) {
			gridSize = inferred;
			if (inferred.x !== inferred.y && betweenLobesMode !== 'off') {
				betweenLobesMode = 'off';
			}
		}
	}

	function renumberBoundaryIds(): Map<string, string> {
		const idMap = new Map<string, string>();
		const left = fingers
			.filter((f) => f.lobe === 'left')
			.slice()
			.sort((a, b) => (fingerToSegments(a)[0]?.p0.y ?? 0) - (fingerToSegments(b)[0]?.p0.y ?? 0));
		const right = fingers
			.filter((f) => f.lobe === 'right')
			.slice()
			.sort((a, b) => (fingerToSegments(a)[0]?.p0.x ?? 0) - (fingerToSegments(b)[0]?.p0.x ?? 0));

		const nextLeft = left.map((f, i) => {
			const nextId = idForBoundary('left', i);
			idMap.set(f.id, nextId);
			return f.id === nextId ? f : { ...f, id: nextId };
		});
		const nextRight = right.map((f, i) => {
			const nextId = idForBoundary('right', i);
			idMap.set(f.id, nextId);
			return f.id === nextId ? f : { ...f, id: nextId };
		});

		fingers = [...nextLeft, ...nextRight];

		if (selectedFingerId) selectedFingerId = idMap.get(selectedFingerId) ?? selectedFingerId;
		if (hoverFingerId) hoverFingerId = idMap.get(hoverFingerId) ?? hoverFingerId;
		if (lastCurveHit) {
			lastCurveHit = { ...lastCurveHit, fingerId: idMap.get(lastCurveHit.fingerId) ?? lastCurveHit.fingerId };
		}
		if (dragTarget) {
			const mapped = idMap.get(dragTarget.fingerId);
			if (mapped) dragTarget = { ...dragTarget, fingerId: mapped };
		}

		return idMap;
	}

	function dropSelectionForRemovedFingers(removedIds: Set<string>) {
		if (selectedFingerId && removedIds.has(selectedFingerId)) {
			selectedFingerId = null;
			selectedAnchors = [];
			selectedSegments = [];
			lastCurveHit = null;
		} else if (lastCurveHit && removedIds.has(lastCurveHit.fingerId)) {
			lastCurveHit = null;
		}

		if (hoverFingerId && removedIds.has(hoverFingerId)) hoverFingerId = null;
		if (dragTarget && removedIds.has(dragTarget.fingerId)) dragTarget = null;
	}

	function ensureOuterBoundaryCurves(): {
		changed: boolean;
		insertedTop: boolean;
		insertedBottom: boolean;
		insertedLeft: boolean;
		insertedRight: boolean;
	} {
		const { left, right, top, bottom } = getOverlapRect();

		const endpoints = (f: Finger) => {
			const segs = fingerToSegments(f);
			if (!segs.length) return null;
			return { p0: segs[0]!.p0, p3: segs[segs.length - 1]!.p3 };
		};

		const leftCurves = fingers.filter((f) => f.lobe === 'left');
		const rightCurves = fingers.filter((f) => f.lobe === 'right');

		const minBy = (arr: Finger[], key: (f: Finger) => number) => {
			let best: Finger | null = null;
			let bestK = Infinity;
			for (const f of arr) {
				const k = key(f);
				if (k < bestK) {
					best = f;
					bestK = k;
				}
			}
			return best;
		};
		const maxBy = (arr: Finger[], key: (f: Finger) => number) => {
			let best: Finger | null = null;
			let bestK = -Infinity;
			for (const f of arr) {
				const k = key(f);
				if (k > bestK) {
					best = f;
					bestK = k;
				}
			}
			return best;
		};

		const topFinger = minBy(leftCurves, (f) => fingerToSegments(f)[0]?.p0.y ?? 0);
		const bottomFinger = maxBy(leftCurves, (f) => fingerToSegments(f)[0]?.p0.y ?? 0);
		const leftFinger = minBy(rightCurves, (f) => fingerToSegments(f)[0]?.p0.x ?? 0);
		const rightFinger = maxBy(rightCurves, (f) => fingerToSegments(f)[0]?.p0.x ?? 0);

		const topE = topFinger ? endpoints(topFinger) : null;
		const bottomE = bottomFinger ? endpoints(bottomFinger) : null;
		const leftE = leftFinger ? endpoints(leftFinger) : null;
		const rightE = rightFinger ? endpoints(rightFinger) : null;

		const hasTop = !!topE && Math.abs(topE.p0.y - top) <= OUTER_EDGE_TOL && Math.abs(topE.p3.y - top) <= OUTER_EDGE_TOL;
		const hasBottom =
			!!bottomE && Math.abs(bottomE.p0.y - bottom) <= OUTER_EDGE_TOL && Math.abs(bottomE.p3.y - bottom) <= OUTER_EDGE_TOL;
		const hasLeft =
			!!leftE && Math.abs(leftE.p0.x - left) <= OUTER_EDGE_TOL && Math.abs(leftE.p3.x - left) <= OUTER_EDGE_TOL;
		const hasRight =
			!!rightE && Math.abs(rightE.p0.x - right) <= OUTER_EDGE_TOL && Math.abs(rightE.p3.x - right) <= OUTER_EDGE_TOL;

		const missingTop = !hasTop;
		const missingBottom = !hasBottom;
		const missingLeft = !hasLeft;
		const missingRight = !hasRight;

		const toAddLeft = (missingTop ? 1 : 0) + (missingBottom ? 1 : 0);
		const toAddRight = (missingLeft ? 1 : 0) + (missingRight ? 1 : 0);

		const newCurves: Finger[] = [];
		let changed = false;
		let insertedTop = false;
		let insertedBottom = false;
		let insertedLeft = false;
		let insertedRight = false;

		if (toAddLeft) {
			const nextStrips = leftCurves.length + toAddLeft - 1;
			if (nextStrips <= MAX_GRID_SIZE) {
				if (missingTop) {
					newCurves.push(makeNewBoundary('left', top));
					insertedTop = true;
				}
				if (missingBottom) {
					newCurves.push(makeNewBoundary('left', bottom));
					insertedBottom = true;
				}
				changed = true;
			} else {
				// At max strips: snap the existing outer boundary back to the edge.
				if (missingTop && topFinger && topE) {
					translateFinger(topFinger.id, { x: 0, y: top - topE.p0.y });
					clampEndpoints(topFinger.id);
					changed = true;
				}
				if (missingBottom && bottomFinger && bottomE) {
					translateFinger(bottomFinger.id, { x: 0, y: bottom - bottomE.p0.y });
					clampEndpoints(bottomFinger.id);
					changed = true;
				}
			}
		}

		if (toAddRight) {
			const nextStrips = rightCurves.length + toAddRight - 1;
			if (nextStrips <= MAX_GRID_SIZE) {
				if (missingLeft) {
					newCurves.push(makeNewBoundary('right', left));
					insertedLeft = true;
				}
				if (missingRight) {
					newCurves.push(makeNewBoundary('right', right));
					insertedRight = true;
				}
				changed = true;
			} else {
				if (missingLeft && leftFinger && leftE) {
					translateFinger(leftFinger.id, { x: left - leftE.p0.x, y: 0 });
					clampEndpoints(leftFinger.id);
					changed = true;
				}
				if (missingRight && rightFinger && rightE) {
					translateFinger(rightFinger.id, { x: right - rightE.p0.x, y: 0 });
					clampEndpoints(rightFinger.id);
					changed = true;
				}
			}
		}

		if (newCurves.length) fingers = [...fingers, ...newCurves];
		const added = newCurves.length > 0;
		return { changed: changed || added, insertedTop, insertedBottom, insertedLeft, insertedRight };
	}

	function reconcileBoundaryCurves(options?: { allowEdgeRemoval?: boolean; forceRenumber?: boolean }): boolean {
		const allowEdgeRemoval = options?.allowEdgeRemoval ?? false;
		const forceRenumber = options?.forceRenumber ?? false;
		let changed = false;

		if (allowEdgeRemoval) {
			const { left, right, top, bottom } = getOverlapRect();

			const endpointsMatch = (finger: Finger, axis: 'x' | 'y', pos: number, tol: number) => {
				const segs = fingerToSegments(finger);
				if (!segs.length) return false;
				const first = segs[0]!;
				const last = segs[segs.length - 1]!;
				const a = axis === 'x' ? first.p0.x : first.p0.y;
				const b = axis === 'x' ? last.p3.x : last.p3.y;
				return Math.abs(a - pos) <= tol && Math.abs(b - pos) <= tol;
			};

			const sortedLeft = fingers
				.filter((f) => f.lobe === 'left')
				.slice()
				.sort((a, b) => (fingerToSegments(a)[0]?.p0.y ?? 0) - (fingerToSegments(b)[0]?.p0.y ?? 0));
			const sortedRight = fingers
				.filter((f) => f.lobe === 'right')
				.slice()
				.sort((a, b) => (fingerToSegments(a)[0]?.p0.x ?? 0) - (fingerToSegments(b)[0]?.p0.x ?? 0));

			const toRemove = new Set<string>();

			const maybeRemoveNearEdge = (
				boundaries: Finger[],
				which: 'min' | 'max',
				axis: 'x' | 'y',
				edgePos: number
			): boolean => {
				const strips = Math.max(0, boundaries.length - 1);
				if (strips <= MIN_GRID_SIZE) return false;
				const idx = which === 'min' ? 1 : boundaries.length - 2;
				const candidate = boundaries[idx];
				if (!candidate) return false;
				if (endpointsMatch(candidate, axis, edgePos, OUTER_EDGE_REMOVE_TOL)) {
					toRemove.add(candidate.id);
					return true;
				}
				return false;
			};

			const removedTop = maybeRemoveNearEdge(sortedLeft, 'min', 'y', top);
			maybeRemoveNearEdge(sortedLeft, 'max', 'y', bottom);
			const removedLeft = maybeRemoveNearEdge(sortedRight, 'min', 'x', left);
			maybeRemoveNearEdge(sortedRight, 'max', 'x', right);

			if (toRemove.size) {
				fingers = fingers.filter((f) => !toRemove.has(f.id));
				dropSelectionForRemovedFingers(toRemove);
				changed = true;

				// Removing a strip at the top/left shifts row/col indices for all existing cells.
				// Flip the parity base so existing cell colors remain stable.
				const shift = (removedTop ? 1 : 0) ^ (removedLeft ? 1 : 0);
				if (shift) weaveParity = (weaveParity ^ shift) as 0 | 1;
			}
		}

		const ensured = ensureOuterBoundaryCurves();
		if (ensured.changed) {
			changed = true;
			// Inserting a new strip at the top/left shifts indices; flip parity base to compensate.
			const shift = (ensured.insertedTop ? 1 : 0) ^ (ensured.insertedLeft ? 1 : 0);
			if (shift) weaveParity = (weaveParity ^ shift) as 0 | 1;
		}

		if (changed || forceRenumber) {
			renumberBoundaryIds();
			syncGridSizeToFingers();
			return true;
		}
		return false;
	}

	function getAnchorPositions(segments: BezierSegment[]): Vec[] {
		if (!segments.length) return [];
		const anchors: Vec[] = [segments[0]!.p0];
		for (let i = 0; i < segments.length; i++) anchors.push(segments[i]!.p3);
		return anchors;
	}

	function getOverlapRect(size: GridSize = gridSize) {
		return weaveData?.overlap ?? inferOverlapRect(fingers, size);
	}

	function projectEndpoint(finger: Finger, point: Vec, pointKey: 'p0' | 'p3', size: GridSize = gridSize): Vec {
		const { left: minX, right: maxX, top: minY, bottom: maxY } = getOverlapRect(size);

		if (finger.lobe === 'left') {
			const y = clamp(point.y, minY, maxY);
			const x = pointKey === 'p0' ? maxX : minX;
			return { x, y };
		}

		const x = clamp(point.x, minX, maxX);
		const y = pointKey === 'p0' ? maxY : minY;
		return { x, y };
	}

	// The anchor of the other lobe nearest to `pos` within the snap radius, or null. Positions are
	// the editor's internal coordinates, the same system drag positions are in.
	function snapTargetForAnchor(lobe: LobeId, pos: Vec): Vec | null {
		if (!snapToOpposite) return null;
		const { width, height } = getOverlapRect();
		return findNearestOppositeAnchor(fingers, lobe, pos, snapOppositeRadiusPx({ width, height }));
	}

	// Snap a curve endpoint after it has been projected onto its edge: the snap target is
	// projected onto the same edge, so the projection cannot undo the snap.
	function snapEndpointAnchor(finger: Finger, segments: BezierSegment[], anchorIdx: number) {
		const n = segments.length;
		if (!n || (anchorIdx !== 0 && anchorIdx !== n)) return;
		const key = anchorIdx === 0 ? 'p0' : 'p3';
		const current = anchorIdx === 0 ? segments[0]!.p0 : segments[n - 1]!.p3;
		const target = snapTargetForAnchor(finger.lobe, current);
		if (!target) return;
		const projected = projectEndpoint(finger, target, key);
		applyDeltaToAnchorsInSegments(finger, segments, [anchorIdx], vecSub(projected, current));
	}

	function applyDeltaToAnchorsInSegments(
		finger: Finger,
		segments: BezierSegment[],
		anchors: Iterable<number>,
		delta: Vec
	): BezierSegment[] {
		if (!segments.length) return segments;
		const n = segments.length;

		const anchorList = Array.from(anchors)
			.filter((idx) => Number.isFinite(idx) && idx >= 0 && idx <= n)
			.slice()
			.sort((a, b) => a - b);

		// Endpoints: project back onto the correct edges.
		for (const idx of anchorList) {
			if (idx !== 0 && idx !== n) continue;
			if (idx === 0) {
				const old = segments[0]!.p0;
				const desired = vecAdd(old, delta);
				const nextP0 = projectEndpoint(finger, desired, 'p0');
				const d = vecSub(nextP0, old);
				segments[0]!.p0 = nextP0;
				segments[0]!.p1 = vecAdd(segments[0]!.p1, d);
			} else {
				const last = segments[n - 1]!;
				const old = last.p3;
				const desired = vecAdd(old, delta);
				const nextP3 = projectEndpoint(finger, desired, 'p3');
				const d = vecSub(nextP3, old);
				last.p3 = nextP3;
				last.p2 = vecAdd(last.p2, d);
			}
		}

		// Internal anchors: move junction and translate adjacent handles.
		for (const idx of anchorList) {
			if (idx <= 0 || idx >= n) continue;
			const seg = segments[idx]!;
			const prev = segments[idx - 1]!;
			const old = seg.p0;
			const next = vecAdd(old, delta);
			const d = vecSub(next, old);
			seg.p0 = next;
			prev.p3 = next;
			prev.p2 = vecAdd(prev.p2, d);
			seg.p1 = vecAdd(seg.p1, d);
		}

		return segments;
	}

	function reflectAcrossChordBisector(p0: Vec, p3: Vec, p: Vec): Vec {
		const mid = midpoint(p0, p3);
		const u = normalize(vecSub(p3, p0));
		const v = perp(u);
		const r = vecSub(p, mid);
		const uComp = dot(r, u);
		const vComp = dot(r, v);
		const mirrored = vecAdd(vecScale(u, -uComp), vecScale(v, vComp));
		return vecAdd(mid, mirrored);
	}

	function pointReflectAcrossMidpoint(p0: Vec, p3: Vec, p: Vec): Vec {
		return { x: p0.x + p3.x - p.x, y: p0.y + p3.y - p.y };
	}

	function withinCurveMatePoint(segments: BezierSegment[], p: Vec): Vec {
		if (!segments.length) return p;
		const p0 = segments[0]!.p0;
		const p3 = segments[segments.length - 1]!.p3;
		return antiWithinCurve ? pointReflectAcrossMidpoint(p0, p3, p) : reflectAcrossChordBisector(p0, p3, p);
	}

	function applyWithinCurveSymmetryForControlInSegments(
		segments: BezierSegment[],
		segmentIndex: number,
		driver: 'p1' | 'p2' = 'p1'
	) {
		const n = segments.length;
		if (!n) return;
		if (segmentIndex < 0 || segmentIndex >= n) return;
		const mateIdx = n - 1 - segmentIndex;
		const mate = (p: Vec) => withinCurveMatePoint(segments, p);
		if (driver === 'p2') segments[mateIdx]!.p1 = mate(segments[segmentIndex]!.p2);
		else segments[mateIdx]!.p2 = mate(segments[segmentIndex]!.p1);
	}

	function applyWithinCurveSymmetryAllInSegments(
		finger: Finger,
		segments: BezierSegment[],
		sourceSide: 'start' | 'end' = 'start'
	) {
		const n = segments.length;
		if (!n) return;

		// Include endpoints in symmetry by aligning the opposite endpoint to match
		// the driver endpoint (so the chord becomes horizontal/vertical).
		const start = segments[0]!.p0;
		const end = segments[n - 1]!.p3;
		if (finger.lobe === 'left') {
			if (sourceSide === 'start') {
				const desiredEnd = projectEndpoint(finger, { x: end.x, y: start.y }, 'p3');
				applyDeltaToAnchorsInSegments(finger, segments, [n], vecSub(desiredEnd, end));
			} else {
				const desiredStart = projectEndpoint(finger, { x: start.x, y: end.y }, 'p0');
				applyDeltaToAnchorsInSegments(finger, segments, [0], vecSub(desiredStart, start));
			}
		} else {
			if (sourceSide === 'start') {
				const desiredEnd = projectEndpoint(finger, { x: start.x, y: end.y }, 'p3');
				applyDeltaToAnchorsInSegments(finger, segments, [n], vecSub(desiredEnd, end));
			} else {
				const desiredStart = projectEndpoint(finger, { x: end.x, y: start.y }, 'p0');
				applyDeltaToAnchorsInSegments(finger, segments, [0], vecSub(desiredStart, start));
			}
		}

		const mate = (p: Vec) => withinCurveMatePoint(segments, p);

		const anchors: Vec[] = [];
		const outHandles: Vec[] = [];
		const inHandles: Array<Vec | null> = [];
		inHandles.length = n + 1;
		inHandles[0] = null;

		anchors[0] = segments[0]!.p0;
		for (let i = 0; i < n; i++) {
			outHandles[i] = segments[i]!.p1;
			inHandles[i + 1] = segments[i]!.p2;
			anchors[i + 1] = segments[i]!.p3;
		}

		for (let i = 0; i < n; i++) {
			const j = n - 1 - i;
			if (i >= j) break;
			const src = sourceSide === 'start' ? i : j;
			const dst = sourceSide === 'start' ? j : i;

			// dst segment is src segment reversed + mirrored/anti-mirrored.
			anchors[dst] = mate(anchors[src + 1]!);
			anchors[dst + 1] = mate(anchors[src]!);
			outHandles[dst] = mate(inHandles[src + 1]!);
			inHandles[dst + 1] = mate(outHandles[src]!);
		}

		if (n % 2 === 1) {
			const mid = (n - 1) / 2;
			if (sourceSide === 'start') {
				inHandles[mid + 1] = mate(outHandles[mid]!);
			} else {
				outHandles[mid] = mate(inHandles[mid + 1]!);
			}
		}

		for (let i = 0; i < n; i++) {
			const p0 = anchors[i]!;
			const p3 = anchors[i + 1]!;
			const p1 = outHandles[i]!;
			const p2 = inHandles[i + 1]!;
			segments[i] = { p0, p1, p2, p3 };
		}
	}

	function applyWithinCurveSymmetryForMovedAnchors(
		finger: Finger,
		segments: BezierSegment[],
		movedAnchors: Iterable<number>,
		draggedAnchorIdx: number
	) {
		const n = segments.length;
		if (!n) return;

		const moved = Array.from(movedAnchors)
			.filter((idx) => Number.isFinite(idx) && idx >= 0 && idx <= n)
			.slice();

		const includesEndpoint = moved.some((idx) => idx === 0 || idx === n);
		if (includesEndpoint) {
			const sourceSide: 'start' | 'end' = draggedAnchorIdx >= n / 2 ? 'end' : 'start';
			applyWithinCurveSymmetryAllInSegments(finger, segments, sourceSide);
			return;
		}

		const matePoint = (p: Vec) => withinCurveMatePoint(segments, p);
		const anchorPos = (idx: number): Vec => {
			if (idx <= 0) return segments[0]!.p0;
			if (idx >= n) return segments[n - 1]!.p3;
			return segments[idx]!.p0;
		};
		const moveAnchorTo = (idx: number, pos: Vec) => {
			const old = anchorPos(idx);
			const d = vecSub(pos, old);
			applyDeltaToAnchorsInSegments(finger, segments, [idx], d);
		};

		for (const idx of moved) {
			const mateIdx = n - idx;
			if (mateIdx < 0 || mateIdx > n) continue;

			if (mateIdx === idx) {
				const a = anchorPos(idx);
				const projected = vecLerp(a, matePoint(a), 0.5);
				moveAnchorTo(idx, projected);
			} else {
				const desiredMate = matePoint(anchorPos(idx));
				moveAnchorTo(mateIdx, desiredMate);
			}

			// Also update the handle mates adjacent to this anchor.
			if (idx < n) {
				const mateSeg = n - 1 - idx;
				segments[mateSeg]!.p2 = matePoint(segments[idx]!.p1);
			}
			if (idx > 0) {
				const mateSeg = n - idx;
				segments[mateSeg]!.p1 = matePoint(segments[idx - 1]!.p2);
			}
		}
	}

	function applyWithinCurveSymmetry(finger: Finger, segmentIndex?: number, driver: 'p1' | 'p2' = 'p1'): Finger {
		const segments = cloneSegments(fingerToSegments(finger));
		if (!segments.length) return finger;

		if (segmentIndex != null) {
			applyWithinCurveSymmetryForControlInSegments(segments, segmentIndex, driver);
			return updateFingerSegments(finger, segments);
		}

		applyWithinCurveSymmetryAllInSegments(finger, segments, 'start');
		return updateFingerSegments(finger, segments);
	}

	function oppositeLobe(lobe: LobeId): LobeId {
		return lobe === 'left' ? 'right' : 'left';
	}

	function swapPointBetweenLobesWithMode(p: Vec, anti = false): Vec {
		const { left, top, width, height } = getOverlapRect();
		const u = width ? (p.x - left) / width : 0;
		const v = height ? (p.y - top) / height : 0;
		if (!anti) return { x: left + v * width, y: top + u * height };
		return { x: left + (1 - v) * width, y: top + (1 - u) * height };
	}

	function mirrorPointWithinLobeWithMode(lobe: LobeId, p: Vec, anti = false): Vec {
		const { left, top, width, height } = getOverlapRect();
		const cx = left + width / 2;
		const cy = top + height / 2;
		if (anti) return { x: 2 * cx - p.x, y: 2 * cy - p.y };
		if (lobe === 'left') return { x: p.x, y: 2 * cy - p.y };
		return { x: 2 * cx - p.x, y: p.y };
	}

	function mapFinger(
		source: Finger,
		targetId: string,
		targetLobe: LobeId,
		mapPoint: (p: Vec) => Vec,
		reverseDirection = false
	): Finger {
		const segments = fingerToSegments(source);
			let mappedSegments = segments.map((seg) => ({
				p0: mapPoint(seg.p0),
				p1: mapPoint(seg.p1),
				p2: mapPoint(seg.p2),
				p3: mapPoint(seg.p3)
			}));
			const base: Finger = { id: targetId, lobe: targetLobe, segments: [] };
			if (!mappedSegments.length) return base;

		if (reverseDirection) {
			mappedSegments = reverseSegments(mappedSegments);
		}

		// Project endpoints to valid positions (and keep tangents by shifting adjacent controls).
		const first = mappedSegments[0]!;
		const last = mappedSegments[mappedSegments.length - 1]!;
		const projectedP0 = projectEndpoint(base, first.p0, 'p0');
		if (projectedP0.x !== first.p0.x || projectedP0.y !== first.p0.y) {
			const d = vecSub(projectedP0, first.p0);
			first.p0 = projectedP0;
			first.p1 = vecAdd(first.p1, d);
		}
		const projectedP3 = projectEndpoint(base, last.p3, 'p3');
		if (projectedP3.x !== last.p3.x || projectedP3.y !== last.p3.y) {
			const d = vecSub(projectedP3, last.p3);
			last.p3 = projectedP3;
			last.p2 = vecAdd(last.p2, d);
		}

		return updateFingerSegments(base, mappedSegments);
	}

	function canSymmetryBetweenLobes() {
		return gridSize.x === gridSize.y;
	}

	function boundaryCurveCountForLobe(lobe: LobeId) {
		return boundaryCurveCount(gridSize, lobe);
	}

	function mirrorBoundaryIndex(lobe: LobeId, boundaryIdx: number) {
		return boundaryCurveCountForLobe(lobe) - 1 - boundaryIdx;
	}

	function mateBoundaryIndexBetweenLobes(lobe: LobeId, boundaryIdx: number) {
		return antiBetweenLobes ? mirrorBoundaryIndex(lobe, boundaryIdx) : boundaryIdx;
	}

	function deriveSymmetryOverrides(primary: Finger): Map<string, Finger> {
		const overrides = new Map<string, Finger>();
		overrides.set(primary.id, primary);

		const idx = boundaryIndexFromId(primary.id);
		const internal = boundaryCurveCountForLobe(primary.lobe);
		if (idx < 0 || idx >= internal) return overrides;
		const mirrorIdx = mirrorBoundaryIndex(primary.lobe, idx);

		if (symmetryWithinLobe && mirrorIdx !== idx && mirrorIdx >= 0 && mirrorIdx < internal) {
			const mirrorId = idForBoundary(primary.lobe, mirrorIdx);
			const existing = getFingerById(mirrorId);
			if (existing) {
				overrides.set(
					mirrorId,
					mapFinger(primary, mirrorId, primary.lobe, (p) => mirrorPointWithinLobeWithMode(primary.lobe, p, antiWithinLobe), antiWithinLobe)
				);
			}
		}

		if (symmetryBetweenLobes && canSymmetryBetweenLobes()) {
			const otherLobe = oppositeLobe(primary.lobe);
			const otherId = idForBoundary(otherLobe, mateBoundaryIndexBetweenLobes(primary.lobe, idx));
			const otherExisting = getFingerById(otherId);
			if (otherExisting) {
				overrides.set(
					otherId,
					mapFinger(primary, otherId, otherLobe, (p) => swapPointBetweenLobesWithMode(p, antiBetweenLobes), antiBetweenLobes)
				);
			}

			if (symmetryWithinLobe && mirrorIdx !== idx && mirrorIdx >= 0 && mirrorIdx < internal) {
				const otherMirrorId = idForBoundary(otherLobe, mateBoundaryIndexBetweenLobes(primary.lobe, mirrorIdx));
				const otherMirrorExisting = getFingerById(otherMirrorId);
				if (otherMirrorExisting) {
					overrides.set(
						otherMirrorId,
						mapFinger(
							primary,
							otherMirrorId,
							otherLobe,
							(p) =>
								swapPointBetweenLobesWithMode(
									mirrorPointWithinLobeWithMode(primary.lobe, p, antiWithinLobe),
									antiBetweenLobes
								),
							antiWithinLobe !== antiBetweenLobes
						)
					);
				}
			}
		}

		return overrides;
	}

	// Curves that cross, touch or come within the physical margin of another curve in their lobe.
	// (Uses inferOverlapRect directly: weaveData is declared further down, which matters for SSR.)
	let issueFingerIds = $derived.by(() => {
		if (readonly || !showCurves) return new Set<string>();
		return findFingersWithIssues(fingers, intersectionMarginPx(inferOverlapRect(fingers, gridSize)));
	});

		function candidateIsValid(fingerId: string, candidate: Finger, overrides?: Map<string, Finger>): boolean {
			const { left: minX, right: maxX, top: minY, bottom: maxY } = getOverlapRect();
			const orderEps = 1;
			const tol = 0.5;

			const idx = boundaryIndexFromId(candidate.id);
			const boundaryCount = boundaryCurveCount(gridSize, candidate.lobe);
			const isFirstBoundary = idx <= 0;
			const isLastBoundary = idx >= boundaryCount - 1;
			const prev = idx > 0 ? (overrides?.get(idForBoundary(candidate.lobe, idx - 1)) ?? getFingerById(idForBoundary(candidate.lobe, idx - 1))) : undefined;
			const next =
				idx < boundaryCount - 1
					? (overrides?.get(idForBoundary(candidate.lobe, idx + 1)) ?? getFingerById(idForBoundary(candidate.lobe, idx + 1)))
					: undefined;

		const candidateSegments = fingerToSegments(candidate);
		const candidateFirst = candidateSegments[0];
		const candidateLast = candidateSegments[candidateSegments.length - 1];
		if (!candidateFirst || !candidateLast) return false;

		const prevSegments = prev ? fingerToSegments(prev) : null;
		const nextSegments = next ? fingerToSegments(next) : null;
		const prevFirst = prevSegments?.[0];
		const prevLast = prevSegments?.[prevSegments.length - 1];
		const nextFirst = nextSegments?.[0];
			const nextLast = nextSegments?.[nextSegments.length - 1];

			if (candidate.lobe === 'left') {
				const minP0Y = isFirstBoundary ? minY : (prevFirst?.p0.y ?? minY) + orderEps;
				const maxP0Y = isLastBoundary ? maxY : (nextFirst?.p0.y ?? maxY) - orderEps;
				const minP3Y = isFirstBoundary ? minY : (prevLast?.p3.y ?? minY) + orderEps;
				const maxP3Y = isLastBoundary ? maxY : (nextLast?.p3.y ?? maxY) - orderEps;
				if (candidateFirst.p0.y < minP0Y || candidateFirst.p0.y > maxP0Y) return false;
				if (candidateLast.p3.y < minP3Y || candidateLast.p3.y > maxP3Y) return false;
			} else {
				const minP0X = isFirstBoundary ? minX : (prevFirst?.p0.x ?? minX) + orderEps;
				const maxP0X = isLastBoundary ? maxX : (nextFirst?.p0.x ?? maxX) - orderEps;
				const minP3X = isFirstBoundary ? minX : (prevLast?.p3.x ?? minX) + orderEps;
				const maxP3X = isLastBoundary ? maxX : (nextLast?.p3.x ?? maxX) - orderEps;
				if (candidateFirst.p0.x < minP0X || candidateFirst.p0.x > maxP0X) return false;
				if (candidateLast.p3.x < minP3X || candidateLast.p3.x > maxP3X) return false;
			}

		const bounds = bezierPathBBox(candidateSegments);
		const insideSquare =
			bounds.x >= minX - tol &&
			bounds.x + bounds.width <= maxX + tol &&
			bounds.y >= minY - tol &&
			bounds.y + bounds.height <= maxY + tol;
		if (!insideSquare) return false;
		if (segmentsIntersect(candidateSegments, candidateSegments, { skipAdjacent: true })) return false;

		for (const otherBase of fingers) {
			if (otherBase.id === fingerId) continue;
			const other = overrides?.get(otherBase.id) ?? otherBase;
			if (other.lobe !== candidate.lobe) continue;
			const otherSegments = fingerToSegments(other);
			if (segmentsIntersect(candidateSegments, otherSegments)) return false;
		}

		return true;
	}

	function overridesAreValid(overrides: Map<string, Finger>): boolean {
		for (const [id, candidate] of overrides) {
			if (!candidateIsValid(id, candidate, overrides)) return false;
		}
		return true;
	}

	function applyOverrides(overrides: Map<string, Finger>) {
		fingers = fingers.map((f) => overrides.get(f.id) ?? f);
	}

	function applyConstrainedUpdate(
		fingerId: string,
		buildCandidate: (current: Finger, fraction: number) => Finger,
		base?: Finger
	) {
		const current = getFingerById(fingerId);
		if (!current) return false;

		const root = base ?? current;
		const desiredPrimary = buildCandidate(root, 1);
		const desiredOverrides = deriveSymmetryOverrides(desiredPrimary);
		if (overridesAreValid(desiredOverrides)) {
			applyOverrides(desiredOverrides);
			return true;
		}

		let lo = 0;
		let hi = 1;
		let bestOverrides: Map<string, Finger> | null = null;
		for (let i = 0; i < 8; i++) {
			const mid = (lo + hi) / 2;
			const primaryCandidate = buildCandidate(root, mid);
			const overrides = deriveSymmetryOverrides(primaryCandidate);
			if (overridesAreValid(overrides)) {
				bestOverrides = overrides;
				lo = mid;
			} else {
				hi = mid;
			}
		}

		if (!bestOverrides || lo <= 0.001) return false;
		applyOverrides(bestOverrides);
		return true;
	}

	function buildGlobalCurveSamples(count: number): number[] {
		const n = Math.max(3, Math.floor(count));
		const out: number[] = [];
		for (let i = 1; i < n; i++) out.push(i / n);
		return out;
	}

	function snapAnchorDeltaQP(
		finger: Finger,
		segments: BezierSegment[],
		movedAnchors: number[],
		draggedAnchorIdx: number,
		desiredDelta: Vec
	): Vec | null {
		const n = segments.length;
		if (!n) return null;
		// Only handle internal-anchor moves here. Endpoint anchors include projection onto
		// fixed edges, which breaks the "A + w*delta" affine model used by snapSequentialQP.
		if (movedAnchors.some((idx) => idx <= 0 || idx >= n)) return null;

		const moved = new Set(movedAnchors);
		const obstacles = buildObstaclePaths(finger.id, finger.lobe);
		const { left, right, top, bottom } = getOverlapRect();
		const square = { minX: left, maxX: right, minY: top, maxY: bottom };
		const from = new Point(0, 0);
		const desired = new Point(desiredDelta.x, desiredDelta.y);

		const buildCandidateAt = (delta: Vec): Finger => {
			const segs = cloneSegments(segments);
			applyDeltaToAnchorsInSegments(finger, segs, movedAnchors, delta);
			if (symmetryWithinCurve) {
				applyWithinCurveSymmetryForMovedAnchors(finger, segs, movedAnchors, draggedAnchorIdx);
			}
			return updateFingerSegments(finger, segs);
		};

		const isValidCandidate = (candidate: Finger) => overridesAreValid(deriveSymmetryOverrides(candidate));

		const tSamples = buildGlobalCurveSamples(20);
		const sampler = (g: number) => {
			const gg = Math.max(0, Math.min(0.999999, g));
			const segFloat = gg * n;
			const segIdx = Math.min(n - 1, Math.floor(segFloat));
			const t = segFloat - segIdx;
			const seg = segments[segIdx]!;
			const u = 1 - t;
			const b0 = u * u * u;
			const b1 = 3 * u * u * t;
			const b2 = 3 * u * t * t;
			const b3 = t * t * t;

			const startMoved = moved.has(segIdx);
			const endMoved = moved.has(segIdx + 1);
			const w = (startMoved ? b0 + b1 : 0) + (endMoved ? b2 + b3 : 0);

			const A = bezierPointAt(seg, t);
			return [{ A: new Point(A.x, A.y), w }];
		};

		const out = snapSequentialQP(
			(pos: Point) => buildCandidateAt({ x: pos.x, y: pos.y }),
			from,
			desired,
			isValidCandidate,
			sampler,
			obstacles,
			square,
			{
				tSamples
			}
		);

		return { x: out.point.x, y: out.point.y };
	}

	function toPoint(v: Vec): Point {
		return new Point(v.x, v.y);
	}

	function buildObstaclePaths(targetId: string, lobe: LobeId) {
		const obs: Array<{ getNearestLocation: (p: Point) => { point: Point; distance: number } | null }> = [];
		for (const f of fingers) {
			if (f.id === targetId) continue;
			if (f.lobe !== lobe) continue;
			const segs = fingerToSegments(f);
			if (!segs.length) continue;
			obs.push({
				getNearestLocation: (p: Point) => {
					let bestDist = Infinity;
					let bestPoint: Point | null = null;
					const pv: Vec = { x: p.x, y: p.y };
					for (const seg of segs) {
						const hit = closestPointOnBezier(seg, pv);
						if (hit.distance < bestDist) {
							bestDist = hit.distance;
							bestPoint = new Point(hit.point.x, hit.point.y);
						}
					}
					return bestPoint ? { point: bestPoint, distance: bestDist } : null;
				}
			});
		}
		return obs;
	}

	function updateSegmentControlPoint(
		fingerId: string,
		segmentIndex: number,
		pointKey: 'p1' | 'p2' | 'junction',
		newPos: Vec
	): boolean {
		const finger = getFingerById(fingerId);
		if (!finger) return false;
		const segments = fingerToSegments(finger);
		if (segmentIndex < 0 || segmentIndex >= segments.length) return false;

		const isP1 = pointKey === 'p1';
		const isP2 = pointKey === 'p2';
		const isJunction = pointKey === 'junction';
		const basePos = isJunction ? segments[segmentIndex]!.p0 : isP1 ? segments[segmentIndex]!.p1 : segments[segmentIndex]!.p2;

		const applyNodeConstraint = (segs: BezierSegment[]) => {
			if (isP1) {
				if (segmentIndex <= 0) return;
				const anchorIdx = segmentIndex;
				const type = getAnchorNodeType(finger, anchorIdx);
				if (type === 'corner') return;
				const anchor = segs[segmentIndex]!.p0;
				const out = segs[segmentIndex]!.p1;
				if (isHandleCollapsed(out, anchor)) return;
				const v = vecSub(out, anchor);
				const dir = normalize(v);
				const prev = segs[segmentIndex - 1]!;
				if (isHandleCollapsed(prev.p2, anchor)) return;
				if (type === 'symmetric') {
					prev.p2 = { x: anchor.x - v.x, y: anchor.y - v.y };
				} else {
					const len = vecDist(prev.p2, anchor);
					prev.p2 = vecAdd(anchor, vecScale(dir, -len));
				}
				return;
			}

			if (isP2) {
				if (segmentIndex >= segs.length - 1) return;
				const anchorIdx = segmentIndex + 1;
				const type = getAnchorNodeType(finger, anchorIdx);
				if (type === 'corner') return;
				const anchor = segs[segmentIndex]!.p3;
				const inn = segs[segmentIndex]!.p2;
				if (isHandleCollapsed(inn, anchor)) return;
				const v = vecSub(inn, anchor);
				const dir = normalize(v);
				const next = segs[segmentIndex + 1]!;
				if (isHandleCollapsed(next.p1, anchor)) return;
				if (type === 'symmetric') {
					next.p1 = { x: anchor.x - v.x, y: anchor.y - v.y };
				} else {
					const len = vecDist(next.p1, anchor);
					next.p1 = vecAdd(anchor, vecScale(dir, -len));
				}
			}
		};

		const buildCandidateAt = (pos: Vec): Finger => {
			const segs = cloneSegments(segments);
			if (isP1) {
				segs[segmentIndex]!.p1 = pos;
				applyNodeConstraint(segs);
			} else if (isP2) {
				segs[segmentIndex]!.p2 = pos;
				applyNodeConstraint(segs);
			}
			else {
				if (segmentIndex <= 0) return finger;
				const delta = vecSub(pos, basePos);
				const seg = segs[segmentIndex]!;
				const prev = segs[segmentIndex - 1]!;
				seg.p0 = pos;
				prev.p3 = pos;
				prev.p2 = vecAdd(prev.p2, delta);
				seg.p1 = vecAdd(seg.p1, delta);
			}
			return updateFingerSegments(finger, segs);
		};

		const isValidCandidate = (candidate: Finger) => {
			if (!symmetryWithinCurve) return overridesAreValid(deriveSymmetryOverrides(candidate));
			const segs = cloneSegments(fingerToSegments(candidate));
			if (isP1 || isP2) {
				applyWithinCurveSymmetryForControlInSegments(segs, segmentIndex, isP1 ? 'p1' : 'p2');
			} else {
				applyWithinCurveSymmetryForMovedAnchors(finger, segs, [segmentIndex], segmentIndex);
			}
			const symCandidate = updateFingerSegments(candidate, segs);
			return overridesAreValid(deriveSymmetryOverrides(symCandidate));
		};

		const from = toPoint(basePos);
		const desired = toPoint(newPos);
		const { left, right, top, bottom } = getOverlapRect();
		const square = { minX: left, maxX: right, minY: top, maxY: bottom };

		let snapped: Vec = newPos;
		const obstacles = buildObstaclePaths(fingerId, finger.lobe);

		if (isP1 || isP2) {
			const seg = segments[segmentIndex]!;
			const p0 = toPoint(seg.p0);
			const p3 = toPoint(seg.p3);
			const other = toPoint(isP1 ? seg.p2 : seg.p1);
			const out = snapSequentialQPBezierControl(
				(pos: Point) => buildCandidateAt({ x: pos.x, y: pos.y }),
				from,
				desired,
				isValidCandidate,
				isP1 ? 'p1' : 'p2',
				p0,
				other,
				p3,
				obstacles,
				square
			);
			snapped = { x: out.point.x, y: out.point.y };
		} else {
			if (segmentIndex <= 0) return false;
			const prevSeg = segments[segmentIndex - 1]!;
			const nextSeg = segments[segmentIndex]!;
			const out = snapSequentialQPBezierJunction(
				(pos: Point) => buildCandidateAt({ x: pos.x, y: pos.y }),
				from,
				desired,
				isValidCandidate,
				toPoint(prevSeg.p0),
				toPoint(prevSeg.p1),
				toPoint(prevSeg.p2),
				toPoint(nextSeg.p1),
				toPoint(nextSeg.p2),
				toPoint(nextSeg.p3),
				obstacles,
				square
			);
			snapped = { x: out.point.x, y: out.point.y };
		}

		const snappedCandidate = buildCandidateAt(snapped);
		const committedSegs = cloneSegments(fingerToSegments(snappedCandidate));

		if (symmetryWithinCurve) {
			if (isP1 || isP2) {
				applyWithinCurveSymmetryForControlInSegments(committedSegs, segmentIndex, isP1 ? 'p1' : 'p2');
			} else {
				applyWithinCurveSymmetryForMovedAnchors(finger, committedSegs, [segmentIndex], segmentIndex);
			}
		}

		const committed = updateFingerSegments(finger, committedSegs);
		const overrides = deriveSymmetryOverrides(committed);
		if (!overridesAreValid(overrides)) return false;
		applyOverrides(overrides);
		return true;
	}

	function deleteSelectedAnchors() {
		if (readonly) return;
		const fingerId = selectedFingerId;
		if (!fingerId) return;
		const finger = getFingerById(fingerId);
		if (!finger) return;

		const before = snapshotState();
		const segments = fingerToSegments(finger);
		const segLen = segments.length;

		// Check if both endpoints are selected (i.e., the whole curve is selected)
		const hasFirstAnchor = selectedAnchors.includes(0);
		const hasLastAnchor = selectedAnchors.includes(segLen);
		const wholeSelected = hasFirstAnchor && hasLastAnchor && selectedAnchors.length >= 2;

		if (wholeSelected) {
			// Delete the entire curve if we have enough strips remaining
			const strips = boundaryCurveCountForLobe(finger.lobe) - 1;
			if (strips > MIN_GRID_SIZE) {
				fingers = fingers.filter((f) => f.id !== fingerId);
				if (hoverFingerId === fingerId) hoverFingerId = null;
				selectedFingerId = null;
				selectedAnchors = [];
				selectedSegments = [];
				lastCurveHit = null;
				renumberBoundaryIds();
				syncGridSizeToFingers();
				pushUndo(before);
			}
			return;
		}

		// Original logic: delete internal anchors by merging segments
		if (segLen <= 1) return;

		const toDelete = selectedAnchors
			.filter((idx) => idx >= 1 && idx <= segLen - 1)
			.slice()
			.sort((a, b) => b - a);
		if (!toDelete.length) return;

		let nextSegs = cloneSegments(segments);
		let nodeTypes = finger.nodeTypes;
		for (const anchorIdx of toDelete) {
			if (anchorIdx <= 0 || anchorIdx >= nextSegs.length) continue;
			const merged = mergeBezierSegments(nextSegs[anchorIdx - 1]!, nextSegs[anchorIdx]!);
			nextSegs.splice(anchorIdx - 1, 2, merged);
			nodeTypes = shiftNodeTypesOnDelete(nodeTypes, anchorIdx);
		}

		updateFinger(fingerId, (f) => ({ ...updateFingerSegments(f, nextSegs), nodeTypes }));
		selectedAnchors = [];
		selectedSegments = [];
		lastCurveHit = null;
		pushUndo(before);
	}

	function insertNodeBetweenSelectedAnchors() {
		if (readonly) return;
		if (!selectedFingerId) return;
		if (selectedAnchors.length !== 2) return;
		const finger = getFingerById(selectedFingerId);
		if (!finger) return;
		const segs = fingerToSegments(finger);
		const a = selectedAnchors[0]!;
		const b = selectedAnchors[1]!;
		if (Math.abs(a - b) !== 1) return;
		const segIndex = Math.min(a, b);
		if (segIndex < 0 || segIndex >= segs.length) return;
		const t =
			lastCurveHit &&
			lastCurveHit.fingerId === selectedFingerId &&
			lastCurveHit.segmentIndex === segIndex &&
			Number.isFinite(lastCurveHit.t)
				? Math.min(0.999, Math.max(0.001, lastCurveHit.t))
				: 0.5;
		insertNodeAtCurveHit({ fingerId: selectedFingerId, segmentIndex: segIndex, t });
	}

	function insertNodeAtCurveHit(hitInfo: CurveHit) {
		if (readonly) return;
		const fingerId = hitInfo.fingerId;
		const finger = getFingerById(fingerId);
		if (!finger) return;

		const n = fingerToSegments(finger).length;
		if (!n) return;
		const segIdx = Math.max(0, Math.min(n - 1, hitInfo.segmentIndex));
		const t = Math.min(0.999, Math.max(0.001, hitInfo.t));

		const before = snapshotState();

		// When within-curve symmetry is enabled, insert two nodes at symmetric positions.
		if (symmetryWithinCurve) {
			const globalT = (segIdx + t) / n;
			const mateGlobalT = 1 - globalT;

			const midpointThreshold = 0.5 / n;
			if (Math.abs(globalT - 0.5) < midpointThreshold) {
				const midSegIdx = Math.floor(n / 2);
				const midT = n % 2 === 0 ? 0.001 : 0.5;
				const inserted = insertNodeInFinger(finger, midSegIdx, midT);
				if (!inserted) return;

				let candidate = inserted.finger;
				candidate = applyWithinCurveSymmetry(candidate);
				const overrides = deriveSymmetryOverrides(candidate);
				if (!overridesAreValid(overrides)) return;
				applyOverrides(overrides);

				selectedFingerId = fingerId;
				selectedAnchors = [inserted.insertedAnchorIdx];
				selectedSegments = [];
				lastCurveHit = null;
				pushUndo(before);
				return;
			}

			const mateSegFloat = mateGlobalT * n;
			let mateSegIdx = Math.floor(mateSegFloat);
			let mateT = mateSegFloat - mateSegIdx;
			if (mateSegIdx >= n) {
				mateSegIdx = n - 1;
				mateT = 0.999;
			}
			mateT = Math.min(0.999, Math.max(0.001, mateT));

			let firstSegIdx: number, firstT: number;
			let secondSegIdx: number, secondT: number;

			if (segIdx > mateSegIdx || (segIdx === mateSegIdx && t > mateT)) {
				firstSegIdx = segIdx;
				firstT = t;
				secondSegIdx = mateSegIdx;
				secondT = mateT;
			} else {
				firstSegIdx = mateSegIdx;
				firstT = mateT;
				secondSegIdx = segIdx;
				secondT = t;
			}

			const inserted1 = insertNodeInFinger(finger, firstSegIdx, firstT);
			if (!inserted1) return;
			const inserted2 = insertNodeInFinger(inserted1.finger, secondSegIdx, secondT);
			if (!inserted2) return;

			let candidate = inserted2.finger;
			candidate = applyWithinCurveSymmetry(candidate);
			const overrides = deriveSymmetryOverrides(candidate);
			if (!overridesAreValid(overrides)) return;
			applyOverrides(overrides);

			const selectedAnchorIdx =
				segIdx > mateSegIdx || (segIdx === mateSegIdx && t > mateT)
					? inserted1.insertedAnchorIdx + 1
					: inserted2.insertedAnchorIdx;

			selectedFingerId = fingerId;
			selectedAnchors = [selectedAnchorIdx];
			selectedSegments = [];
			lastCurveHit = null;
			pushUndo(before);
			return;
		}

		const inserted = insertNodeInFinger(finger, segIdx, t);
		if (!inserted) return;

		const candidate = inserted.finger;
		const overrides = deriveSymmetryOverrides(candidate);
		if (!overridesAreValid(overrides)) return;
		applyOverrides(overrides);

		selectedFingerId = fingerId;
		selectedAnchors = [inserted.insertedAnchorIdx];
		selectedSegments = [];
		lastCurveHit = null;
		pushUndo(before);
	}

	function getSelectedSegmentIndexes(segmentsLength: number): number[] {
		const uniq = new Set<number>();
		for (const idx of selectedSegments) {
			if (Number.isFinite(idx) && idx >= 0 && idx < segmentsLength) uniq.add(idx);
		}
		if (uniq.size) return Array.from(uniq).sort((a, b) => a - b);

		if (selectedAnchors.length === 2) {
			const [a, b] = selectedAnchors;
			if (a != null && b != null && Math.abs(a - b) === 1) {
				const segIdx = Math.min(a, b);
				if (segIdx >= 0 && segIdx < segmentsLength) return [segIdx];
			}
		}
		return [];
	}

	function makeSelectedSegmentsStraight() {
		if (readonly) return;
		const fingerId = selectedFingerId;
		if (!fingerId) return;
		const finger = getFingerById(fingerId);
		if (!finger) return;

		const before = snapshotState();
		const segs = cloneSegments(fingerToSegments(finger));
		const targets = getSelectedSegmentIndexes(segs.length);
		if (!targets.length) return;

		for (const segIdx of targets) {
			const seg = segs[segIdx]!;
			seg.p1 = { ...seg.p0 };
			seg.p2 = { ...seg.p3 };
		}

		let candidate = updateFingerSegments(finger, segs);
		if (symmetryWithinCurve) candidate = applyWithinCurveSymmetry(candidate);

		const overrides = deriveSymmetryOverrides(candidate);
		if (!overridesAreValid(overrides)) return;
		applyOverrides(overrides);
		pushUndo(before);
	}

	function makeSelectedSegmentsCurved() {
		if (readonly) return;
		const fingerId = selectedFingerId;
		if (!fingerId) return;
		const finger = getFingerById(fingerId);
		if (!finger) return;

		const before = snapshotState();
		const segs = cloneSegments(fingerToSegments(finger));
		const targets = getSelectedSegmentIndexes(segs.length);
		if (!targets.length) return;

		const lengthFor = (a: Vec, b: Vec) => vecDist(a, b) / 3;
		const dirFrom = (v: Vec): Vec => {
			const d = normalize(v);
			return d.x || d.y ? d : { x: 1, y: 0 };
		};

		for (const segIdx of targets) {
			const seg = segs[segIdx]!;

			// Out handle at p0.
			if (isHandleCollapsed(seg.p1, seg.p0)) {
				let dir: Vec;
				if (segIdx > 0 && !isHandleCollapsed(segs[segIdx - 1]!.p2, seg.p0)) {
					dir = dirFrom(vecSub(seg.p0, segs[segIdx - 1]!.p2));
				} else {
					dir = dirFrom(vecSub(seg.p3, seg.p0));
				}
				const len = lengthFor(seg.p0, seg.p3);
				seg.p1 = vecAdd(seg.p0, vecScale(dir, len));
			}

			// In handle at p3.
			if (isHandleCollapsed(seg.p2, seg.p3)) {
				let dir: Vec;
				if (segIdx < segs.length - 1 && !isHandleCollapsed(segs[segIdx + 1]!.p1, seg.p3)) {
					dir = dirFrom(vecSub(seg.p3, segs[segIdx + 1]!.p1));
				} else {
					dir = dirFrom(vecSub(seg.p0, seg.p3));
				}
				const len = lengthFor(seg.p0, seg.p3);
				seg.p2 = vecAdd(seg.p3, vecScale(dir, len));
			}
		}

		let candidate = updateFingerSegments(finger, segs);
		if (symmetryWithinCurve) candidate = applyWithinCurveSymmetry(candidate);

		const overrides = deriveSymmetryOverrides(candidate);
		if (!overridesAreValid(overrides)) return;
		applyOverrides(overrides);
		pushUndo(before);
	}

	function makeSelectedAnchorsCurved() {
		if (readonly) return;
		const fingerId = selectedFingerId;
		if (!fingerId) return;
		const finger = getFingerById(fingerId);
		if (!finger) return;

		const segs = cloneSegments(fingerToSegments(finger));
		const n = segs.length;
		if (!n) return;

		const internal = selectedAnchors
			.filter((idx) => Number.isFinite(idx) && idx >= 0 && idx <= n)
			.slice()
			.sort((a, b) => a - b);
		if (!internal.length) return;

		const before = snapshotState();

		for (const anchorIdx of internal) {
			if (anchorIdx <= 0) {
				const seg = segs[0]!;
				if (isHandleCollapsed(seg.p1, seg.p0)) {
					const dir = normalize(vecSub(seg.p3, seg.p0));
					const len = vecDist(seg.p0, seg.p3) / 3;
					seg.p1 = vecAdd(seg.p0, vecScale(dir, len));
				}
				continue;
			}
			if (anchorIdx >= n) {
				const seg = segs[n - 1]!;
				if (isHandleCollapsed(seg.p2, seg.p3)) {
					const dir = normalize(vecSub(seg.p0, seg.p3));
					const len = vecDist(seg.p0, seg.p3) / 3;
					seg.p2 = vecAdd(seg.p3, vecScale(dir, len));
				}
				continue;
			}

			const prev = segs[anchorIdx - 1]!;
			const next = segs[anchorIdx]!;
			const anchor = next.p0;

			const inChord = normalize(vecSub(anchor, prev.p0));
			const outChord = normalize(vecSub(next.p3, anchor));
			const dir = normalize(vecAdd(inChord, outChord));
			if (!(dir.x || dir.y)) continue;

			if (isHandleCollapsed(prev.p2, anchor)) {
				const len = vecDist(prev.p0, anchor) / 3;
				prev.p2 = vecAdd(anchor, vecScale(dir, -len));
			}
			if (isHandleCollapsed(next.p1, anchor)) {
				const len = vecDist(anchor, next.p3) / 3;
				next.p1 = vecAdd(anchor, vecScale(dir, len));
			}
		}

		let candidate = updateFingerSegments(finger, segs);
		if (symmetryWithinCurve) candidate = applyWithinCurveSymmetry(candidate);

		const overrides = deriveSymmetryOverrides(candidate);
		if (!overridesAreValid(overrides)) return;
		applyOverrides(overrides);
		pushUndo(before);
	}

	function getAnchorNodeType(finger: Finger, anchorIdx: number): NodeType {
		return finger.nodeTypes?.[String(anchorIdx)] ?? 'corner';
	}

	function setSelectedAnchorsNodeType(type: NodeType) {
		if (readonly) return;
		const fingerId = selectedFingerId;
		if (!fingerId) return;
		const finger = getFingerById(fingerId);
		if (!finger) return;
		const segCount = fingerToSegments(finger).length;
		const targets = selectedAnchors.filter((idx) => idx >= 0 && idx <= segCount);
		if (!targets.length) return;
		const internal = targets.filter((idx) => idx >= 1 && idx <= segCount - 1);
		const before = snapshotState();

		updateFinger(fingerId, (f) => {
			const nextNodeTypes: Record<string, NodeType> = { ...(f.nodeTypes ?? {}) };
			if (type === 'corner') {
				for (const idx of targets) delete nextNodeTypes[String(idx)];
				return { ...f, nodeTypes: Object.keys(nextNodeTypes).length ? nextNodeTypes : undefined };
			}

			for (const idx of targets) nextNodeTypes[String(idx)] = type;

			const segs = cloneSegments(fingerToSegments(f));
			for (const anchorIdx of internal) {
				if (anchorIdx <= 0 || anchorIdx >= segs.length) continue;
				const prev = segs[anchorIdx - 1]!;
				const next = segs[anchorIdx]!;
				const anchor = next.p0;
				const out = next.p1;
				const inn = prev.p2;

				const vOut = vecSub(out, anchor);
				const vIn = vecSub(inn, anchor);
				const useV = vOut.x || vOut.y ? vOut : { x: -vIn.x, y: -vIn.y };
				const dir = normalize(useV);

				if (type === 'symmetric') {
					prev.p2 = { x: anchor.x - useV.x, y: anchor.y - useV.y };
				} else {
					const len = vecDist(prev.p2, anchor);
					prev.p2 = vecAdd(anchor, vecScale(dir, -len));
				}
			}

			return { ...updateFingerSegments(f, segs), nodeTypes: Object.keys(nextNodeTypes).length ? nextNodeTypes : undefined };
		});

		pushUndo(before);
	}

	// Rendering derived data
	let weaveData = $derived.by(() => (fingers.length ? computeWeaveData(fingers, gridSize, weaveParity) : null));
	let overlapCenter = $derived.by(() => {
		const o = weaveData?.overlap ?? inferOverlapRect(fingers, gridSize);
		return { x: o.left + o.width / 2, y: o.top + o.height / 2 };
	});
	let rotationTransform = $derived(`rotate(45, ${overlapCenter.x}, ${overlapCenter.y})`);
	let viewBox = $derived.by(() => {
		if (!weaveData) return `0 0 ${BASE_CANVAS_SIZE} ${BASE_CANVAS_SIZE}`;
		return computeHeartViewBoxFromOverlap(weaveData.overlap, { paddingRatio: 0.021, square: true }).viewBox;
	});

	// SVG refs + coordinate mapping
	let svgEl = $state<SVGSVGElement | null>(null);
	let rotatedGroup = $state<SVGGElement | null>(null);

	// Zoom/pan (editor mode only)
	let userZoom = $state(1.0);
	let userPanOffset = $state({ x: 0, y: 0 }); // screen px, relative to SVG center (camera-style)
	const MIN_ZOOM = 0.5;
	const MAX_ZOOM = 20.0;

	// Touch pinch tracking
	let pinchStartDistance = 0;
	let pinchStartZoom = 1.0;
	let pinchCenter = { x: 0, y: 0 };
	let pinchLastCenter = { x: 0, y: 0 };

	// Touch gestures (GitHub issue #12): a second finger turns the gesture into pan/zoom and must
	// neither continue an edit drag started by the first finger nor start a new one; a single
	// finger on empty canvas pans the heart (a tap still clears the selection).
	const touchPointerIds = new Set<number>();
	let multiTouch = false;
	let panPointer: { id: number; startX: number; startY: number; startPan: { x: number; y: number }; moved: boolean } | null =
		null;
	const PAN_TAP_SLOP = 6;

	type ViewBoxRect = { x: number; y: number; width: number; height: number };
	function parseViewBoxRect(vb: string): ViewBoxRect {
		const parts = vb.trim().split(/[\s,]+/).map(Number);
		if (parts.length !== 4) return { x: 0, y: 0, width: BASE_CANVAS_SIZE, height: BASE_CANVAS_SIZE };
		const [x, y, width, height] = parts;
		if (![x, y, width, height].every((n) => Number.isFinite(n))) {
			return { x: 0, y: 0, width: BASE_CANVAS_SIZE, height: BASE_CANVAS_SIZE };
		}
		return { x, y, width, height };
	}

		let viewBoxRect = $derived.by(() => parseViewBoxRect(viewBox));
		let measuredSize = $state<number | null>(null);
		let effectiveSize = $derived(measuredSize ?? size);
		let viewTransform = $derived.by(() => {
			const { x, y, width, height } = viewBoxRect;
			const cx = x + width / 2;
			const cy = y + height / 2;
			const scaleX = width / effectiveSize;
			const scaleY = height / effectiveSize;
			const panX = userPanOffset.x * scaleX;
			const panY = userPanOffset.y * scaleY;
			return `translate(${-panX} ${-panY}) translate(${cx} ${cy}) scale(${userZoom}) translate(${-cx} ${-cy})`;
		});

	let curveUiScale = $derived.by(() => {
		const baseScale = viewBoxRect.width / Math.max(1, effectiveSize);
		return baseScale / userZoom;
	});

		function clampPanOffset(offset: { x: number; y: number }): { x: number; y: number } {
			const rect = svgEl?.getBoundingClientRect?.();
			if (!rect) return offset;

			// The heart is rendered into a square of side `effectiveSize` inside the SVG viewport.
			// At zoom=1 it fits exactly in the smaller dimension; panning should be possible in any
			// "letterboxed" area, and at other zoom levels panning should be clamped so the content
			// can't be moved completely out of view.
			const contentSide = effectiveSize * userZoom;
			const maxX = Math.max(0, Math.abs(contentSide - rect.width) / 2);
			const maxY = Math.max(0, Math.abs(contentSide - rect.height) / 2);

			return {
				x: clamp(offset.x, -maxX, maxX),
				y: clamp(offset.y, -maxY, maxY)
			};
		}

			let segmentControlsEl = $state<HTMLDivElement | null>(null);
			let rightPanelEl = $state<HTMLDivElement | null>(null);

		// The floating toolbars used to be draggable, with their offsets kept in
		// localStorage under `paperheart.toolbarPositions.<componentId>`. The redesign
		// gives the rail and the panel fixed places over the canvas, so dragging is
		// retired deliberately and the stale key is cleaned up on mount.
		const LEGACY_TOOLBAR_POSITIONS_KEY = 'paperheart.toolbarPositions.';

		// Collapsing the right panel lets the canvas fill the width (DESIGN.md §7).
		// $lib/editor/panelState owns the persistence rules (default open, read
		// after mount, storage failures tolerated) and is tested there.
		//
		// TODO: the panel *shell* — .right-panel, .panel-collapse and .panel-tab
		// below — is page chrome and belongs in an EditorPanel.svelte beside this
		// file. It is still here because its CSS is welded to this component's
		// layout: the panel's width is one of the two insets that keep the drawing
		// area clear of it, `.paper-heart.panel-collapsed` drives both the tab and
		// the other inset, and three media queries restyle all of them together.
		// Moving the markup without moving the canvas layout would replace those
		// rules with a wider :global() contract than the one it removes; do it when
		// the canvas layout itself is split out.
		let panelCollapsed = $state(false);
		// Both controls stay mounted (the tab is hidden with CSS while the panel is
		// open), so collapsing from the keyboard can hand focus to the other one
		// instead of dropping it on <body>.
		let panelCollapseButtonEl = $state<HTMLButtonElement | null>(null);
		let panelTabEl = $state<HTMLButtonElement | null>(null);
		let panelId = $derived(`editor-panel-${componentId}`);

		function setPanelCollapsed(next: boolean) {
			panelCollapsed = next;
			writePanelCollapsed(next);
			// Only chase the focus that the control we just hid was holding.
			const moving = typeof document !== 'undefined' && document.activeElement;
			if (moving !== panelCollapseButtonEl && moving !== panelTabEl) return;
			tick().then(() => (next ? panelTabEl : panelCollapseButtonEl)?.focus());
		}

		/** Reset zoom and pan so the whole heart is back in view. */
		function fitView() {
			userZoom = 1;
			userPanOffset = { x: 0, y: 0 };
		}

	function handleWheel(event: WheelEvent) {
		if (readonly) return;
		if (!svgEl) return;
		// Trackpad pinch gestures fire wheel events with ctrlKey=true.
		// Mouse wheels often report deltaMode=1 (lines) and should zoom by default.
		const isLineWheel = event.deltaMode === 1;
		if (event.ctrlKey || isLineWheel) {
			event.preventDefault();
			const zoomScale = isLineWheel ? 0.05 : 0.01;
			const delta = -event.deltaY * zoomScale;
			const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, userZoom * (1 + delta)));
			if (newZoom !== userZoom) {
				const rect = svgEl.getBoundingClientRect();
				const cursorX = event.clientX - rect.left - rect.width / 2;
				const cursorY = event.clientY - rect.top - rect.height / 2;
				const zoomDiff = 1 / userZoom - 1 / newZoom;
				userZoom = newZoom;
				userPanOffset = clampPanOffset({
					x: userPanOffset.x + cursorX * zoomDiff,
					y: userPanOffset.y + cursorY * zoomDiff
				});
			}
		} else {
			// Two-finger scroll for panning (trackpad / precision wheel). Only prevent scrolling
			// the page if we actually apply a pan.
			const next = clampPanOffset({
				x: userPanOffset.x + event.deltaX,
				y: userPanOffset.y + event.deltaY
			});
			if (next.x !== userPanOffset.x || next.y !== userPanOffset.y) {
				event.preventDefault();
				userPanOffset = next;
			}
		}
	}

	function getTouchDistance(touches: TouchList): number {
		if (touches.length < 2) return 0;
		const dx = touches[0]!.clientX - touches[1]!.clientX;
		const dy = touches[0]!.clientY - touches[1]!.clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function getTouchCenter(touches: TouchList): { x: number; y: number } {
		if (touches.length < 2) return { x: 0, y: 0 };
		return {
			x: (touches[0]!.clientX + touches[1]!.clientX) / 2,
			y: (touches[0]!.clientY + touches[1]!.clientY) / 2
		};
	}

	function handleTouchStart(event: TouchEvent) {
		if (readonly) return;
		if (!svgEl) return;
		if (event.touches.length >= 2) {
			beginMultiTouch();
			pinchStartDistance = getTouchDistance(event.touches);
			pinchStartZoom = userZoom;
			const rect = svgEl.getBoundingClientRect();
			const center = getTouchCenter(event.touches);
			pinchCenter = {
				x: center.x - rect.left - rect.width / 2,
				y: center.y - rect.top - rect.height / 2
			};
			pinchLastCenter = center;
		}
	}

	function handleTouchMove(event: TouchEvent) {
		if (readonly) return;
		// (No preventDefault: Svelte registers touch handlers as passive, and the svg's
		// touch-action: none already keeps the browser from scrolling or zooming the page.)
		if (event.touches.length === 2 && pinchStartDistance > 0) {
			const currentDistance = getTouchDistance(event.touches);
			const scale = currentDistance / pinchStartDistance;
			const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStartZoom * scale));
			// Two fingers also pan: follow the drift of their midpoint.
			const center = getTouchCenter(event.touches);
			let next = {
				x: userPanOffset.x - (center.x - pinchLastCenter.x),
				y: userPanOffset.y - (center.y - pinchLastCenter.y)
			};
			pinchLastCenter = center;
			if (newZoom !== userZoom) {
				const zoomDiff = 1 / userZoom - 1 / newZoom;
				userZoom = newZoom;
				next = { x: next.x + pinchCenter.x * zoomDiff, y: next.y + pinchCenter.y * zoomDiff };
			}
			userPanOffset = clampPanOffset(next);
		}
	}

	function handleTouchEnd(event: TouchEvent) {
		if (readonly) return;
		if (event.touches.length < 2) pinchStartDistance = 0;
		// touchend always reaches the element the touch started on, so this is the reliable
		// place to notice that the whole gesture is over.
		if (event.touches.length === 0) {
			touchPointerIds.clear();
			multiTouch = false;
		}
	}

	// Revert whatever an unfinished drag changed (no undo entry) and forget the drag.
	function cancelActiveDrag() {
		if (activePointerId == null) return;
		const pointerId = activePointerId;
		const snapshot = dragSnapshot;
		const dirty = dragDirty;
		activePointerId = null;
		dragStartPointer = null;
		dragStartOffset = null;
		dragSnapshot = null;
		dragDirty = false;
		dragTarget = null;
		try {
			svgEl?.releasePointerCapture?.(pointerId);
		} catch {
			// Ignore pointer release failures.
		}
		if (dirty && snapshot) restoreSnapshot(snapshot);
	}

	function beginMultiTouch() {
		multiTouch = true;
		cancelActiveDrag();
		panPointer = null;
	}

	// Runs before the curve/anchor/handle handlers (capture phase) so a second finger cannot
	// select or start dragging anything: from then on the gesture is pan/zoom only.
	function handleSvgPointerDownCapture(e: PointerEvent) {
		if (readonly || e.pointerType === 'mouse') return;
		touchPointerIds.add(e.pointerId);
		if (touchPointerIds.size >= 2 || multiTouch) {
			beginMultiTouch();
			e.stopPropagation();
		}
	}

	function beginPan(e: PointerEvent) {
		panPointer = {
			id: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			startPan: { x: userPanOffset.x, y: userPanOffset.y },
			moved: false
		};
		try {
			svgEl?.setPointerCapture?.(e.pointerId);
		} catch {
			// Ignore pointer capture failures.
		}
	}

	function clearSelection() {
		selectedFingerId = null;
		selectedAnchors = [];
		selectedSegments = [];
		lastCurveHit = null;
	}

	function localPointFromClient(clientX: number, clientY: number): Vec | null {
		const ctm = rotatedGroup?.getScreenCTM?.();
		if (!ctm) return null;
		const inv = ctm.inverse();
		const p = new DOMPoint(clientX, clientY).matrixTransform(inv);
		return { x: p.x, y: p.y };
	}

	function computeCurveHit(fingerId: string, p: Vec): CurveHit | null {
		const finger = getFingerById(fingerId);
		if (!finger) return null;
		const segs = fingerToSegments(finger);
		if (!segs.length) return null;
		let bestIdx = 0;
		let bestT = 0;
		let bestD = Infinity;
		for (let i = 0; i < segs.length; i++) {
			const hit = closestPointOnBezier(segs[i]!, p);
			if (hit.distance < bestD) {
				bestD = hit.distance;
				bestIdx = i;
				bestT = hit.t;
			}
		}
		return { fingerId, segmentIndex: bestIdx, t: bestT };
	}

	function beginDrag(e: PointerEvent, target: DragTarget) {
		if (readonly) return;
		activePointerId = e.pointerId;
		try {
			svgEl?.setPointerCapture?.(e.pointerId);
		} catch {
			// Ignore pointer capture failures.
		}
		dragTarget = target;
		dragSnapshot = snapshotState();
		dragDirty = false;
		dragStartPointer = localPointFromClient(e.clientX, e.clientY);
		dragStartOffset = null;
		if (dragStartPointer && target?.kind === 'control') {
			const baseFinger = getDragBaseFinger(target.fingerId);
			const baseSegs = baseFinger ? fingerToSegments(baseFinger) : null;
			if (baseSegs) {
				if (typeof target.anchorIdx === 'number') {
					const anchors = getAnchorPositions(baseSegs);
					const anchor = anchors[target.anchorIdx];
					if (anchor) dragStartOffset = vecSub(anchor, dragStartPointer);
				} else if (typeof target.segmentIndex === 'number' && target.handle) {
					const seg = baseSegs[target.segmentIndex];
					if (seg) {
						const handlePos = target.handle === 'p1' ? seg.p1 : seg.p2;
						dragStartOffset = vecSub(handlePos, dragStartPointer);
					}
				}
			}
		}
	}

	function endDrag(pointerId: number) {
		if (activePointerId !== pointerId) return;
		activePointerId = null;
		dragStartPointer = null;
		dragStartOffset = null;
		try {
			svgEl?.releasePointerCapture?.(pointerId);
		} catch {
			// Ignore pointer release failures.
		}
		if (dragDirty && dragSnapshot) pushUndo(dragSnapshot);
		dragSnapshot = null;
		dragDirty = false;
		dragTarget = null;
	}

	function handleFingerPointerDown(e: PointerEvent, fingerId: string) {
		if (readonly) return;
		e.stopPropagation();
		const p = localPointFromClient(e.clientX, e.clientY);
		if (!p) return;
		const now = performance.now();
		if (
			lastFingerClickId === fingerId &&
			lastFingerClickPos &&
			now - lastFingerClickAt <= DOUBLE_CLICK_MS &&
			vecDist(lastFingerClickPos, p) <= DOUBLE_CLICK_DIST
		) {
			lastFingerClickAt = 0;
			lastFingerClickId = null;
			lastFingerClickPos = null;
			selectedFingerId = fingerId;
			selectedAnchors = [];
			selectedSegments = [];
			const hit = computeCurveHit(fingerId, p);
			if (!hit) return;
			lastCurveHit = hit;
			insertNodeAtCurveHit(hit);
			return;
		}
		lastFingerClickAt = now;
		lastFingerClickId = fingerId;
		lastFingerClickPos = p;
		if (selectedFingerId !== fingerId) {
			selectedAnchors = [];
			selectedSegments = [];
			lastCurveHit = null;
		}
		selectedFingerId = fingerId;

		const finger = getFingerById(fingerId);
		const segLen = finger ? fingerToSegments(finger).length : 0;
		const hit = computeCurveHit(fingerId, p);
		lastCurveHit = hit;

		const curveIdx = hit?.segmentIndex;
		if (curveIdx != null && Number.isFinite(curveIdx)) {
			const a = Math.max(0, Math.min(segLen, curveIdx));
			const b = Math.max(0, Math.min(segLen, curveIdx + 1));

			if (!e.shiftKey) {
				selectedAnchors = a === b ? [a] : [a, b];
				selectedSegments = a < segLen ? [a] : [];
			} else {
				const segIdx = a;
				const anchorsToToggle = a === b ? [a] : [a, b];
				for (const idx of anchorsToToggle) selectedAnchors = toggleNumberInList(selectedAnchors, idx);
				if (segIdx < segLen) selectedSegments = toggleNumberInList(selectedSegments, segIdx);
			}
		} else if (!e.shiftKey && segLen > 0) {
			selectedAnchors = [0, segLen];
			selectedSegments = [];
		}
		beginDrag(e, { kind: 'path', fingerId });
	}

	const HIT_STROKE_WIDTH = 14;

	function handleAnchorPointerDown(e: PointerEvent, fingerId: string, anchorIdx: number) {
		if (readonly) return;
		e.stopPropagation();
		selectedFingerId = fingerId;
		selectedSegments = [];
		lastCurveHit = null;
		if (e.shiftKey) {
			selectedAnchors = toggleNumberInList(selectedAnchors, anchorIdx);
		} else {
			selectedAnchors = [anchorIdx];
		}
		beginDrag(e, { kind: 'control', fingerId, anchorIdx });
	}

	function handleHandlePointerDown(
		e: PointerEvent,
		fingerId: string,
		segmentIndex: number,
		handle: 'p1' | 'p2'
	) {
		if (readonly) return;
		e.stopPropagation();
		selectedFingerId = fingerId;
		selectedSegments = [];
		lastCurveHit = null;
		beginDrag(e, { kind: 'control', fingerId, segmentIndex, handle });
	}

	// Pointer down on empty canvas (curves, anchors and handles stop propagation before this).
	function handleSvgPointerDown(e: PointerEvent) {
		if (readonly) return;
		if (multiTouch) return;
		if (e.pointerType !== 'mouse') {
			// One finger on empty canvas pans; whether it was a tap (deselect) is known on release.
			beginPan(e);
			return;
		}
		clearSelection();
	}

	function handleSvgPointerMove(e: PointerEvent) {
		if (readonly) return;
		if (panPointer && e.pointerId === panPointer.id) {
			const dx = e.clientX - panPointer.startX;
			const dy = e.clientY - panPointer.startY;
			if (!panPointer.moved && dx * dx + dy * dy < PAN_TAP_SLOP * PAN_TAP_SLOP) return;
			panPointer.moved = true;
			// Camera-style offset: the content follows the finger.
			userPanOffset = clampPanOffset({ x: panPointer.startPan.x - dx, y: panPointer.startPan.y - dy });
			return;
		}
		if (multiTouch) return;
		if (activePointerId == null || e.pointerId !== activePointerId) return;
		if (!dragTarget) return;
		const p = localPointFromClient(e.clientX, e.clientY);
		if (!p) return;

		if (dragTarget.kind === 'path') {
			if (!dragStartPointer) return;
			const finger = getDragBaseFinger(dragTarget.fingerId);
			if (!finger) return;
			const delta = vecSub(p, dragStartPointer);
			const ok = applyConstrainedUpdate(
				dragTarget.fingerId,
				(current, fraction) => {
				const { left: minX, right: maxX, top: minY, bottom: maxY } = getOverlapRect();
				const segs = cloneSegments(fingerToSegments(current));
				if (!segs.length) return current;
				const first = segs[0]!;
				const last = segs[segs.length - 1]!;

				let dx = delta.x;
				let dy = delta.y;

				if (current.lobe === 'left') {
					dx = 0;
					const dyMin = minY - Math.min(first.p0.y, last.p3.y);
					const dyMax = maxY - Math.max(first.p0.y, last.p3.y);
					dy = clamp(delta.y, dyMin, dyMax);
				} else {
					dy = 0;
					const dxMin = minX - Math.min(first.p0.x, last.p3.x);
					const dxMax = maxX - Math.max(first.p0.x, last.p3.x);
					dx = clamp(delta.x, dxMin, dxMax);
				}

				dx *= fraction;
				dy *= fraction;

				for (const seg of segs) {
					seg.p0 = { x: seg.p0.x + dx, y: seg.p0.y + dy };
					seg.p1 = { x: seg.p1.x + dx, y: seg.p1.y + dy };
					seg.p2 = { x: seg.p2.x + dx, y: seg.p2.y + dy };
					seg.p3 = { x: seg.p3.x + dx, y: seg.p3.y + dy };
				}

				// Keep endpoints snapped to the correct edges (and preserve tangents).
				const nextP0 = projectEndpoint(current, segs[0]!.p0, 'p0');
				if (nextP0.x !== segs[0]!.p0.x || nextP0.y !== segs[0]!.p0.y) {
					const d = vecSub(nextP0, segs[0]!.p0);
					segs[0]!.p0 = nextP0;
					segs[0]!.p1 = vecAdd(segs[0]!.p1, d);
				}
				const nextP3 = projectEndpoint(current, segs[segs.length - 1]!.p3, 'p3');
				if (nextP3.x !== segs[segs.length - 1]!.p3.x || nextP3.y !== segs[segs.length - 1]!.p3.y) {
					const d = vecSub(nextP3, segs[segs.length - 1]!.p3);
					segs[segs.length - 1]!.p3 = nextP3;
					segs[segs.length - 1]!.p2 = vecAdd(segs[segs.length - 1]!.p2, d);
				}

				return updateFingerSegments(current, segs);
				},
				finger
			);
			if (!ok) return;
			dragDirty = true;
			return;
		}

		if (dragTarget.kind === 'control') {
			if (typeof dragTarget.anchorIdx === 'number') {
				const anchorIdx = dragTarget.anchorIdx;
				const anchorsToMove = selectedAnchors.includes(anchorIdx) ? selectedAnchors : [anchorIdx];
				const offset = dragStartOffset ?? { x: 0, y: 0 };
				// If a single internal junction is dragged, use QP snapping (matches Paper editor diamond).
				if (anchorsToMove.length === 1) {
					const finger = getDragBaseFinger(dragTarget.fingerId);
					const segs = finger ? fingerToSegments(finger) : null;
					const n = segs?.length ?? 0;
					if (finger && segs && anchorIdx > 0 && anchorIdx < n) {
						const raw = vecAdd(p, offset);
						const desired = snapTargetForAnchor(finger.lobe, raw) ?? raw;
						const ok = updateSegmentControlPoint(dragTarget.fingerId, anchorIdx, 'junction', desired);
						if (!ok) return;
						dragDirty = true;
						return;
					}
				}

				if (!dragStartPointer) return;
				const delta = vecSub(p, dragStartPointer);
				const finger = getDragBaseFinger(dragTarget.fingerId);
				const baseSegs = finger ? fingerToSegments(finger) : null;
				if (finger && baseSegs && baseSegs.length) {
					const snappedDelta = snapAnchorDeltaQP(finger, baseSegs, anchorsToMove, anchorIdx, delta);
					if (snappedDelta) {
						const segs = cloneSegments(baseSegs);
						applyDeltaToAnchorsInSegments(finger, segs, anchorsToMove, snappedDelta);
						if (symmetryWithinCurve) {
							applyWithinCurveSymmetryForMovedAnchors(finger, segs, anchorsToMove, anchorIdx);
						}
						const candidate = updateFingerSegments(finger, segs);
						const overrides = deriveSymmetryOverrides(candidate);
						if (!overridesAreValid(overrides)) return;
						applyOverrides(overrides);
						dragDirty = true;
						return;
					}
				}

				const ok = applyConstrainedUpdate(
					dragTarget.fingerId,
					(current, fraction) => {
						const segs = cloneSegments(fingerToSegments(current));
						if (!segs.length) return current;
						const d = vecScale(delta, fraction);
						applyDeltaToAnchorsInSegments(current, segs, anchorsToMove, d);
						// Snap only the full move of a single endpoint; partial moves come from the
						// binary search for a valid position and must stay on the pointer's line.
						if (fraction === 1 && anchorsToMove.length === 1) snapEndpointAnchor(current, segs, anchorIdx);
						if (symmetryWithinCurve) {
							applyWithinCurveSymmetryForMovedAnchors(current, segs, anchorsToMove, anchorIdx);
						}
						return updateFingerSegments(current, segs);
					},
					finger ?? undefined
				);
				if (!ok) return;
				dragDirty = true;
				return;
			}

			if (typeof dragTarget.segmentIndex === 'number' && dragTarget.handle) {
				const offset = dragStartOffset ?? { x: 0, y: 0 };
				const desired = vecAdd(p, offset);
				const ok = updateSegmentControlPoint(dragTarget.fingerId, dragTarget.segmentIndex, dragTarget.handle, desired);
				if (!ok) return;
				dragDirty = true;
				return;
			}
		}
	}

	function handleSvgPointerUp(e: PointerEvent) {
		if (readonly) return;
		if (e.pointerType !== 'mouse') {
			touchPointerIds.delete(e.pointerId);
			if (touchPointerIds.size === 0) multiTouch = false;
		}
		if (panPointer && e.pointerId === panPointer.id) {
			const wasTap = !panPointer.moved;
			panPointer = null;
			try {
				svgEl?.releasePointerCapture?.(e.pointerId);
			} catch {
				// Ignore pointer release failures.
			}
			if (wasTap && e.type === 'pointerup') clearSelection();
			return;
		}
		if (activePointerId == null || e.pointerId !== activePointerId) return;

		// snap dragged handle to anchor if close
		if (dragTarget?.kind === 'control' && dragTarget.handle && typeof dragTarget.segmentIndex === 'number') {
			const { fingerId, segmentIndex, handle: handleKey } = dragTarget;
			const finger = getFingerById(fingerId);
			if (finger) {
				const segs = fingerToSegments(finger);
				const seg = segs[segmentIndex];
				if (seg) {
					const anchor = handleKey === 'p1' ? seg.p0 : seg.p3;
					const handle = handleKey === 'p1' ? seg.p1 : seg.p2;
					if (vecDist(handle, anchor) <= HANDLE_SNAP_EPS) {
						const snapped = updateSegmentControlPoint(fingerId, segmentIndex, handleKey, anchor);
						if (snapped) dragDirty = true;
					}
				}
			}
		}

		if (dragTarget?.kind === 'path') {
			clampEndpoints(dragTarget.fingerId);
		}

		// Structural reconcile: keep dummy outer curves at all four edges, and allow
		// "remove by dragging to edge" to avoid stacking curves on top of an outer curve.
		if (dragDirty && reconcileBoundaryCurves({ allowEdgeRemoval: true })) {
			dragDirty = true;
		}

		endDrag(e.pointerId);
	}

	// init from props
		$effect.pre(() => {
			if (didInit) return;
			didInit = true;
			gridSize = normalizeGridSize(initialGridSize);
			weaveParity = normalizeWeaveParity(initialWeaveParity);
			designColors = initialColors ? { ...initialColors } : null;
			const has = initialFingers && initialFingers.length > 0;
			fingers = has ? initialFingers!.map(cloneFinger) : createDefaultFingers(gridSize);
			// Always include the four outer boundary curves (legacy designs omitted them),
			// and normalize boundary IDs/order to match editor invariants.
			reconcileBoundaryCurves({ forceRenumber: true });
			if (has) {
				const detected = detectSymmetryModes(fingers);
				withinCurveMode = detected.withinCurveMode;
				withinLobeMode = detected.withinLobeMode;
				betweenLobesMode = canSymmetryBetweenLobes() ? detected.betweenLobesMode : 'off';
				prevWithinCurveMode = withinCurveMode;
				prevWithinLobeMode = withinLobeMode;
				prevBetweenLobesMode = betweenLobesMode;
			}
		});

	$effect(() => {
		// Only apply when symmetry is enabled/changed (turning off does not mutate).
		const shouldApply =
			(withinCurveMode !== 'off' && withinCurveMode !== prevWithinCurveMode) ||
			(withinLobeMode !== 'off' && withinLobeMode !== prevWithinLobeMode) ||
			(betweenLobesMode !== 'off' && betweenLobesMode !== prevBetweenLobesMode);

		const oldSymmetry = {
			withinCurveMode: prevWithinCurveMode,
			withinLobeMode: prevWithinLobeMode,
			betweenLobesMode: prevBetweenLobesMode
		};

		prevWithinCurveMode = withinCurveMode;
		prevWithinLobeMode = withinLobeMode;
		prevBetweenLobesMode = betweenLobesMode;

		if (!shouldApply) return;
		if (readonly || !didInit) return;

		const applySymmetryToAllFingers = () => {
			let updated = fingers.map(cloneFinger);

			if (symmetryWithinCurve) {
				updated = updated.map((f) => applyWithinCurveSymmetry(f));
			}

			if (symmetryBetweenLobes) {
				if (!canSymmetryBetweenLobes()) {
					betweenLobesMode = 'off';
				} else {
					const leftFingers = updated.filter((f) => f.lobe === 'left');
					for (const leftFinger of leftFingers) {
						const idx = boundaryIndexFromId(leftFinger.id);
						const rightId = idForBoundary('right', mateBoundaryIndexBetweenLobes('left', idx));
						const rightIdx = updated.findIndex((f) => f.id === rightId);
						if (rightIdx >= 0) {
							updated[rightIdx] = mapFinger(
								leftFinger,
								rightId,
								'right',
								(p) => swapPointBetweenLobesWithMode(p, antiBetweenLobes),
								antiBetweenLobes
							);
						}
					}
				}
			}

			if (symmetryWithinLobe) {
				for (const lobe of ['left', 'right'] as const) {
					const internal = boundaryCurveCountForLobe(lobe);
					const lobeFingers = updated.filter((f) => f.lobe === lobe);
					for (const finger of lobeFingers) {
						const idx = boundaryIndexFromId(finger.id);
						const mirrorIdx = mirrorBoundaryIndex(lobe, idx);
						if (mirrorIdx > idx && mirrorIdx >= 0 && mirrorIdx < internal) {
							const mirrorId = idForBoundary(lobe, mirrorIdx);
							const mirrorArrayIdx = updated.findIndex((f) => f.id === mirrorId);
							if (mirrorArrayIdx >= 0) {
								updated[mirrorArrayIdx] = mapFinger(
									finger,
									mirrorId,
									lobe,
									(p) => mirrorPointWithinLobeWithMode(lobe, p, antiWithinLobe),
									antiWithinLobe
								);
							}
						}
					}
				}
			}

			fingers = updated;
		};

		const before = snapshotState();
		before.symmetry = oldSymmetry;
		applySymmetryToAllFingers();
		pushUndo(before);
	});

		$effect(() => {
			if (!didInit) return;
			if (onFingersChange) onFingersChange(fingers, gridSize, weaveParity);
		});

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		if (target.isContentEditable) return true;
		const tag = target.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (readonly) return;
		// Leave text fields alone: Backspace/Delete/undo/redo there belong to the field.
		if (isEditableTarget(e.target)) return;
		if (e.key === 'Escape') {
			selectedFingerId = null;
			selectedAnchors = [];
			selectedSegments = [];
			lastCurveHit = null;
			return;
		}

		const isMod = e.metaKey || e.ctrlKey;
		if (isMod && (e.key === 'z' || e.key === 'Z')) {
			e.preventDefault();
			if (e.shiftKey) redo();
			else undo();
			return;
		}
		if (isMod && (e.key === 'y' || e.key === 'Y')) {
			e.preventDefault();
			redo();
			return;
		}

		if (e.key === 'Backspace' || e.key === 'Delete') {
			e.preventDefault();
			deleteSelectedAnchors();
		}
	}

	onMount(() => {
		storeColors = getColors();
		const unsub = subscribeColors((c) => (storeColors = c));
		if (!readonly && typeof window !== 'undefined') {
			window.addEventListener('keydown', handleKeyDown);
			try {
				firstVisitHintDismissed = localStorage.getItem(FIRST_VISIT_HINT_KEY) === '1';
			} catch {
				// Storage unavailable: show the tip on every visit.
				firstVisitHintDismissed = false;
			}
			panelCollapsed = readPanelCollapsed();
			try {
				// Retired feature: drop the draggable-toolbar offsets if they are still there.
				localStorage.removeItem(`${LEGACY_TOOLBAR_POSITIONS_KEY}${componentId}`);
			} catch {
				// Storage unavailable: nothing to clean up.
			}
		}
		return () => {
			if (!readonly && typeof window !== 'undefined') {
				window.removeEventListener('keydown', handleKeyDown);
			}
			unsub();
		};
	});

			onMount(() => {
				if (!fullPage) return;

			try {
				isMobileLayout = window.matchMedia(NARROW_QUERY).matches;
			} catch {
				// matchMedia unavailable: assume the desktop layout.
			}

		const measure = () => {
			const rect = svgEl?.getBoundingClientRect?.();
			if (!rect) return;
			const px = Math.max(100, Math.min(rect.width, rect.height));
			measuredSize = px;
		};

		let ro: ResizeObserver | null = null;
		try {
			ro = new ResizeObserver(measure);
			if (svgEl) ro.observe(svgEl);
		} catch {
			// Ignore scroll failures for off-screen targets.
		}

		(async () => {
			await tick();
			measure();
		})();

			window.addEventListener('resize', measure);

			return () => {
				ro?.disconnect();
				window.removeEventListener('resize', measure);
			};
		});

	// UI derived
	let selectedFinger = $derived(selectedFingerId ? getFingerById(selectedFingerId) : undefined);
	let selectedSegCount = $derived(selectedFinger ? fingerToSegments(selectedFinger).length : 0);
	let canInsertNode = $derived(selectedAnchors.length === 2 && Math.abs(selectedAnchors[0]! - selectedAnchors[1]!) === 1);
	let canDeleteNode = $derived(selectedAnchors.some((idx) => idx >= 1 && idx <= selectedSegCount - 1));
	let validAnchors = $derived(selectedAnchors.filter((idx) => idx >= 0 && idx <= selectedSegCount));
	let selectedSegs = $derived(getSelectedSegmentIndexes(selectedSegCount));
	let canMakeSegmentsStraight = $derived(selectedSegs.length > 0);
	let canMakeSegmentsCurved = $derived(selectedSegs.length > 0);
	// Strips beyond PRECISION_GRID_SIZE are allowed (up to MAX_GRID_SIZE) but hard to cut accurately.
	let hasManyStrips = $derived(gridSize.x > PRECISION_GRID_SIZE || gridSize.y > PRECISION_GRID_SIZE);
	// Explain the red curves (GitHub issue #7): shown only while a conflict exists.
	let hasIntersectionIssues = $derived(issueFingerIds.size > 0);

	// First-visit tip on how to add strips and nodes (GitHub issue #7). Dismissal is remembered
	// per browser; default to dismissed so the server render and hydration agree.
	const FIRST_VISIT_HINT_KEY = 'paperheart.hintDismissed';
	let firstVisitHintDismissed = $state(true);

	function dismissFirstVisitHint() {
		firstVisitHintDismissed = true;
		try {
			localStorage.setItem(FIRST_VISIT_HINT_KEY, '1');
		} catch {
			// Ignore failed storage writes; the tip simply shows again next time.
		}
	}
	let nodeTypeSelected = $derived.by(() => {
		if (!selectedFinger || !validAnchors.length) return null;
		const t0 = getAnchorNodeType(selectedFinger, validAnchors[0]!);
		for (const a of validAnchors.slice(1)) if (getAnchorNodeType(selectedFinger, a) !== t0) return null;
		return t0;
	});

	// Canvas chrome (DESIGN.md §7): what is selected, top right, and the strip count,
	// bottom left. `stripsCount` is the shared '{n} striber' key; the grid fills in '3 × 3'.
	let selectedNodeTypeLabel = $derived(
		nodeTypeSelected === 'corner'
			? tr('editorCornerNode')
			: nodeTypeSelected === 'smooth'
				? tr('editorSmoothNode')
				: nodeTypeSelected === 'symmetric'
					? tr('editorSymmetricNode')
					: null
	);
	let stripsLabel = $derived(formatStrips(gridSize, lang));

	let visibleAnchorSet = $derived.by(() => {
		const set = new Set<number>();
		for (const idx of selectedAnchors) {
			set.add(idx);
			set.add(idx - 1);
			set.add(idx + 1);
		}
		const n = selectedSegCount;
		for (const segIdx of selectedSegs) {
			if (!Number.isFinite(segIdx)) continue;
			if (segIdx < 0 || segIdx >= n) continue;
			const a = segIdx;
			const b = segIdx + 1;
			set.add(a);
			set.add(b);
			set.add(Math.max(0, a - 1));
			set.add(Math.min(n, b + 1));
		}
		return set;
	});

	let visibleAnchorsSorted = $derived.by(() => {
		if (!selectedFinger) return [];
		const n = fingerToSegments(selectedFinger).length;
		return Array.from(visibleAnchorSet)
			.filter((idx) => idx >= 0 && idx <= n)
			.sort((a, b) => a - b);
	});

	// Mobile layout: make the canvas area fill the remaining viewport height below the header,
	// so bottom controls sit at the bottom of the screen (but scroll away with the canvas).
		let canvasAreaEl: HTMLDivElement | null = null;
		let mobileCanvasMinHeight = $state<string | null>(null);
		let isMobileLayout = $state(false);

	function updateMobileCanvasMinHeight() {
		if (!canvasAreaEl) return;
		if (typeof window === 'undefined') return;
		isMobileLayout = window.matchMedia(NARROW_QUERY).matches;
		if (!isMobileLayout) {
			mobileCanvasMinHeight = null;
			return;
		}

		const top = canvasAreaEl.getBoundingClientRect().top;
		const available = Math.max(0, window.innerHeight - top);
		mobileCanvasMinHeight = `${available}px`;
	}

	onMount(() => {
		updateMobileCanvasMinHeight();
		window.addEventListener('resize', updateMobileCanvasMinHeight, { passive: true });
		return () => window.removeEventListener('resize', updateMobileCanvasMinHeight);
	});

	// Narrow screens (<= 900px) float the tool rail above and the panels below the canvas.
	// Measure them so the heart is laid out in the free band between them instead of underneath.
	let mobileClearance = $state<{ top: number; bottom: number } | null>(null);
	// Below 900px the toolbar sits on top of the canvas, so canvas notices go directly under it.
	let mobileNoticeTop = $state<number | null>(null);

	function updateMobileClearance() {
		if (!fullPage || readonly || !canvasAreaEl || typeof window === 'undefined') {
			mobileClearance = null;
			mobileNoticeTop = null;
			return;
		}
		const gap = 8;
		mobileNoticeTop =
			segmentControlsEl && window.matchMedia(NARROW_QUERY).matches
				? Math.round(segmentControlsEl.offsetTop + segmentControlsEl.offsetHeight + gap)
				: null;
		// The stacked layout starts at 900px, not 600px: the panels are opaque cards
		// painted over the canvas, so the heart needs the free band from here down.
		if (!window.matchMedia(NARROW_QUERY).matches) {
			mobileClearance = null;
			return;
		}
		const top = segmentControlsEl ? segmentControlsEl.offsetTop + segmentControlsEl.offsetHeight + gap : 0;
		const bottom = rightPanelEl ? canvasAreaEl.clientHeight - rightPanelEl.offsetTop + gap : 0;
		const next = { top: Math.max(0, Math.round(top)), bottom: Math.max(0, Math.round(bottom)) };
		if (mobileClearance && mobileClearance.top === next.top && mobileClearance.bottom === next.bottom) return;
		mobileClearance = next;
	}

	onMount(() => {
		if (!fullPage || readonly) return;
		const schedule = () => {
			tick().then(updateMobileClearance);
		};
		let ro: ResizeObserver | null = null;
		try {
			ro = new ResizeObserver(schedule);
			if (segmentControlsEl) ro.observe(segmentControlsEl);
			if (rightPanelEl) ro.observe(rightPanelEl);
			if (canvasAreaEl) ro.observe(canvasAreaEl);
		} catch {
			// ResizeObserver unavailable; window resize still updates the clearance.
		}
		window.addEventListener('resize', schedule, { passive: true });
		schedule();
		return () => {
			ro?.disconnect();
			window.removeEventListener('resize', schedule);
		};
	});
</script>

	<!--
		One tool-rail button: a 44px icon button with a tooltip (DESIGN.md §7).
		`pressed` turns it into a toggle (the three node types); the tooltip trigger
		wraps the button in a span so disabled buttons still show their tooltip.
	-->
	{#snippet toolButton(o: {
		label: string;
		tip?: string;
		icon: Component<IconProps>;
		onclick: () => void;
		disabled?: boolean;
		pressed?: boolean;
	})}
		{@const Icon = o.icon}
		<Tooltip>
			<TooltipTrigger>
				{#snippet child({ props })}
					<!-- The wrapper carries the tooltip so a *disabled* button still has one,
					     and keeps the tabindex the trigger gives it. When the button itself can
					     take focus, the wrapper steps out of the tab order (spread, so the
					     attribute is simply absent otherwise) and the rail is one stop per tool. -->
					<span class="tooltip-wrapper" {...props} {...(o.disabled ? {} : { tabindex: -1 })}>
						<button
							type="button"
							class="tool-btn"
							class:active={o.pressed}
							aria-label={o.label}
							aria-pressed={o.pressed === undefined ? undefined : o.pressed}
							disabled={o.disabled ?? false}
							onclick={o.onclick}
						>
							<Icon size={20} />
						</button>
					</span>
				{/snippet}
			</TooltipTrigger>
			<TooltipContent>{o.tip ?? o.label}</TooltipContent>
		</Tooltip>
	{/snippet}

	<TooltipProvider delayDuration={250}>
		<div
			class="paper-heart"
			class:readonly
			class:fullPage={fullPage}
			class:panel-collapsed={panelCollapsed}
			style:--mobile-top-clearance={mobileClearance ? `${mobileClearance.top}px` : undefined}
			style:--mobile-bottom-clearance={mobileClearance ? `${mobileClearance.bottom}px` : undefined}
			style:--mobile-notice-top={mobileNoticeTop != null ? `${mobileNoticeTop}px` : undefined}
		>
			<div class="canvas-area" bind:this={canvasAreaEl} style:min-height={fullPage ? undefined : mobileCanvasMinHeight ?? undefined}>
				<div class="canvas-box">
				<!-- Only the fixed-size instance is sized inline. In the full-page editor the
				     wrapper is an absolutely positioned box whose insets keep the drawing clear
				     of the floating rail and panel, and an inline width would over-constrain it
				     (a box with left, right *and* width simply ignores `right`). -->
				<div class="canvas-wrapper" style:width={fullPage ? undefined : `${size}px`} style:height={fullPage ? undefined : `${size}px`}>
					<svg
						bind:this={svgEl}
						viewBox={viewBox}
						width={fullPage ? '100%' : size}
						height={fullPage ? '100%' : size}
						preserveAspectRatio="xMidYMid meet"
						class="heart-svg"
						style:cursor={hoverFingerId ? 'crosshair' : 'default'}
					onwheel={handleWheel}
					ontouchstart={handleTouchStart}
					ontouchmove={handleTouchMove}
					ontouchend={handleTouchEnd}
					ontouchcancel={handleTouchEnd}
					onpointerdowncapture={handleSvgPointerDownCapture}
					onpointerdown={handleSvgPointerDown}
					onpointerleave={() => (hoverFingerId = null)}
					onpointermove={handleSvgPointerMove}
					onpointerup={handleSvgPointerUp}
					onpointercancel={handleSvgPointerUp}
					xmlns="http://www.w3.org/2000/svg"
				>
					{#if weaveData}
						<g transform={viewTransform}>
							<g bind:this={rotatedGroup} transform={rotationTransform}>
								<defs>
									<clipPath id="overlap-{componentId}">
										<rect
											x={weaveData.overlap.left}
											y={weaveData.overlap.top}
											width={weaveData.overlap.width}
											height={weaveData.overlap.height}
										/>
									</clipPath>
									<filter id="heart-shadow-{componentId}" x="-50%" y="-50%" width="200%" height="200%">
										<feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity="0.22" />
									</filter>
								</defs>

								<g filter="url(#heart-shadow-{componentId})">
									<path d={weaveData.leftLobeClip} fill={heartColors.left} />
									<path d={weaveData.rightLobeClip} fill={heartColors.right} />

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
												...weaveData.rightOnTopStrips.map((s) => s.pathData),
												...weaveData.leftOnTopStrips.map((s) => s.pathData)
											].join(' ')}
											fill={heartColors.right}
											fill-rule="evenodd"
										/>
									</g>
								</g>

								{#if !readonly}
									{#each fingers as finger (finger.id)}
											{@const isSelected = finger.id === selectedFingerId}
											{@const isHovered = finger.id === hoverFingerId}
											{@const hidden = !showCurves}
											{@const hasIssues = issueFingerIds.has(finger.id)}
											{@const lobeColor = finger.lobe === 'left' ? '#00ddff' : '#ff8800'}
											{@const strokeColor = hasIssues ? '#ff0000' : isSelected ? '#111111' : lobeColor}
											{@const outlineColor = isSelected ? '#ffffff' : '#000000'}
											{@const fingerPathData = segmentsToPathData(finger.segments)}

										<!-- Wide (invisible) hit zone for hover/selection -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
											<path
												d={fingerPathData}
												fill="none"
												stroke="#000"
												stroke-opacity="0.001"
											stroke-width={HIT_STROKE_WIDTH}
											stroke-linecap="round"
											stroke-linejoin="round"
											vector-effect="non-scaling-stroke"
											style="cursor: crosshair"
											onpointerdown={(e) => handleFingerPointerDown(e, finger.id)}
											onpointerenter={() => (hoverFingerId = finger.id)}
											onpointerleave={() => hoverFingerId === finger.id && (hoverFingerId = null)}
										/>

										{#if !hidden}
											<!-- Visible outline for contrast -->
												<path
													d={fingerPathData}
													fill="none"
													stroke={outlineColor}
													stroke-width={isSelected ? 6 : 4}
												stroke-linecap="round"
												stroke-linejoin="round"
												vector-effect="non-scaling-stroke"
												pointer-events="none"
											/>
											<!-- Colored stroke on top -->
												<path
													d={fingerPathData}
													fill="none"
													stroke={strokeColor}
													stroke-width={isSelected ? 4 : 2}
												stroke-linecap="round"
												stroke-linejoin="round"
												vector-effect="non-scaling-stroke"
												pointer-events="none"
											/>
										{/if}

										{#if isHovered}
											<path
												d={fingerPathData}
												fill="none"
												stroke="#000"
												stroke-opacity={hidden ? 1 : 0.35}
												stroke-width={hidden ? 2 : 5}
												stroke-linecap="round"
												stroke-linejoin="round"
												vector-effect="non-scaling-stroke"
												pointer-events="none"
											/>
										{/if}
									{/each}

									{#if selectedFinger}
										{@const segs = fingerToSegments(selectedFinger)}
										{@const n = segs.length}
										{@const selectedHasIssues = issueFingerIds.has(selectedFinger.id)}

										{#if selectedSegs.length}
											{#each selectedSegs as segIdx (selectedFinger.id + ':seg:' + segIdx)}
												{@const seg = segs[segIdx]}
												{#if seg}
													<path
														d={segmentsToPathData([seg])}
														fill="none"
														stroke={selectedHasIssues ? '#ff0000' : '#111'}
														stroke-width="4"
														stroke-linecap="round"
														stroke-linejoin="round"
														vector-effect="non-scaling-stroke"
														pointer-events="none"
													/>
												{/if}
											{/each}
										{/if}

										{#each visibleAnchorsSorted as idx (selectedFinger.id + ':vis:' + idx)}
											{#if idx === 0}
												{@const seg = segs[0]}
												{#if seg && !isHandleCollapsed(seg.p1, seg.p0)}
													<line
														x1={seg.p0.x}
														y1={seg.p0.y}
														x2={seg.p1.x}
														y2={seg.p1.y}
														stroke="#666"
														stroke-width="1"
														vector-effect="non-scaling-stroke"
													/>
													<circle
														cx={seg.p1.x}
														cy={seg.p1.y}
														r={5 * curveUiScale}
														fill="#eee"
														stroke="#111"
														stroke-width="1"
														vector-effect="non-scaling-stroke"
														style="cursor: pointer"
														onpointerdown={(e) => handleHandlePointerDown(e, selectedFinger.id, 0, 'p1')}
													/>
												{/if}
											{:else if idx === n}
												{@const seg = segs[n - 1]}
												{#if seg && !isHandleCollapsed(seg.p2, seg.p3)}
													<line
														x1={seg.p3.x}
														y1={seg.p3.y}
														x2={seg.p2.x}
														y2={seg.p2.y}
														stroke="#666"
														stroke-width="1"
														vector-effect="non-scaling-stroke"
													/>
													<circle
														cx={seg.p2.x}
														cy={seg.p2.y}
														r={5 * curveUiScale}
														fill="#eee"
														stroke="#111"
														stroke-width="1"
														vector-effect="non-scaling-stroke"
														style="cursor: pointer"
														onpointerdown={(e) => handleHandlePointerDown(e, selectedFinger.id, n - 1, 'p2')}
													/>
												{/if}
											{:else}
												{@const prev = segs[idx - 1]}
												{@const next = segs[idx]}
												{#if prev && !isHandleCollapsed(prev.p2, prev.p3)}
													<line
														x1={prev.p3.x}
														y1={prev.p3.y}
														x2={prev.p2.x}
														y2={prev.p2.y}
														stroke="#666"
														stroke-width="1"
														vector-effect="non-scaling-stroke"
													/>
													<circle
														cx={prev.p2.x}
														cy={prev.p2.y}
														r={5 * curveUiScale}
														fill="#eee"
														stroke="#111"
														stroke-width="1"
														vector-effect="non-scaling-stroke"
														style="cursor: pointer"
														onpointerdown={(e) => handleHandlePointerDown(e, selectedFinger.id, idx - 1, 'p2')}
													/>
												{/if}
												{#if next && !isHandleCollapsed(next.p1, next.p0)}
													<line
														x1={next.p0.x}
														y1={next.p0.y}
														x2={next.p1.x}
														y2={next.p1.y}
														stroke="#666"
														stroke-width="1"
														vector-effect="non-scaling-stroke"
													/>
													<circle
														cx={next.p1.x}
														cy={next.p1.y}
														r={5 * curveUiScale}
														fill="#eee"
														stroke="#111"
														stroke-width="1"
														vector-effect="non-scaling-stroke"
														style="cursor: pointer"
														onpointerdown={(e) => handleHandlePointerDown(e, selectedFinger.id, idx, 'p1')}
													/>
												{/if}
											{/if}
										{/each}

										{#each getAnchorPositions(segs) as a, aIdx (selectedFinger.id + ':a:' + aIdx)}
											{@const s = 10 * curveUiScale}
											<rect
												x={a.x - s / 2}
												y={a.y - s / 2}
												width={s}
												height={s}
												fill={selectedAnchors.includes(aIdx) ? '#ffcc00' : '#fff'}
												stroke="#111"
												stroke-width="1"
												vector-effect="non-scaling-stroke"
												transform={
													aIdx !== 0 &&
													aIdx !== n &&
													(getAnchorNodeType(selectedFinger, aIdx) === 'smooth' ||
														getAnchorNodeType(selectedFinger, aIdx) === 'symmetric')
														? `rotate(45 ${a.x} ${a.y})`
														: ''
												}
												style="cursor: pointer"
												onpointerdown={(e) => handleAnchorPointerDown(e, selectedFinger.id, aIdx)}
											/>
										{/each}
									{/if}
								{/if}
							</g>
						</g>
					{:else}
						<rect x={BASE_CANVAS_SIZE / 4} y={BASE_CANVAS_SIZE / 4} width={BASE_CANVAS_SIZE / 2} height={BASE_CANVAS_SIZE / 2} fill="#eee" />
					{/if}
				</svg>
			</div>

			{#if !readonly}
				<!-- Canvas chrome (DESIGN.md §7): the one-line hint, what is selected and the
				     strip count. Desktop only — the mobile editor keeps its stacked panels.
				     The dismissible first-visit tip below says the same three things in other
				     words and sits right under this line, so on a first visit only the tip
				     shows and the permanent hint takes over once it has been dismissed. -->
				{#if firstVisitHintDismissed}
					<p class="canvas-hint">{tr('editorCanvasHint')}</p>
				{/if}
				{#if selectedNodeTypeLabel}
					<p class="canvas-selection">
						<span class="canvas-selection-dot" aria-hidden="true"></span>{selectedNodeTypeLabel}
					</p>
				{/if}
				<p class="canvas-strips">{stripsLabel}</p>
				<div class="canvas-notices">
					{#if hasIntersectionIssues}
						<div class="canvas-notice warning" role="alert">{tr('editorIntersectionWarning')}</div>
					{/if}
					{#if hasManyStrips}
						<div class="canvas-notice info" role="status">{tr('editorManyStripsHint')}</div>
					{/if}
					{#if !firstVisitHintDismissed}
						<div class="canvas-notice hint" role="note">
							<span>{tr('editorFirstVisitHint')}</span>
							<button type="button" class="notice-dismiss" onclick={dismissFirstVisitHint} aria-label={tr('editorDismissHint')}>
								<CloseIcon size={16} aria-hidden="true" />
							</button>
						</div>
					{/if}
				</div>
				{/if}
				</div>

			{#if !readonly}
				<!-- Tool rail. Every tool stays an icon button with a tooltip; nothing is
				     removed and no labels are printed under the icons (DESIGN.md §7). -->
				<div bind:this={segmentControlsEl} class="segment-controls" class:floating={fullPage} aria-label={tr('editorCurveTools')}>
					<div class="history-controls" aria-label={tr('editorHistory')}>
						{@render toolButton({ label: tr('editorUndo'), icon: UndoIcon, onclick: undo, disabled: !canUndo })}
						{@render toolButton({ label: tr('editorRedo'), icon: RedoIcon, onclick: redo, disabled: !canRedo })}
					</div>
					<div class="toolbar-separator" aria-hidden="true">
						<Separator orientation={isMobileLayout ? 'vertical' : 'horizontal'} class={isMobileLayout ? 'h-6' : undefined} decorative />
					</div>
					<div class="edit-controls" aria-label={tr('editorEdit')}>
						{@render toolButton({
							label: tr('editorInsertNode'),
							icon: NodeAddIcon,
							onclick: insertNodeBetweenSelectedAnchors,
							disabled: !canInsertNode
						})}
						{@render toolButton({
							label: tr('editorDeleteNode'),
							icon: TrashIcon,
							onclick: deleteSelectedAnchors,
							disabled: !canDeleteNode
						})}
					</div>
					<div class="toolbar-separator" aria-hidden="true">
						<Separator orientation={isMobileLayout ? 'vertical' : 'horizontal'} class={isMobileLayout ? 'h-6' : undefined} decorative />
					</div>
					<div class="node-type-controls" aria-label={tr('editorNodeType')}>
						{@render toolButton({
							label: tr('editorCornerNode'),
							tip: tr('editorCorner'),
							icon: NodeCornerIcon,
							onclick: () => setSelectedAnchorsNodeType('corner'),
							disabled: !validAnchors.length,
							pressed: nodeTypeSelected === 'corner'
						})}
						{@render toolButton({
							label: tr('editorSmoothNode'),
							tip: tr('editorSmooth'),
							icon: NodeSmoothIcon,
							onclick: () => setSelectedAnchorsNodeType('smooth'),
							disabled: !validAnchors.length,
							pressed: nodeTypeSelected === 'smooth'
						})}
						{@render toolButton({
							label: tr('editorSymmetricNode'),
							tip: tr('editorSymmetric'),
							icon: NodeSymmetricIcon,
							onclick: () => {
								makeSelectedAnchorsCurved();
								setSelectedAnchorsNodeType('symmetric');
							},
							disabled: !validAnchors.length,
							pressed: nodeTypeSelected === 'symmetric'
						})}
						{@render toolButton({
							label: tr('editorCurveNode'),
							icon: NodeCurveIcon,
							onclick: makeSelectedAnchorsCurved,
							disabled: !validAnchors.length
						})}
					</div>
					<div class="toolbar-separator" aria-hidden="true">
						<Separator orientation={isMobileLayout ? 'vertical' : 'horizontal'} class={isMobileLayout ? 'h-6' : undefined} decorative />
					</div>
					<div class="convert-controls" aria-label={tr('editorConvert')}>
						{@render toolButton({
							label: tr('editorStraightSegment'),
							icon: SegmentLineIcon,
							onclick: makeSelectedSegmentsStraight,
							disabled: !canMakeSegmentsStraight
						})}
						{@render toolButton({
							label: tr('editorCurvedSegment'),
							icon: SegmentCurveIcon,
							onclick: makeSelectedSegmentsCurved,
							disabled: !canMakeSegmentsCurved
						})}
					</div>
					<div class="toolbar-separator view-separator" aria-hidden="true">
						<Separator orientation={isMobileLayout ? 'vertical' : 'horizontal'} class={isMobileLayout ? 'h-6' : undefined} decorative />
					</div>
					<div class="view-controls" aria-label={tr('editorFitView')}>
						{@render toolButton({ label: tr('editorFitView'), icon: FitIcon, onclick: fitView })}
					</div>
				</div>

				<!-- The 340px panel. Symmetri / Tegning / Farver belong to the editor itself;
				     the route adds Hjertedetaljer and Handlinger through `panelExtra`. -->
				<div
					bind:this={rightPanelEl}
					id={panelId}
					class="right-panel"
					class:floating={fullPage}
					class:collapsed={panelCollapsed}
				>
					<div class="panel-collapse">
						<button
							type="button"
							class="panel-button"
							bind:this={panelCollapseButtonEl}
							aria-expanded={!panelCollapsed}
							aria-controls={panelId}
							onclick={() => setPanelCollapsed(true)}
						>
							{tr('editorHidePanel')}
							<ChevronRightIcon size={14} />
						</button>
					</div>

					<section class="editor-panel symmetry-panel">
						<h2 class="panel-title">{tr('symmetry')}</h2>
						<!-- The name goes on the ToggleGroup, not on the plain wrapper: a
						     <div> with no role drops its aria-label from the tree, which left
						     three interchangeable unnamed radio groups. -->
						<div class="symmetry-row">
							<span class="symmetry-label">{tr('editorWithinCurve')}</span>
							<ToggleGroup
								type="single"
								role="radiogroup"
								aria-label={tr('editorWithinCurveSymmetry')}
								bind:value={withinCurveMode}
							>
								<ToggleGroupItem value="off" title={tr('editorOff')}>{tr('editorOff')}</ToggleGroupItem>
								<ToggleGroupItem value="sym" title={tr('mirrorSymmetry')}>{tr('editorSym')}</ToggleGroupItem>
								<ToggleGroupItem value="anti" title={tr('editorAntiSymmetry')}>{tr('editorAnti')}</ToggleGroupItem>
							</ToggleGroup>
						</div>
						<div class="symmetry-row">
							<span class="symmetry-label">{tr('editorWithinLobe')}</span>
							<ToggleGroup
								type="single"
								role="radiogroup"
								aria-label={tr('editorWithinLobeSymmetry')}
								bind:value={withinLobeMode}
							>
								<ToggleGroupItem value="off" title={tr('editorOff')}>{tr('editorOff')}</ToggleGroupItem>
								<ToggleGroupItem value="sym" title={tr('mirrorSymmetry')}>{tr('editorSym')}</ToggleGroupItem>
								<ToggleGroupItem value="anti" title={tr('editorAntiSymmetry')}>{tr('editorAnti')}</ToggleGroupItem>
							</ToggleGroup>
						</div>
						<div class="symmetry-row">
							<span class="symmetry-label">{tr('editorBetweenLobes')}</span>
							<Tooltip>
								<TooltipTrigger>
									{#snippet child({ props })}
										<span class="tooltip-wrapper" {...props}>
											<ToggleGroup
												type="single"
												role="radiogroup"
												aria-label={tr('editorBetweenLobesSymmetry')}
												bind:value={betweenLobesMode}
												disabled={!canSymmetryBetweenLobes()}
											>
												<ToggleGroupItem value="off" title={tr('editorOff')}>{tr('editorOff')}</ToggleGroupItem>
												<ToggleGroupItem value="sym" title={tr('mirrorSymmetry')}>{tr('editorSym')}</ToggleGroupItem>
												<ToggleGroupItem value="anti" title={tr('editorAntiSymmetry')}>{tr('editorAnti')}</ToggleGroupItem>
											</ToggleGroup>
										</span>
									{/snippet}
								</TooltipTrigger>
								<TooltipContent>{canSymmetryBetweenLobes() ? tr('editorBetweenLobesSymmetry') : tr('editorRequiresEqualGridSize')}</TooltipContent>
							</Tooltip>
						</div>
					</section>

					<section class="editor-panel">
						<h2 class="panel-title">{tr('editorDrawing')}</h2>
						<label class="checkbox" title={tr('editorShowCurveOutlines')}>
							<input type="checkbox" bind:checked={showCurves} />
							<span>{tr('editorOutlines')}</span>
						</label>
						<label class="checkbox" title={tr('editorSnapToOppositeTitle')}>
							<input type="checkbox" bind:checked={snapToOpposite} />
							<span>{tr('editorSnapToOpposite')}</span>
						</label>
					</section>

					<!-- The two swatches are real colour inputs: the round label is the
					     swatch, and the input inside it is blown up so its own swatch fills
					     the circle. The visible name is the label's, so both are reachable
					     and named from the keyboard. -->
					<section class="editor-panel">
						<h2 class="panel-title">{tr('editorColors')}</h2>
						<div class="colors-row">
							<label class="swatch" title={tr('leftColor')}>
								<span class="sr-only">{tr('leftColor')}</span>
								<input
									type="color"
									name="heart-color-left"
									value={colorInputs.left}
									oninput={(e) => setLobeColor('left', e.currentTarget.value)}
								/>
							</label>
							<label class="swatch" title={tr('rightColor')}>
								<span class="sr-only">{tr('rightColor')}</span>
								<input
									type="color"
									name="heart-color-right"
									value={colorInputs.right}
									oninput={(e) => setLobeColor('right', e.currentTarget.value)}
								/>
							</label>
							<button type="button" class="panel-button" onclick={flipLobeColors} title={tr('editorFlipLobeColors')}>
								<SwapIcon size={14} />
								{tr('editorSwap')}
							</button>
						</div>
					</section>

					{#if panelExtra}{@render panelExtra()}{/if}
				</div>

				<!-- Always mounted so activating "Skjul panel" has somewhere to send
				     focus; CSS hides it again while the panel is open. -->
				<button
					type="button"
					class="panel-tab"
					bind:this={panelTabEl}
					aria-expanded={!panelCollapsed}
					aria-controls={panelId}
					onclick={() => setPanelCollapsed(false)}
				>
					<ChevronRightIcon size={14} />
					<span>{tr('editorShowPanel')}</span>
				</button>
			{/if}
			</div>
		</div>
	</TooltipProvider>

	<style>
		.paper-heart {
			position: relative;
			width: 100%;
		}

		.paper-heart.fullPage {
			position: relative;
			width: 100%;
			height: 100%;
			min-height: 0;
			overflow: hidden;
			z-index: 0;
		}

		.canvas-area {
			position: relative;
			display: flex;
			align-items: center;
			justify-content: center;
			width: 100%;
		}

		.paper-heart.fullPage .canvas-area {
			height: 100%;
			min-height: 0;
		}

		.canvas-wrapper {
			position: relative;
			background: transparent;
		}

		/* The drawing surface. Everything that floats over the heart (hint, selection,
		   strip count, notices) lives inside it, so it is anchored to the canvas and not
		   to the rail and the panel that float above it. */
		.canvas-box {
			position: relative;
			display: flex;
			align-items: center;
			justify-content: center;
			width: 100%;
		}

		.paper-heart.fullPage .canvas-box {
			position: absolute;
			inset: 0;
		}

		.paper-heart.fullPage .canvas-wrapper {
			position: absolute;
			inset: 0;
		}

		.heart-svg {
			display: block;
			touch-action: none;
			width: 100%;
			height: 100%;
		}

		/* Canvas chrome — DESIGN.md §7. Desktop only: below 900px the editor keeps the
		   stacked panels it has always had, so these three lines stay hidden there. */
		.canvas-hint,
		.canvas-selection,
		.canvas-strips {
			display: none;
			margin: 0;
			position: absolute;
			z-index: 22;
			font-size: 13px;
			line-height: 1.35;
			pointer-events: none;
			user-select: none;
		}

		.canvas-hint,
		.canvas-selection {
			top: 14px;
			align-items: center;
			gap: 8px;
			padding: 8px 12px;
			border: 1px solid var(--line);
			border-radius: 10px;
			background: var(--white);
		}

		/* The hint carries three separate instructions, so it wraps rather than
		   truncating: `text-overflow` never fires on a flex box, and a flat cut
		   mid-word lost most of the sentence on every laptop under ~1400px. */
		.canvas-hint {
			left: 16px;
			max-width: calc(100% - 32px);
			color: var(--muted);
		}

		/* The selection chip shares the line, anchored to the right edge; give way
		   to it only while it is actually on screen. */
		.canvas-box:has(.canvas-selection) .canvas-hint {
			max-width: calc(100% - 250px);
		}

		.canvas-selection {
			right: 16px;
			color: var(--ink);
			font-weight: 500;
		}

		.canvas-selection-dot {
			width: 10px;
			height: 10px;
			flex: none;
			border-radius: 50%;
			background: var(--red);
		}

		.canvas-strips {
			left: 16px;
			bottom: 14px;
			color: var(--muted);
		}

		/* Short notices above the heart (strip-count hint, intersection warning, first-visit tip). */
		.canvas-notices {
			position: absolute;
			top: 16px;
			left: 50%;
			transform: translateX(-50%);
			z-index: 25;
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.5rem;
			width: max-content;
			max-width: min(560px, calc(100% - 220px));
			pointer-events: none;
			user-select: none;
		}

		.canvas-notice {
			display: flex;
			align-items: flex-start;
			gap: 0.5rem;
			padding: 0.5rem 0.75rem;
			border-radius: 10px;
			font-size: 13px;
			line-height: 1.4;
			box-shadow: var(--shadow-panel);
			pointer-events: auto;
		}

		.canvas-notice.info,
		.canvas-notice.hint {
			background: var(--white);
			border: 1px solid var(--line);
			color: var(--muted);
		}

		.canvas-notice.warning {
			background: var(--alert-bg);
			border: 1px solid var(--alert-border);
			color: var(--alert-ink);
		}

		.notice-dismiss {
			display: flex;
			align-items: center;
			justify-content: center;
			flex: 0 0 auto;
			width: 24px;
			height: 24px;
			margin: -3px -6px -3px 0;
			border: none;
			border-radius: 4px;
			background: transparent;
			color: inherit;
			cursor: pointer;
		}

		.notice-dismiss:hover {
			background: var(--hover-wash);
		}

		.right-panel {
			position: absolute;
			right: 24px;
			bottom: 24px;
			z-index: 20;
			display: flex;
			flex-direction: column;
			gap: 14px;
			align-items: flex-end;
		}

		.paper-heart.fullPage .right-panel.floating {
			position: absolute;
		}

		/*
		  .editor-panel and .panel-title themselves live in src/app.css: the editor
		  route fills this same column with its own Hjertedetaljer / Handlinger
		  sections through `panelExtra`, and repeats them under the canvas on
		  phones, so neither component can own them. What is left here and in the
		  media queries below is how *this* column positions them.
		*/
		.segment-controls {
			display: flex;
			flex-direction: column;
			gap: 2px;
			align-items: center;
			background: var(--white);
			padding: 6px;
			border: 1px solid var(--line);
			border-radius: 12px;
			box-shadow: var(--shadow-panel);
			position: absolute;
			left: 32px;
			top: 50%;
			transform: translateY(-50%);
			z-index: 20;
		}

		.paper-heart.fullPage .segment-controls.floating {
			position: absolute;
		}

		.history-controls,
		.edit-controls,
		.node-type-controls,
		.convert-controls,
		.view-controls {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 2px;
		}

		/* Every tool is a 44px icon button with a tooltip — no labels under the icons. */
		.tool-btn {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 44px;
			height: 44px;
			padding: 0;
			border: none;
			border-radius: 10px;
			background: transparent;
			color: var(--green);
			cursor: pointer;
			transition: background-color 0.15s, color 0.15s;
		}

		.tool-btn:hover:not(:disabled) {
			background: var(--cream2);
		}

		.tool-btn.active {
			background: var(--green);
			color: var(--white);
		}

		.tool-btn:disabled {
			opacity: 0.35;
			cursor: not-allowed;
		}

		.toolbar-separator {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 100%;
			margin: 4px 0;
			padding: 0 6px;
			box-sizing: border-box;
		}

		.toolbar-separator :global([data-separator]) {
			background-color: var(--line);
		}

		/* Small pill button used by "Skjul panel" and "Byt". */
		.panel-button {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 8px 12px;
			border: 1.5px solid var(--line);
			border-radius: 8px;
			background: var(--white);
			color: var(--green);
			font-family: inherit;
			font-size: 13px;
			font-weight: 600;
			line-height: 1;
			cursor: pointer;
			transition: background-color 0.15s;
		}

		.panel-button:hover {
			background: var(--cream2);
		}

		.panel-collapse {
			display: flex;
			justify-content: flex-end;
		}

		/* The slim tab that brings a hidden panel back. */
		.panel-tab {
			position: absolute;
			right: 0;
			top: 50%;
			transform: translateY(-50%);
			display: none;
			flex-direction: column;
			align-items: center;
			gap: 8px;
			padding: 16px 7px;
			border: 1.5px solid var(--line);
			border-right: none;
			border-radius: 10px 0 0 10px;
			background: var(--white);
			color: var(--green);
			font-family: inherit;
			font-size: 13px;
			font-weight: 600;
			cursor: pointer;
			z-index: 22;
		}

		.panel-tab span {
			writing-mode: vertical-rl;
		}

		.panel-tab :global(svg) {
			transform: rotate(180deg);
		}

		.checkbox {
			display: flex;
			align-items: center;
			gap: 10px;
			font-size: 14px;
			color: var(--ink);
			cursor: pointer;
		}

		.checkbox input {
			appearance: none;
			-webkit-appearance: none;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			flex: none;
			width: 20px;
			height: 20px;
			margin: 0;
			border: 1.5px solid var(--green);
			border-radius: 5px;
			background: var(--white);
			cursor: pointer;
		}

		.checkbox input:checked {
			background: var(--green);
		}

		.checkbox input:checked::after {
			content: '';
			width: 10px;
			height: 5px;
			margin-top: -3px;
			border-left: 2px solid var(--white);
			border-bottom: 2px solid var(--white);
			transform: rotate(-45deg);
		}

		.colors-row {
			display: flex;
			align-items: center;
			gap: 12px;
		}

		.swatch {
			display: inline-flex;
			width: 34px;
			height: 34px;
			flex: none;
			padding: 0;
			border: 1.5px solid var(--line);
			border-radius: 50%;
			overflow: hidden;
			cursor: pointer;
		}

		/* A colour input paints its swatch inside its own padding box, so it is
		   blown up and clipped by the round label to fill it edge to edge. */
		.swatch input {
			width: 150%;
			height: 150%;
			margin: -25%;
			padding: 0;
			border: 0;
			background: none;
			cursor: pointer;
		}

		/* The input itself is invisible inside the circle, so the ring goes on the
		   label — otherwise a keyboard visitor cannot see which swatch is focused. */
		.swatch:focus-within {
			outline: 2px solid var(--green);
			outline-offset: 2px;
		}

		.symmetry-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 10px;
		}

		.symmetry-label {
			color: var(--ink);
			font-size: 14px;
			white-space: nowrap;
		}

		/* Segmented Fra / Sym / Anti control, restyled from the shadcn ToggleGroup. */
		.symmetry-row :global([data-slot='toggle-group']) {
			display: inline-flex;
			gap: 0;
			padding: 0;
			border: 1.5px solid var(--line);
			border-radius: 8px;
			overflow: hidden;
			background: var(--white);
		}

		.symmetry-row :global([data-slot='toggle-group-item']) {
			border-radius: 0;
			padding: 6px 10px;
			font-size: 13px;
			font-weight: 600;
			color: var(--green);
			background: var(--white);
			box-shadow: none;
		}

		.symmetry-row :global([data-slot='toggle-group-item']:hover) {
			background: var(--cream2);
			color: var(--green);
		}

		.symmetry-row :global([data-slot='toggle-group-item'][data-state='on']) {
			background: var(--green);
			color: var(--white);
		}

		.tooltip-wrapper {
			display: inline-flex;
		}

		/* ------------------------------------------------------------------
		   Desktop (DESIGN.md §7): the canvas fills the whole area under the top
		   bar, and the tool rail and the 340px panel float on top of it. The
		   drawing itself keeps out from under them: the two insets below are the
		   rail's and the panel's widths, so what the visitor draws is never
		   hidden by a panel, while zoom, pan and "Tilpas visning" work on the
		   full-size canvas. Collapsing the panel gives the drawing that width
		   back and leaves only the "Vis panel" tab at the edge.

		   Below 900px the editor keeps its existing stacked layout, so all of
		   this is switched on here and nowhere else.
		   ------------------------------------------------------------------ */
		@media (min-width: 900px) {
			.paper-heart.fullPage {
				/* 24px gutter + 58px rail + air. */
				--editor-rail-inset: 104px;
				/* 24px gutter + 340px panel + air. */
				--editor-panel-inset: 388px;
				/* The drawing area between the two, for centring things over it. */
				--editor-canvas-width: calc(100% - var(--editor-rail-inset) - var(--editor-panel-inset));
			}

			.paper-heart.fullPage.panel-collapsed {
				/* Only the "Vis panel" tab is left against the right edge. */
				--editor-panel-inset: 60px;
			}

			.paper-heart.fullPage .canvas-box {
				background: var(--cream2);
				overflow: hidden;
			}

			.paper-heart.fullPage .canvas-hint,
			.paper-heart.fullPage .canvas-strips {
				display: block;
			}

			/* The hint stays a block so it can wrap; the chip shrink-wraps its text. */
			.paper-heart.fullPage .canvas-selection {
				display: inline-flex;
			}

			/* The chrome lines up with the drawing area rather than with the canvas,
			   so they read against paper instead of against a floating panel. */
			.paper-heart.fullPage .canvas-hint,
			.paper-heart.fullPage .canvas-strips {
				left: var(--editor-rail-inset);
				max-width: var(--editor-canvas-width);
			}

			.paper-heart.fullPage .canvas-box:has(.canvas-selection) .canvas-hint {
				max-width: calc(var(--editor-canvas-width) - 240px);
			}

			.paper-heart.fullPage .canvas-selection {
				right: var(--editor-panel-inset);
			}

			.paper-heart.fullPage .canvas-notices {
				top: 62px;
				left: calc(var(--editor-rail-inset) + var(--editor-canvas-width) / 2);
				max-width: min(560px, calc(var(--editor-canvas-width) - 32px));
			}

			/* The visible drawing area: the full height, and the width that is left
			   between the two floating columns. */
			.paper-heart.fullPage .canvas-wrapper {
				top: 16px;
				bottom: 16px;
				left: var(--editor-rail-inset);
				right: var(--editor-panel-inset);
			}

			/* z-index 26: the rail and the panel float over the canvas chrome (22)
			   and the notices (25), which now share the same full-size canvas. */
			.paper-heart.fullPage .segment-controls.floating {
				left: 24px;
				z-index: 26;
			}

			/* The column scrolls, so it also clips: the 16px padding is what keeps the
			   cards' shadows from being cut off against its edges. Its own box is that
			   much wider and closer to the edges, which leaves the cards themselves
			   where --editor-panel-inset says they are — 24px in, 340px wide. */
			.paper-heart.fullPage .right-panel.floating {
				top: 4px;
				bottom: 4px;
				right: 8px;
				width: 372px;
				padding: 16px;
				box-sizing: border-box;
				align-items: stretch;
				min-height: 0;
				overflow-y: auto;
				overscroll-behavior: contain;
				scrollbar-width: thin;
				z-index: 26;
			}

			/* The cards float over the drawing, so they are lifted off it. */
			.paper-heart.fullPage .right-panel :global(.editor-panel) {
				box-shadow: var(--shadow-panel);
			}

			.paper-heart.fullPage .right-panel.collapsed {
				display: none;
			}

			.paper-heart.fullPage.panel-collapsed .panel-tab {
				display: inline-flex;
			}
		}

		@media (max-width: 899px) {
			.canvas-area {
				--mobile-controls-clearance: 220px;
				flex-direction: column;
				justify-content: center;
				gap: 0.5rem;
				padding: 0 0 var(--mobile-controls-clearance) 0;
				min-height: 100vh;
				box-sizing: border-box;
			}

			.paper-heart.fullPage .canvas-area {
				height: 100%;
				min-height: 0;
			}

			.heart-svg {
				width: 100%;
				height: 100%;
			}

			.canvas-notices {
				top: var(--mobile-notice-top, 16px);
				max-width: calc(100% - 32px);
			}

			.segment-controls {
				position: static;
				transform: none;
				flex-direction: row;
				flex-wrap: nowrap;
				overflow-x: auto;
				justify-content: flex-start;
				order: -1;
				padding: 0.5rem 0.75rem;
				border-radius: 999px;
				width: 100%;
				box-sizing: border-box;
				scrollbar-width: none;
			}

			.paper-heart.fullPage .segment-controls.floating {
				position: absolute;
				left: 16px;
				right: 16px;
				top: 88px;
				width: auto;
				transform: none;
				order: unset;
			}

			.segment-controls::-webkit-scrollbar {
				display: none;
			}

			.segment-controls > * {
				flex-shrink: 0;
			}

			.right-panel {
				position: absolute;
				left: 16px;
				right: 16px;
				bottom: 16px;
				transform: none;
				flex-direction: row;
				justify-content: space-between;
				align-items: flex-end;
				gap: 0.75rem;
				width: auto;
				z-index: 30;
			}

			.paper-heart.fullPage .right-panel.floating {
				position: absolute;
			}

			.right-panel {
				flex-wrap: wrap;
			}

			/* The floating panels sit over the canvas here, so keep them compact and lifted. */
			.right-panel :global(.editor-panel) {
				flex: 1 1 200px;
				min-width: 0;
				padding: 12px;
				gap: 8px;
				box-shadow: var(--shadow-panel);
			}

			/* Collapsing belongs to the desktop layout only. */
			.panel-collapse,
			.panel-tab {
				display: none;
			}

			.history-controls,
			.edit-controls,
			.node-type-controls,
			.convert-controls,
			.view-controls {
				flex-direction: row;
			}

			.toolbar-separator {
				width: auto;
				height: auto;
			}

			/* !important beats the Tailwind utilities the shadcn Separator sets on
			   itself; it has no class hook of its own to target. */
			.toolbar-separator :global([data-separator]) {
				width: 1px !important;
				min-width: 1px !important;
				max-width: 1px !important;
				height: 24px !important;
			}

			/* The three !importants below beat the inline width/height
			   updateCanvasSize() writes on .canvas-wrapper for the desktop layout. */
			.paper-heart:not(.readonly) .canvas-wrapper {
				width: 100% !important;
				height: auto !important;
				aspect-ratio: 1;
				max-width: 500px;
			}

			.paper-heart.fullPage:not(.readonly) .canvas-wrapper {
				width: 100% !important;
				height: 100% !important;
				aspect-ratio: unset;
				max-width: none;
			}

			/* Keep the heart in the free band between the floating tool rail and the
			   floating panels; the clearances are measured in updateMobileClearance(). */
			.paper-heart.fullPage:not(.readonly) .canvas-wrapper {
				top: var(--mobile-top-clearance, 0px);
				bottom: var(--mobile-bottom-clearance, 0px);
				height: auto !important;
			}
		}

		/* Narrow phones: wrap the toolbar, stack the bottom panels, and keep everything inside the viewport. */
		@media (max-width: 599px) {
			.segment-controls {
				flex-wrap: wrap;
				justify-content: center;
				overflow: visible;
				gap: 0.25rem 0.75rem;
				border-radius: 16px;
			}

			.paper-heart.fullPage .segment-controls.floating {
				top: 16px;
			}

			.toolbar-separator {
				display: none;
			}

			/* Keep the view tool with the rest instead of alone on the second row. */
			.view-controls {
				order: 1;
			}

			/* Balance the two rows: history, edit and convert on the first, node types on the second. */
			.node-type-controls {
				order: 1;
			}

			/* Two-up: Symmetri across the top, Tegning and Farver beside each other,
			   so the floating panels leave the heart as much of the screen as before. */
			.right-panel {
				display: grid;
				grid-template-columns: 1fr 1fr;
				align-items: start;
				gap: 8px;
			}

			.right-panel :global(.editor-panel) {
				flex: 0 0 auto;
			}

			.symmetry-panel {
				grid-column: 1 / -1;
			}
		}
	</style>
