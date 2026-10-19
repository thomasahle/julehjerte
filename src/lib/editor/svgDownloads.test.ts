/**
 * The editor's "Eksportér SVG" and template SVG downloads. They used to revoke
 * the object URL right after `click()`, which in a browser that starts the
 * download after the click handler returns saves nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COLORS } from '$lib/stores/colors';
import { loadHeart } from '$lib/laser/testHearts.test-helpers';
import { REVOKE_DELAY_MS } from '$lib/utils/download';
import { downloadHeartSvg, downloadTemplateSvg } from './svgDownloads';

let blobs: Blob[];
let revoked: string[];
let clicks: { name: string; revokedAtClick: boolean }[];

beforeEach(() => {
	vi.useFakeTimers();
	blobs = [];
	revoked = [];
	clicks = [];
	URL.createObjectURL = vi.fn((blob: Blob) => {
		blobs.push(blob);
		return `blob:test/${blobs.length}`;
	});
	URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
		clicks.push({ name: this.download, revokedAtClick: revoked.includes(this.href) });
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe.each([
	['Eksportér SVG', (d: ReturnType<typeof loadHeart>) => downloadHeartSvg(d), '.svg'],
	['template SVG', (d: ReturnType<typeof loadHeart>) => downloadTemplateSvg(d, DEFAULT_COLORS), '-template.svg']
])('%s', (_label, run, suffix) => {
	it('does not revoke the URL before the click has been handled', async () => {
		const design = loadHeart('classic-3x3');
		run(design);
		expect(clicks).toHaveLength(1);
		expect(clicks[0].revokedAtClick).toBe(false);
		// Still alive once the click handler has returned.
		expect(revoked).toEqual([]);
		vi.advanceTimersByTime(REVOKE_DELAY_MS);
		expect(revoked).toEqual(['blob:test/1']);

		expect(clicks[0].name.endsWith(suffix)).toBe(true);
		expect(blobs[0].type).toBe('image/svg+xml');
		const text = await blobs[0].text();
		expect(text.length).toBeGreaterThan(100);
		expect(text).toContain('<svg');
	});
});
