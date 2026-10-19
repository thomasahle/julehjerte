import { describe, expect, it } from 'vitest';
import { escapeXml } from './xml';

describe('escapeXml', () => {
	it('escapes the characters that end text or a double-quoted attribute', () => {
		expect(escapeXml('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
	});

	it('escapes the ampersand first, so an entity is not escaped twice over', () => {
		expect(escapeXml('&lt;')).toBe('&amp;lt;');
	});

	it('leaves other text, single quotes and non-ASCII alone', () => {
		expect(escapeXml("Jul's hjerte · Ærø")).toBe("Jul's hjerte · Ærø");
		expect(escapeXml('')).toBe('');
	});

	it('round-trips through an XML parser as text and as an attribute', () => {
		const value = 'R&D <"hjerte"> & co';
		const doc = new DOMParser().parseFromString(
			`<svg xmlns="http://www.w3.org/2000/svg" data-x="${escapeXml(value)}"><title>${escapeXml(value)}</title></svg>`,
			'image/svg+xml'
		);
		expect(doc.querySelector('parsererror')).toBeNull();
		expect(doc.documentElement.getAttribute('data-x')).toBe(value);
		expect(doc.querySelector('title')?.textContent).toBe(value);
	});
});
