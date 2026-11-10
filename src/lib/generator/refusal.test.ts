import { describe, expect, it } from 'vitest';
import { CutGeometryError } from '$lib/inverse/toHeartDesign';
import { CompilationError, ConstructionError } from './geometry';
import { isRefusal, refusal, unlessRefused } from './refusal';

describe('refusal', () => {
	const construction = new ConstructionError('clearance', 'no room');
	const compilation = new CompilationError('no room');
	const fault = new TypeError('a fault');

	it('takes the construction and the cut check saying no as refusals', () => {
		expect(isRefusal(construction)).toBe(true);
		expect(isRefusal(compilation)).toBe(true);
		expect(isRefusal(Object.create(CutGeometryError.prototype))).toBe(true);
		expect(isRefusal(fault)).toBe(false);
		expect(isRefusal(undefined)).toBe(false);
	});

	it('lets a refusal pass and throws a fault on', () => {
		expect(() => refusal(construction)).not.toThrow();
		expect(() => refusal(fault)).toThrow(fault);
	});

	it('gives nothing for a way that refuses', () => {
		expect(unlessRefused(() => 3)).toBe(3);
		expect(unlessRefused(() => { throw construction; })).toBeUndefined();
		expect(() => unlessRefused(() => { throw fault; })).toThrow(fault);
	});
});
