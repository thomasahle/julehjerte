import { describe, it, expect } from 'vitest';
import type { Finger, HeartDesign, Vec } from '$lib/types/heart';
import { getCenteredRectParams } from '$lib/utils/overlapRect';
import { DRAFT_KEY, clearDraft, gallerySource, readDraft, writeDraft } from './draft';

/** A minimal in-memory Storage. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
	const map = new Map(Object.entries(initial));
	return {
		get length() {
			return map.size;
		},
		clear: () => map.clear(),
		getItem: (k: string) => map.get(k) ?? null,
		key: (i: number) => [...map.keys()][i] ?? null,
		removeItem: (k: string) => void map.delete(k),
		setItem: (k: string, v: string) => void map.set(k, v)
	};
}

/** Storage that throws on every access, like a browser blocking site data. */
function throwingStorage(): Storage {
	const boom = () => {
		throw new DOMException('denied', 'SecurityError');
	};
	return {
		get length(): number {
			return boom();
		},
		clear: boom,
		getItem: boom,
		key: boom,
		removeItem: boom,
		setItem: boom
	} as unknown as Storage;
}

/** An n x n design the way the editor holds it: n + 1 boundary curves per lobe. */
function makeDesign(n = 3, overrides: Partial<HeartDesign> = {}): HeartDesign {
	const rect = getCenteredRectParams({ x: n, y: n });
	const fingers: Finger[] = [];
	for (let i = 0; i <= n; i++) {
		const y = rect.top + (i / n) * rect.height;
		const p0: Vec = { x: rect.right, y };
		const p3: Vec = { x: rect.left, y };
		fingers.push({
			id: `L-${i}`,
			lobe: 'left',
			segments: [{ p0, p1: { x: p0.x - rect.width / 3, y }, p2: { x: p3.x + rect.width / 3, y }, p3 }]
		});
	}
	for (let i = 0; i <= n; i++) {
		const x = rect.left + (i / n) * rect.width;
		const p0: Vec = { x, y: rect.bottom };
		const p3: Vec = { x, y: rect.top };
		fingers.push({
			id: `R-${i}`,
			lobe: 'right',
			segments: [{ p0, p1: { x, y: p0.y - rect.height / 3 }, p2: { x, y: p3.y + rect.height / 3 }, p3 }]
		});
	}
	return {
		id: 'draft-heart',
		name: 'Mit hjerte',
		author: '',
		weaveParity: 0,
		gridSize: { x: n, y: n },
		fingers,
		...overrides
	};
}

describe('readDraft', () => {
	it('finds no draft in an empty browser', () => {
		expect(readDraft(fakeStorage())).toBeNull();
		expect(readDraft(null)).toBeNull();
	});

	it('round-trips the design, its source and its timestamp', () => {
		const storage = fakeStorage();
		const design = makeDesign(4, { name: 'Stjerne (Kopi)', author: 'Ida', description: 'note' });
		writeDraft({ design, source: gallerySource('stjerne'), savedAt: 1_700_000_000_000 }, storage);

		const draft = readDraft(storage);
		expect(draft).not.toBeNull();
		expect(draft!.source).toBe('gallery:stjerne');
		expect(draft!.savedAt).toBe(1_700_000_000_000);
		expect(draft!.design.name).toBe('Stjerne (Kopi)');
		expect(draft!.design.author).toBe('Ida');
		expect(draft!.design.description).toBe('note');
		expect(draft!.design.id).toBe('draft-heart');
		expect(draft!.design.gridSize).toEqual({ x: 4, y: 4 });
		// The outer boundary curves are editor scaffolding: dropped on write, rebuilt on read.
		expect(draft!.design.fingers).toHaveLength(design.fingers.length);
	});

	it('keeps the colours the visitor picked', () => {
		const storage = fakeStorage();
		const colors = { left: '#ff0000', right: '#00ff00' };
		writeDraft({ design: makeDesign(3, { colors }), source: 'blank', savedAt: 1 }, storage);
		expect(readDraft(storage)!.design.colors).toEqual(colors);
	});

	it('ignores a value that is not JSON, rather than throwing', () => {
		expect(readDraft(fakeStorage({ [DRAFT_KEY]: 'not json {' }))).toBeNull();
	});

	it('ignores JSON that is not a heart', () => {
		expect(readDraft(fakeStorage({ [DRAFT_KEY]: '"a string"' }))).toBeNull();
		expect(readDraft(fakeStorage({ [DRAFT_KEY]: '[1,2,3]' }))).toBeNull();
		expect(readDraft(fakeStorage({ [DRAFT_KEY]: '{"source":"blank"}' }))).toBeNull();
	});

	it('falls back to a blank source and no timestamp when those fields are junk', () => {
		const storage = fakeStorage();
		writeDraft({ design: makeDesign(), source: 'blank', savedAt: 5 }, storage);
		const stored = JSON.parse(storage.getItem(DRAFT_KEY)!) as Record<string, unknown>;
		stored.source = 42;
		stored.savedAt = 'yesterday';
		storage.setItem(DRAFT_KEY, JSON.stringify(stored));

		const draft = readDraft(storage);
		expect(draft!.source).toBe('blank');
		expect(draft!.savedAt).toBe(0);
	});

	it('finds no draft when storage throws', () => {
		expect(readDraft(throwingStorage())).toBeNull();
	});
});

describe('writeDraft', () => {
	it('keeps a single draft: a second new heart replaces the first', () => {
		const storage = fakeStorage();
		writeDraft({ design: makeDesign(3, { name: 'First' }), source: 'blank', savedAt: 1 }, storage);
		writeDraft({ design: makeDesign(3, { name: 'Second' }), source: 'shared', savedAt: 2 }, storage);

		expect(storage.length).toBe(1);
		expect(readDraft(storage)!.design.name).toBe('Second');
	});

	it('does not throw when storage does, or when there is none', () => {
		const draft = { design: makeDesign(), source: 'blank', savedAt: 1 };
		expect(() => writeDraft(draft, throwingStorage())).not.toThrow();
		expect(() => writeDraft(draft, null)).not.toThrow();
	});
});

describe('clearDraft', () => {
	it('leaves no draft to restore once the heart has been saved', () => {
		const storage = fakeStorage();
		writeDraft({ design: makeDesign(), source: 'blank', savedAt: 1 }, storage);
		expect(readDraft(storage)).not.toBeNull();

		clearDraft(storage);
		expect(storage.getItem(DRAFT_KEY)).toBeNull();
		expect(readDraft(storage)).toBeNull();
	});

	it('touches nothing else in storage', () => {
		const storage = fakeStorage({ 'julehjerte-collection': '[]' });
		writeDraft({ design: makeDesign(), source: 'blank', savedAt: 1 }, storage);
		clearDraft(storage);
		expect(storage.getItem('julehjerte-collection')).toBe('[]');
	});

	it('does not throw when storage does, or when there is none', () => {
		expect(() => clearDraft(throwingStorage())).not.toThrow();
		expect(() => clearDraft(null)).not.toThrow();
	});
});
