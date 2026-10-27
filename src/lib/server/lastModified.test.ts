import { describe, expect, it } from 'vitest';
import { parseLastModified } from './lastModified';

const LOG = `@2026-10-27
static/hearts/fejlternet.svg
src/lib/data/heart-meta.json

@2026-10-25
hearts.json

@2026-10-20
static/hearts/photos/5star.jpg

@2026-10-18
static/hearts/5star.svg
static/hearts/fejlternet.svg
`;

describe('parseLastModified', () => {
	it('dates each heart by the newest commit that touched its SVG or photo', () => {
		const { hearts } = parseLastModified(LOG);
		expect(Object.fromEntries(hearts)).toEqual({ fejlternet: '2026-10-27', '5star': '2026-10-20' });
	});

	it('dates the gallery by the newest commit of all', () => {
		expect(parseLastModified(LOG).gallery).toBe('2026-10-27');
	});

	it('reads an empty log as no dates', () => {
		expect(parseLastModified('')).toEqual({ hearts: new Map(), gallery: null });
	});
});
