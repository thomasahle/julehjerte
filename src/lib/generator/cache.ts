import { CELL_FRAMES, type GeneratorState } from './state';
import type { GeneratorResult } from './generate';

/** Only choices that change the cutting pattern belong in its cache key. */
export function geometryKey(s: GeneratorState): string {
	return JSON.stringify(
		s.mode === 'text'
			? [s.mode, s.text.normalize('NFC'), s.font, s.textFrame, ...CELL_FRAMES.includes(s.textFrame) ? [s.cells] : []]
			: s.mode === 'figure'
				? // Small motifs and equal squares fill their squares, and the
					// board's circle and motif follow the board; the silhouette
					// fills the whole square, so none depends on the frame size.
					s.style === 'motifs' || s.style === 'squares' || s.style === 'board' ? [s.mode, s.motif, s.style]
					: s.style === 'silhouette' ? [s.mode, s.motif, s.scale, s.spacing, s.style]
					: [s.mode, s.motif, s.frame, s.frameSize, s.scale, s.style, ...s.style === 'wedges' ? [s.spacing] : []]
				: [s.mode]
	);
}

/** A small per-visit cache keeps slider backtracking and frame comparisons instant. */
export class GeometryCache<T = GeneratorResult> {
	private values = new Map<string, T>();
	constructor(private capacity = 32) {}
	get(key: string): T | undefined {
		const value = this.values.get(key);
		if (value) {
			this.values.delete(key);
			this.values.set(key, value);
		}
		return value;
	}
	set(key: string, value: T): void {
		this.values.delete(key);
		this.values.set(key, value);
		while (this.values.size > this.capacity)
			this.values.delete(this.values.keys().next().value!);
	}
}
