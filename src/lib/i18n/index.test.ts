import { describe, expect, it } from 'vitest';
import { langFromParam, langFromPathname } from './index';

describe('langFromParam', () => {
	it("is English only for the route's 'en' segment", () => {
		expect(langFromParam('en')).toBe('en');
		expect(langFromParam(undefined)).toBe('da');
		expect(langFromParam('')).toBe('da');
		expect(langFromParam('da')).toBe('da');
		expect(langFromParam('EN')).toBe('da');
	});
});

describe('langFromPathname', () => {
	it('reads the /en prefix, with or without a base path', () => {
		expect(langFromPathname('/en/hjerte/classic-3x3/')).toBe('en');
		expect(langFromPathname('/en')).toBe('en');
		expect(langFromPathname('/hjerte/classic-3x3/')).toBe('da');
		expect(langFromPathname('/english/')).toBe('da');
		expect(langFromPathname('/base/en/', '/base')).toBe('en');
	});
});
