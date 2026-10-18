import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleError } from './hooks.client';

type Input = Parameters<typeof handleError>[0];

const call = (status: number, message: string) =>
	handleError({ error: new Error(message), event: {} as Input['event'], status, message });

describe('client handleError', () => {
	afterEach(() => vi.restoreAllMocks());

	it('stays quiet for a 404', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await call(404, 'Not Found')).toEqual({ message: 'Not Found' });
		expect(log).not.toHaveBeenCalled();
	});

	it('still logs anything else', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await call(500, 'Internal Error')).toEqual({ message: 'Internal Error' });
		expect(log).toHaveBeenCalledOnce();
	});
});
