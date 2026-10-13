import type { HeartDesign } from '$lib/types/heart';
import type { HeartColors } from '$lib/stores/colors';
import { computeWeaveData } from '$lib/rendering/svgWeave';
import { inferOverlapRect } from '$lib/utils/overlapRect';

type OverlapLike = { left: number; top: number; width: number; height: number };

function normalizeAngle(rad: number): number {
	const tau = 2 * Math.PI;
	return ((rad % tau) + tau) % tau;
}

function angleInRange(rad: number, start: number, end: number): boolean {
	const t = normalizeAngle(rad);
	const s = normalizeAngle(start);
	const e = normalizeAngle(end);
	if (s <= e) return t >= s && t <= e;
	// Wrapped interval (not expected for our current use, but keep correct)
	return t >= s || t <= e;
}

function rotate45About(p: { x: number; y: number }, o: { x: number; y: number }) {
	const dx = p.x - o.x;
	const dy = p.y - o.y;
	const cos45 = Math.SQRT1_2;
	const sin45 = Math.SQRT1_2;
	return {
		x: o.x + dx * cos45 - dy * sin45,
		y: o.y + dx * sin45 + dy * cos45
	};
}

function circlePoint(c: { x: number; y: number }, r: number, t: number) {
	return { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) };
}

function addArcExtremaPoints(
	points: Array<{ x: number; y: number }>,
	arc: { center: { x: number; y: number }; radius: number; start: number; end: number }
) {
	// For rotation by 45° (clockwise in SVG coords), extrema in x/y on a circle occur at:
	// t = -a, π-a, π/2-a, 3π/2-a for the full circle (a = π/4). Include those that fall on the arc.
	const a = Math.PI / 4;
	const candidates = [-a, Math.PI - a, Math.PI / 2 - a, (3 * Math.PI) / 2 - a, arc.start, arc.end];
	for (const t of candidates) {
		if (!angleInRange(t, arc.start, arc.end)) continue;
		points.push(circlePoint(arc.center, arc.radius, t));
	}
}

export function computeHeartViewBoxFromOverlap(
	overlap: OverlapLike,
	opts: { paddingRatio?: number; square?: boolean } = {}
): { viewBox: string; overlapCenter: { x: number; y: number } } {
	const paddingRatio = opts.paddingRatio ?? 0.021;
	const square = opts.square ?? true;

	const left = overlap.left;
	const top = overlap.top;
	const width = overlap.width;
	const height = overlap.height;

	const overlapCenter = { x: left + width / 2, y: top + height / 2 };

	const points: Array<{ x: number; y: number }> = [];

	// Overlap rectangle corners (also cover arc endpoints).
	points.push(
		{ x: left, y: top },
		{ x: left + width, y: top },
		{ x: left, y: top + height },
		{ x: left + width, y: top + height }
	);

	// Left ear: semicircle to the left of x=left (angles π/2..3π/2).
	addArcExtremaPoints(points, {
		center: { x: left, y: top + height / 2 },
		radius: height / 2,
		start: Math.PI / 2,
		end: (3 * Math.PI) / 2
	});

	// Top ear: semicircle above y=top (angles π..2π).
	addArcExtremaPoints(points, {
		center: { x: left + width / 2, y: top },
		radius: width / 2,
		start: Math.PI,
		end: 2 * Math.PI
	});

	const rotated = points.map((p) => rotate45About(p, overlapCenter));
	const minX = Math.min(...rotated.map((p) => p.x));
	const maxX = Math.max(...rotated.map((p) => p.x));
	const minY = Math.min(...rotated.map((p) => p.y));
	const maxY = Math.max(...rotated.map((p) => p.y));

	const w = maxX - minX;
	const h = maxY - minY;
	const boundsSize = Math.max(w, h);
	const padding = boundsSize * paddingRatio;

	if (square) {
		const side = boundsSize + 2 * padding;
		const cx = (minX + maxX) / 2;
		const cy = (minY + maxY) / 2;
		return { viewBox: `${cx - side / 2} ${cy - side / 2} ${side} ${side}`, overlapCenter };
	}

	return { viewBox: `${minX - padding} ${minY - padding} ${w + 2 * padding} ${h + 2 * padding}`, overlapCenter };
}

function computeHeartViewBox(
	design: HeartDesign,
	opts: { paddingRatio?: number; square?: boolean } = {}
): { viewBox: string; overlapCenter: { x: number; y: number } } {
	const { left, top, width, height } = inferOverlapRect(design.fingers, design.gridSize);
	return computeHeartViewBoxFromOverlap({ left, top, width, height }, opts);
}

function buildHeartOutlinePath(overlap: OverlapLike): string {
	const { left, top, width, height } = overlap;
	const leftRadius = height / 2;
	const topRadius = width / 2;
	return [
		`M ${left} ${top}`,
		`A ${topRadius} ${topRadius} 0 1 1 ${left + width} ${top}`,
		`L ${left + width} ${top + height}`,
		`L ${left} ${top + height}`,
		`A ${leftRadius} ${leftRadius} 0 1 1 ${left} ${top}`,
		'Z'
	].join(' ');
}

interface HeartSvgContent {
	viewBox: string;
	markup: string;
}

function buildHeartSvgContent(
	design: HeartDesign,
	colors: HeartColors,
	opts: {
		size?: number;
		idPrefix?: string;
		paddingRatio?: number;
		outline?: { color?: string; width?: number };
	} = {}
): HeartSvgContent {
	const size = opts.size ?? 600;
	const idPrefix = opts.idPrefix ?? `heart-${Math.random().toString(36).slice(2, 9)}`;
	const paddingRatio = opts.paddingRatio ?? 0.021;

	const weaveParity = (design.weaveParity ?? 0) as 0 | 1;
	const weaveData = design.fingers.length ? computeWeaveData(design.fingers, design.gridSize, weaveParity) : null;

	if (!weaveData) {
		return {
			viewBox: `0 0 ${size} ${size}`,
			markup: `<rect x="${size / 4}" y="${size / 4}" width="${size / 2}" height="${size / 2}" fill="${colors.left}" opacity="0.3" />`
		};
	}

	const { viewBox, overlapCenter } = computeHeartViewBox(design, { paddingRatio, square: true });
	const rotationTransform = `rotate(45, ${overlapCenter.x}, ${overlapCenter.y})`;
	const clipId = `${idPrefix}-overlap`;
	const outline = opts.outline;
	const outlinePath = outline ? buildHeartOutlinePath(weaveData.overlap) : null;
	const outlineColor = outline?.color ?? '#111';
	const outlineWidth = outline?.width ?? Math.max(weaveData.overlap.width, weaveData.overlap.height) * 0.008;

	const stripPath = [
		...weaveData.rightOnTopStrips.map((s) => s.pathData),
		...weaveData.leftOnTopStrips.map((s) => s.pathData)
	].join(' ');

	const markup = [
		`<g transform="${rotationTransform}">`,
		`<defs><clipPath id="${clipId}"><rect x="${weaveData.overlap.left}" y="${weaveData.overlap.top}" width="${weaveData.overlap.width}" height="${weaveData.overlap.height}" /></clipPath></defs>`,
		`<path d="${weaveData.leftLobeClip}" fill="${colors.left}" />`,
		`<path d="${weaveData.rightLobeClip}" fill="${colors.right}" />`,
		`<g clip-path="url(#${clipId})">`,
		`<rect x="${weaveData.overlap.left}" y="${weaveData.overlap.top}" width="${weaveData.overlap.width}" height="${weaveData.overlap.height}" fill="${colors.left}" />`,
		`<path d="${stripPath}" fill="${colors.right}" fill-rule="evenodd" />`,
		`</g>`,
		outlinePath
			? `<path d="${outlinePath}" fill="none" stroke="${outlineColor}" stroke-width="${outlineWidth}" stroke-linejoin="round" stroke-linecap="round" />`
			: '',
		`</g>`
	].join('');

	return { viewBox, markup };
}

export function renderHeartSvgInline(
	design: HeartDesign,
	colors: HeartColors,
	opts: { size?: number; idPrefix?: string; paddingRatio?: number; outline?: { color?: string; width?: number } } = {}
): HeartSvgContent {
	return buildHeartSvgContent(design, colors, opts);
}

export function renderHeartSvgMarkup(
	design: HeartDesign,
	colors: HeartColors,
	opts: {
		size?: number;
		idPrefix?: string;
		paddingRatio?: number;
		outline?: { color?: string; width?: number };
	} = {}
): string {
	const size = opts.size ?? 600;
	const { viewBox, markup } = buildHeartSvgContent(design, colors, opts);

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">`,
		markup,
		`</svg>`
	].join('');
}
