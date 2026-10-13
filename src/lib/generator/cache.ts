import type { GeneratorState } from './state';
import type { GeneratorResult } from './generate';

/** Only choices that change the cutting pattern belong in its cache key. */
export function geometryKey(s: GeneratorState): string {
	return JSON.stringify(
		s.mode === 'text'
			? [s.mode, s.text.normalize('NFC'), s.font, s.textFrame]
			: s.mode === 'figure'
				? [s.mode, s.motif, s.frame, s.frameSize, s.scale, s.style]
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
