/**
 * Invert a gesture's footprint once, even when dabs or symmetry copies overlap.
 *
 * The footprint is drawn on a mask of its own, edge levels and all, and each
 * cell is then read off it and the picture as it was before: one paper or the
 * other, but not both (the greater of the two lesser). So where the footprint
 * ends the picture changes paper along its edge, and where the picture's own
 * edge runs inside it, the edge stays where it was.
 */
import type { Vec } from '$lib/types/heart';
import { cloneMask, createMask, emptyBox, growBox, isEmptyBox, levels, shareAt, type Box, type Mask } from './mask';
import { applySymmetric, ellipse, floodFill, rect, stroke } from './tools';
import type { Transform } from './symmetry';
import type { BrushShape } from './toolset';

export function createXorGesture(mask: Mask, transforms: Transform[] = []) {
	const before = cloneMask(mask);
	const covered = createMask(0, mask.size);

	function invert(box: Box): Box {
		if (isEmptyBox(box)) return box;
		const area = applySymmetric(covered, box, transforms, 1);
		const level = levels(mask), changed = growBox();
		for (let y = area.y0; y < area.y1; y++) {
			for (let x = area.x0; x < area.x1; x++) {
				const i = y * mask.size + x, foot = shareAt(covered, i);
				if (!foot) continue;
				const was = shareAt(before, i), inside = covered.data[i] === 1;
				const cell = inside ? 1 - before.data[i]! : before.data[i]!;
				const either = Math.max(Math.min(was, 255 - foot), Math.min(255 - was, foot));
				const share = cell ? Math.max(128, either) : Math.min(127, either);
				if (mask.data[i] === cell && level[i] === share && (!inside || !mask.validMask || mask.validMask[i])) continue;
				mask.data[i] = cell;
				level[i] = share;
				if (inside && mask.validMask) mask.validMask[i] = 1;
				changed.add(x, y);
			}
		}
		return changed.box();
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
					if (filled.data[i] === before.data[i]) continue;
					covered.data[i] = 1;
					if (covered.level) covered.level[i] = 255;
				}
			}
			return invert(box);
		}
	};
}
