import { describe, expect, it, vi } from 'vitest';
import { parseWholeNumber, typeDecimalPoint } from './numberInput';

describe('parseWholeNumber', () => {
	it('reads a decimal comma as a point, never as a thousands separator', () => {
		expect(parseWholeNumber('80,5')).toBe(81);
		expect(parseWholeNumber('80,4')).toBe(80);
		expect(parseWholeNumber('80.5')).toBe(81);
	});

	it('rounds to whole millimetres', () => {
		expect(parseWholeNumber('62.4')).toBe(62);
		expect(parseWholeNumber(' 75 ')).toBe(75);
	});

	it('gives NaN for blank or garbage, for the caller to refuse', () => {
		expect(parseWholeNumber('')).toBeNaN();
		expect(parseWholeNumber('  ')).toBeNaN();
		expect(parseWholeNumber('abc')).toBeNaN();
		expect(parseWholeNumber('1,2,3')).toBeNaN();
	});
});

describe('typeDecimalPoint', () => {
	const key = (k: string, init: KeyboardEventInit = {}) =>
		new KeyboardEvent('keydown', { key: k, cancelable: true, ...init });

	it('types a point for the comma key', () => {
		const exec = vi.fn(() => true);
		document.execCommand = exec;
		const event = key(',');
		typeDecimalPoint(event);
		expect(exec).toHaveBeenCalledWith('insertText', false, '.');
		expect(event.defaultPrevented).toBe(true);
	});

	it('leaves the comma alone when the point cannot be inserted, and other keys always', () => {
		document.execCommand = vi.fn(() => false);
		const comma = key(',');
		typeDecimalPoint(comma);
		expect(comma.defaultPrevented).toBe(false);
		const digit = key('5');
		typeDecimalPoint(digit);
		expect(digit.defaultPrevented).toBe(false);
		expect(document.execCommand).toHaveBeenCalledTimes(1);
	});
});
