import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportSettings } from './engine';

/*
 * The engine's door is mostly settings, which the engine itself checks. What is
 * ours to get right is the traffic: one request at a time, in the order it was
 * asked for, and a cancel that stops the work rather than the caller's interest
 * in it. Both are module state shared by every caller, so each test starts from
 * a fresh module and a fresh fake worker.
 */

type FakeWorker = {
	postMessage: ReturnType<typeof vi.fn>;
	terminate: ReturnType<typeof vi.fn>;
	onmessage: ((event: MessageEvent) => void) | null;
};

let workers: FakeWorker[] = [];

beforeEach(() => {
	workers = [];
	vi.resetModules();
	vi.stubGlobal(
		'Worker',
		class {
			postMessage = vi.fn();
			terminate = vi.fn();
			onmessage: ((event: MessageEvent) => void) | null = null;
			onerror: ((event: ErrorEvent) => void) | null = null;
			onmessageerror: (() => void) | null = null;
			constructor() {
				workers.push(this as unknown as FakeWorker);
			}
		}
	);
});

/** Let the queue's promises settle, so what has been sent is what will be sent. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Answer the request a worker was given, by its own id: `InverseWorker` ignores
 * a message whose id is not the one it is waiting for, and a stopped worker
 * leaves a gap in the numbering.
 */
function reply(worker: FakeWorker, call: number, data: Record<string, unknown>): void {
	const sent = worker.postMessage.mock.calls[call]![0] as { id: number };
	worker.onmessage?.({ data: { ...data, id: sent.id } } as MessageEvent);
}

const SETTINGS: ImportSettings = {
	mode: 'auto',
	swatches: ['#b91313', '#ffffff'],
	invert: false,
	paperColors: ['#b91313', '#ffffff']
};

const PICTURE = {
	type: 'pixels' as const,
	rgba: new Uint8ClampedArray(4),
	imageWidth: 1,
	imageHeight: 1
};

describe('the engine door', () => {
	it('makes a second caller wait instead of meeting the engine’s refusal', async () => {
		const { prepareImage, detectCorners } = await import('./engine');
		// The dialog's debounced preview and its corner search race exactly like
		// this, and `InverseWorker.request` rejects the second outright.
		const prepared = prepareImage({ type: 'svg', text: '<svg/>' }, SETTINGS);
		const corners = detectCorners(PICTURE);
		await settle();
		expect(workers).toHaveLength(1);
		expect(workers[0]!.postMessage).toHaveBeenCalledTimes(1);

		reply(workers[0]!, 0, { type: 'prepared', preview: 'the mask' });
		await expect(prepared).resolves.toBe('the mask');
		await settle();
		expect(workers[0]!.postMessage).toHaveBeenCalledTimes(2);
		reply(workers[0]!, 1, { type: 'crops', crops: 'the corners' });
		await expect(corners).resolves.toBe('the corners');
	});

	it('lets the next caller through when the one before it failed', async () => {
		const { prepareImage, detectCorners } = await import('./engine');
		const prepared = prepareImage({ type: 'svg', text: '<svg/>' }, SETTINGS);
		const corners = detectCorners(PICTURE);
		await settle();
		reply(workers[0]!, 0, { type: 'error', message: 'Billedet kunne ikke læses' });
		await expect(prepared).rejects.toMatchObject({ name: 'EngineError' });
		await settle();
		reply(workers[0]!, 1, { type: 'crops', crops: 'the corners' });
		await expect(corners).resolves.toBe('the corners');
	});

	it('stops the work in flight and drops what was queued behind it', async () => {
		const { prepareImage, detectCorners, cancel } = await import('./engine');
		const prepared = prepareImage({ type: 'svg', text: '<svg/>' }, SETTINGS);
		const corners = detectCorners(PICTURE);
		await settle();

		cancel();
		await expect(prepared).rejects.toMatchObject({ name: 'AbortError' });
		await expect(corners).rejects.toMatchObject({ name: 'AbortError' });
		expect(workers[0]!.terminate).toHaveBeenCalledOnce();
		// The point of stopping: the queued request must not start a fresh worker
		// on a 24-megapixel prepare nobody is waiting for any more.
		expect(workers).toHaveLength(1);
		expect(workers[0]!.postMessage).toHaveBeenCalledTimes(1);
	});

	it('builds a new worker for the next request after a cancel', async () => {
		const { prepareImage, cancel } = await import('./engine');
		const stopped = prepareImage({ type: 'svg', text: '<svg/>' }, SETTINGS);
		await settle();
		cancel();
		await expect(stopped).rejects.toMatchObject({ name: 'AbortError' });

		const again = prepareImage({ type: 'svg', text: '<svg/>' }, SETTINGS);
		await settle();
		expect(workers).toHaveLength(2);
		reply(workers[1]!, 0, { type: 'prepared', preview: 'the mask' });
		await expect(again).resolves.toBe('the mask');
	});

	it('sends the mask resolution and the visitor’s colour choices, and no solve settings', async () => {
		const { prepareImage } = await import('./engine');
		const { MASK_SIZE } = await import('$lib/paint/mask');
		void prepareImage({ type: 'svg', text: '<svg/>' }, { ...SETTINGS, invert: true });
		await settle();
		const [message] = workers[0]!.postMessage.mock.calls[0] as [
			{ action: string; settings: Record<string, unknown> }
		];
		expect(message.action).toBe('prepare');
		expect(message.settings).toMatchObject({ resolution: MASK_SIZE, mode: 'auto', invert: true });
		// A time limit past 180 seconds is refused by the engine's own validation
		// before a pixel is classified, and preparing has no use for one anyway.
		expect(message.settings.timeLimit).toBeUndefined();
	});
});
