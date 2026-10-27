import { describe, expect, it } from 'vitest';
import type { Point } from '$lib/inverse/client';
import { createMask, type Mask } from './mask';
import { photoLevels, type PhotoPixels } from './photoLevels';

const N = 100, SIDE = 440;
const YELLOW = [212, 161, 22], WHITE = [214, 196, 184], TABLE = [120, 90, 60];

/** The woven square in the photograph, a little in perspective: (u, v, 1) → photo pixels, counted in edges. */
const H = [
	[170, -150, 210],
	[160, 190, 40],
	[0.0004, -0.0002, 1]
];
const toPhoto = (u: number, v: number): Point => {
	const w = H[2]![0]! * u + H[2]![1]! * v + H[2]![2]!;
	return [(H[0]![0]! * u + H[0]![1]! * v + H[0]![2]!) / w, (H[1]![0]! * u + H[1]![1]! * v + H[1]![2]!) / w];
};
const QUAD = [toPhoto(0, 0), toPhoto(1, 0), toPhoto(1, 1), toPhoto(0, 1)];

/** Back from the photograph to the square, by the inverse matrix. */
function toSquare(x: number, y: number): [number, number] {
	const [[a, b, c], [d, e, f], [g, h, i]] = H as [number[], number[], number[]];
	const inv = [e! * i! - f! * h!, c! * h! - b! * i!, b! * f! - c! * e!, f! * g! - d! * i!, a! * i! - c! * g!, c! * d! - a! * f!, d! * h! - e! * g!, b! * g! - a! * h!, a! * e! - b! * d!];
	const w = inv[6]! * x + inv[7]! * y + inv[8]!;
	return [(inv[0]! * x + inv[1]! * y + inv[2]!) / w, (inv[3]! * x + inv[4]! * y + inv[5]!) / w];
}

/** A disc of white paper on yellow, in the square's own coordinates. */
const white = (u: number, v: number) => (u - 0.52) ** 2 + (v - 0.47) ** 2 <= 0.29 ** 2;

/** The photograph: each pixel the mix its area covers, darker to one side, with noise. */
function photograph(): PhotoPixels {
	const rgba = new Uint8ClampedArray(SIDE * SIDE * 4);
	let seed = 11;
	const noise = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 16;
	for (let py = 0; py < SIDE; py++)
		for (let px = 0; px < SIDE; px++) {
			let cover = 0, inside = 0;
			for (let j = 0; j < 4; j++)
				for (let i = 0; i < 4; i++) {
					const [u, v] = toSquare(px + (i + 0.5) / 4, py + (j + 0.5) / 4);
					if (u < 0 || v < 0 || u > 1 || v > 1) continue;
					inside++;
					if (white(u, v)) cover++;
				}
			const shade = 0.82 + 0.18 * (px / SIDE);
			for (let c = 0; c < 3; c++) {
				const paper = inside ? (YELLOW[c]! * (inside - cover) + WHITE[c]! * cover) / inside : TABLE[c]!;
				rgba[4 * (py * SIDE + px) + c] = paper * shade + noise();
			}
			rgba[4 * (py * SIDE + px) + 3] = 255;
		}
	return { rgba, width: SIDE, height: SIDE };
}

/** The cells as the engine reads them: the photograph at each cell's centre, the nearer paper. */
function cellsOf(photo: PhotoPixels): Mask {
	const mask = createMask(0, N);
	for (let y = 0; y < N; y++)
		for (let x = 0; x < N; x++) {
			const [px, py] = toPhoto((x + 0.5) / N, (y + 0.5) / N), k = 4 * (Math.round(py - 0.5) * SIDE + Math.round(px - 0.5));
			const shade = 0.82 + 0.18 * (px / SIDE), d = (p: number[]) => p.reduce((s, v, c) => s + (photo.rgba[k + c]! - v * shade) ** 2, 0);
			mask.data[y * N + x] = d(WHITE) < d(YELLOW) ? 1 : 0;
		}
	return mask;
}

/** The share of a grid four times finer that the mask, read between its cells, gets wrong. */
function misread(share: (i: number) => number): number {
	const F = 4 * N;
	let wrong = 0;
	for (let fy = 0; fy < F; fy++) {
		const v = Math.max(0, Math.min(N - 1, (fy + 0.5) / 4 - 0.5)), y0 = Math.min(N - 2, Math.floor(v)), ty = v - y0;
		for (let fx = 0; fx < F; fx++) {
			const u = Math.max(0, Math.min(N - 1, (fx + 0.5) / 4 - 0.5)), x0 = Math.min(N - 2, Math.floor(u)), tx = u - x0, i = y0 * N + x0;
			const value = (share(i) * (1 - tx) + share(i + 1) * tx) * (1 - ty) + (share(i + N) * (1 - tx) + share(i + N + 1) * tx) * ty;
			if ((value >= 127.5) !== white((fx + 0.5) / F, (fy + 0.5) / F)) wrong++;
		}
	}
	return wrong / F ** 2;
}

describe('photoLevels', () => {
	it("puts a photographed edge where the photograph's mixed colours say, not on the cells", () => {
		const photo = photograph(), mask = cellsOf(photo);
		const level = photoLevels(mask, photo, QUAD)!;
		expect(level).not.toBeNull();
		const fromLevels = misread((i) => level[i]!), fromCells = misread((i) => mask.data[i]! * 255);
		expect(fromLevels).toBeLessThan(fromCells / 3);
	});

	it('keeps every cell on its own side of one half', () => {
		const photo = photograph(), mask = cellsOf(photo);
		const level = photoLevels(mask, photo, QUAD)!;
		for (let i = 0; i < N * N; i++) expect(level[i]! >= 128).toBe(mask.data[i] === 1);
	});

	it('gives nothing for a photograph that does not look like two papers', () => {
		const photo = photograph(), mask = cellsOf(photo);
		let seed = 3;
		const noise = { ...photo, rgba: Uint8ClampedArray.from(photo.rgba, (_, k) => (k % 4 === 3 ? 255 : (seed = (seed * 69069 + 1) % 4294967296) % 256)) };
		expect(photoLevels(mask, noise, QUAD)).toBeNull();
		// Nor for corners that are not where the square is.
		const off = QUAD.map(([x, y]) => [x + 60, y - 50] as Point);
		expect(photoLevels(mask, photo, off)).toBeNull();
	});
});
