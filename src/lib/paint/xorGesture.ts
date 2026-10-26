/** Invert a gesture's footprint once, even when dabs or symmetry copies overlap. */
import type { Vec } from '$lib/types/heart';
import { cloneMask, createMask, emptyBox, isEmptyBox, paintCell, unionBox, type Box, type Mask } from './mask';
import { applySymmetric, ellipse, floodFill, rect, stroke } from './tools';
import type { Transform } from './symmetry';
import type { BrushShape } from './toolset';

export function createXorGesture(mask: Mask, transforms: Transform[] = []) {
	const before = cloneMask(mask);
	const covered = createMask(0, mask.size);

	function invert(box: Box): Box {
		if (isEmptyBox(box)) return box;
		const area = applySymmetric(covered, box, transforms, 1);
		let changed = emptyBox();
		for (let y = area.y0; y < area.y1; y++) {
			for (let x = area.x0; x < area.x1; x++) {
				const i = y * mask.size + x;
				if (covered.data[i] && paintCell(mask, i, before.data[i] ? 0 : 1)) {
					changed = unionBox(changed, { x0: x, y0: y, x1: x + 1, y1: y + 1 });
				}
			}
		}
		return changed;
	}

	return {
		stroke(from: Vec, to: Vec, radius: number, shape?: BrushShape): Box {
			return invert(stroke(covered, from, to, { radius, value: 1, shape }));
		},
		rect(from: Vec, to: Vec): Box {
			return invert(rect(covered, from, to, 1));
		},
		ellipse(from: Vec, to: Vec): Box {
			return invert(ellipse(covered, from, to, 1));
		},
		fill(x: number, y: number, fence?: Uint8Array | null): Box {
			const sx = Math.round(x), sy = Math.round(y);
			if (sx < 0 || sy < 0 || sx >= mask.size || sy >= mask.size) return emptyBox();
			// Flood membership comes from the original picture, not the coverage mask.
			const filled = cloneMask(before);
			const box = floodFill(filled, x, y, before.data[sy * mask.size + sx] ? 0 : 1, fence);
			for (let row = box.y0; row < box.y1; row++) {
				for (let col = box.x0; col < box.x1; col++) {
					const i = row * mask.size + col;
					if (filled.data[i] !== before.data[i]) covered.data[i] = 1;
				}
			}
			return invert(box);
		}
	};
}
