import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REVOKE_DELAY_MS, downloadBlob } from './download';

let revoked: string[];
let clicks: { href: string; download: string; inDocument: boolean; revokedAtClick: boolean }[];

beforeEach(() => {
	vi.useFakeTimers();
	revoked = [];
	clicks = [];
	URL.createObjectURL = vi.fn(() => 'blob:test/1');
	URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
		clicks.push({
			href: this.href,
			download: this.download,
			inDocument: document.body.contains(this),
			revokedAtClick: revoked.includes(this.href)
		});
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('downloadBlob', () => {
	it('clicks a link to the blob, named as asked, while it is in the document', () => {
		const blob = new Blob(['<svg/>'], { type: 'image/svg+xml' });
		downloadBlob(blob, 'hjerte.svg');
		expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
		expect(clicks).toEqual([
			{ href: 'blob:test/1', download: 'hjerte.svg', inDocument: true, revokedAtClick: false }
		]);
		// The link is gone again.
		expect(document.querySelector('a[download]')).toBeNull();
	});

	it('keeps the URL alive after the click returns, and revokes it a moment later', () => {
		downloadBlob(new Blob(['x']), 'x.txt');
		expect(revoked).toEqual([]);
		vi.advanceTimersByTime(REVOKE_DELAY_MS - 1);
		expect(revoked).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(revoked).toEqual(['blob:test/1']);
	});

	it('still removes the link and revokes the URL when the click throws', () => {
		vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(() => {
			throw new Error('blocked');
		});
		expect(() => downloadBlob(new Blob(['x']), 'x.txt')).toThrow('blocked');
		expect(document.querySelector('a[download]')).toBeNull();
		vi.runAllTimers();
		expect(revoked).toEqual(['blob:test/1']);
	});
});
