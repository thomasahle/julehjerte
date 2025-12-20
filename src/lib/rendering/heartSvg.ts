import type { HeartDesign } from '$lib/types/heart';
import type { HeartColors } from '$lib/stores/colors';
import { computeWeaveData } from '$lib/rendering/svgWeave';
import { inferOverlapRect } from '$lib/utils/overlapRect';

export function computeHeartViewBox(
	design: HeartDesign,
	opts: { paddingRatio?: number; square?: boolean } = {}
): { viewBox: string; overlapCenter: { x: number; y: number } } {
	const paddingRatio = opts.paddingRatio ?? 0.021;
	const square = opts.square ?? true;

	const { left, top, width, height } = inferOverlapRect(design.fingers, design.gridSize);
	const overlapCenter = { x: left + width / 2, y: top + height / 2 };

	// Bounds of the unrotated lobe union: overlap rect + left ear (extends left) + right ear (extends up).
	const preRotBounds = {
		left: left - height / 2,
		top: top - width / 2,
		right: left + width,
		bottom: top + height
	};

	const cos45 = Math.SQRT1_2;
	const sin45 = Math.SQRT1_2;

	const corners = [
		{ x: preRotBounds.left, y: preRotBounds.top },
		{ x: preRotBounds.right, y: preRotBounds.top },
		{ x: preRotBounds.left, y: preRotBounds.bottom },
		{ x: preRotBounds.right, y: preRotBounds.bottom }
	];

	const rotated = corners.map(({ x, y }) => {
		const dx = x - overlapCenter.x;
		const dy = y - overlapCenter.y;
		return {
			x: dx * cos45 - dy * sin45 + overlapCenter.x,
			y: dx * sin45 + dy * cos45 + overlapCenter.y
		};
	});

	const minX = Math.min(...rotated.map((c) => c.x));
	const maxX = Math.max(...rotated.map((c) => c.x));
	const minY = Math.min(...rotated.map((c) => c.y));
	const maxY = Math.max(...rotated.map((c) => c.y));

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

export function renderHeartSvgMarkup(
	design: HeartDesign,
	colors: HeartColors,
	opts: { size?: number; idPrefix?: string; paddingRatio?: number } = {}
): string {
	const size = opts.size ?? 600;
	const idPrefix = opts.idPrefix ?? `heart-${Math.random().toString(36).slice(2, 9)}`;
	const paddingRatio = opts.paddingRatio ?? 0.021;

	const weaveParity = (design.weaveParity ?? 0) as 0 | 1;
	const weaveData = design.fingers.length ? computeWeaveData(design.fingers, design.gridSize, weaveParity) : null;

	const { viewBox, overlapCenter } = computeHeartViewBox(design, { paddingRatio, square: true });
	const rotationTransform = `rotate(45, ${overlapCenter.x}, ${overlapCenter.y})`;
	const clipId = `${idPrefix}-overlap`;

	if (!weaveData) {
		return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet"><rect x="${size / 4}" y="${size / 4}" width="${size / 2}" height="${size / 2}" fill="${colors.left}" opacity="0.3" /></svg>`;
	}

	const stripPath = [
		...weaveData.rightOnTopStrips.map((s) => s.pathData),
		...weaveData.leftOnTopStrips.map((s) => s.pathData)
	].join(' ');

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">`,
		`<g transform="${rotationTransform}">`,
		`<defs><clipPath id="${clipId}"><rect x="${weaveData.overlap.left}" y="${weaveData.overlap.top}" width="${weaveData.overlap.width}" height="${weaveData.overlap.height}" /></clipPath></defs>`,
		`<path d="${weaveData.leftLobeClip}" fill="${colors.left}" />`,
		`<path d="${weaveData.rightLobeClip}" fill="${colors.right}" />`,
		`<g clip-path="url(#${clipId})">`,
		`<rect x="${weaveData.overlap.left}" y="${weaveData.overlap.top}" width="${weaveData.overlap.width}" height="${weaveData.overlap.height}" fill="${colors.left}" />`,
		`<path d="${stripPath}" fill="${colors.right}" fill-rule="evenodd" />`,
		`</g>`,
		`</g>`,
		`</svg>`
	].join('');
}

