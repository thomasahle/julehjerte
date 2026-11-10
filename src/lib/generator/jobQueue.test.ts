import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ABANDON_MS, createJobQueue, type QueueWorker } from './jobQueue';

type Job = { request: string; token: number };
type Reply = { result?: string; error?: string };

/** A worker that writes down what is done to it, and answers when told. */
class FakeWorker implements QueueWorker {
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	constructor(
		readonly id: number,
		private log: string[]
	) {
		log.push(`start ${id}`);
	}
	postMessage(message: unknown) {
		this.log.push(`post ${this.id} ${message}`);
	}
	terminate() {
		this.log.push(`terminate ${this.id}`);
	}
	reply(data: Reply | { progress: string }) {
		this.onmessage?.({ data } as MessageEvent);
	}
	fail() {
		this.onerror?.({} as ErrorEvent);
	}
}

/** A queue over fake workers, the log of what each worker saw, and of what the page heard. */
function setup() {
	const log: string[] = [],
		heard: string[] = [],
		workers: FakeWorker[] = [];
	const queue = createJobQueue<Job, string, Reply>(
		() => {
			const worker = new FakeWorker(workers.length + 1, log);
			workers.push(worker);
			return worker;
		},
		{
			started: (job) => heard.push(`started ${job.request}`),
			progress: (heart, job) => heard.push(`progress ${heart} for ${job.request}`),
			finished: (reply, job, current) =>
				heard.push(`finished ${job?.request} with ${reply.result ?? reply.error}${current ? '' : ' (superseded)'}`),
			failed: (job, current) => heard.push(`failed ${job?.request}${current ? '' : ' (superseded)'}`)
		},
		{ now: () => Date.now(), setTimeout: (run, ms) => void setTimeout(run, ms) }
	);
	/** A new request and its job, as the page asks for one. */
	const ask = (request: string) => queue.push({ request, token: queue.next() });
	return { queue, log, heard, workers, ask };
}

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe('createJobQueue', () => {
	it('starts the first job at once, in a worker started for it', () => {
		const { log, heard, workers, ask } = setup();
		expect(log).toEqual([]);
		ask('a');
		expect(log).toEqual(['start 1', 'post 1 a']);
		workers[0].reply({ result: 'A' });
		expect(heard).toEqual(['started a', 'finished a with A']);
		// The worker is kept for the next job.
		ask('b');
		expect(log).toEqual(['start 1', 'post 1 a', 'post 1 b']);
	});

	it('starts the worker ahead of a job, once, and posts the job to it', () => {
		const { queue, log, ask } = setup();
		queue.warm();
		queue.warm();
		expect(log).toEqual(['start 1']);
		ask('a');
		expect(log).toEqual(['start 1', 'post 1 a']);
	});

	it('lets only the newest request wait for the running job', () => {
		const { log, heard, workers, ask } = setup();
		ask('a');
		ask('b');
		ask('c');
		expect(log).toEqual(['start 1', 'post 1 a']);
		workers[0].reply({ result: 'A' });
		// The answer for a value already left is still the page's, to keep.
		expect(heard).toEqual(['started a', 'finished a with A (superseded)', 'started c']);
		expect(log).toEqual(['start 1', 'post 1 a', 'post 1 c']);
		workers[0].reply({ error: 'clearance' });
		expect(heard.at(-1)).toBe('finished c with clearance');
		// The timers set while `a` ran find nothing to abandon.
		vi.advanceTimersByTime(10 * ABANDON_MS);
		expect(log).toEqual(['start 1', 'post 1 a', 'post 1 c']);
	});

	it('drops the waiting job when a newer request is asked for', () => {
		const { queue, log, workers, ask } = setup();
		ask('a');
		ask('b');
		queue.next();
		workers[0].reply({ result: 'A' });
		expect(log).toEqual(['start 1', 'post 1 a']);
	});

	it('abandons a job for a value already left once it has run 400 ms, worker and all', () => {
		const { log, heard, ask } = setup();
		ask('a');
		vi.advanceTimersByTime(100);
		ask('b');
		vi.advanceTimersByTime(ABANDON_MS - 100 - 1);
		expect(log).toEqual(['start 1', 'post 1 a']);
		vi.advanceTimersByTime(1);
		expect(log).toEqual(['start 1', 'post 1 a', 'terminate 1', 'start 2', 'post 2 b']);
		// The abandoned job is never answered.
		expect(heard).toEqual(['started a', 'started b']);
	});

	it('abandons at once a job that has already run longer', () => {
		const { log, ask } = setup();
		ask('a');
		vi.advanceTimersByTime(2 * ABANDON_MS);
		ask('b');
		expect(log).toEqual(['start 1', 'post 1 a']);
		vi.advanceTimersByTime(0);
		expect(log).toEqual(['start 1', 'post 1 a', 'terminate 1', 'start 2', 'post 2 b']);
	});

	it('abandons only for the job still waiting', () => {
		const { log, ask } = setup();
		ask('a');
		ask('b');
		vi.advanceTimersByTime(ABANDON_MS / 2);
		ask('c');
		vi.advanceTimersByTime(ABANDON_MS / 2);
		// The first timer was `b`'s; `c`'s comes due at the same moment and takes over.
		expect(log).toEqual(['start 1', 'post 1 a', 'terminate 1', 'start 2', 'post 2 c']);
	});

	it('does not abandon the newest request’s job', () => {
		const { queue, log, workers } = setup();
		const token = queue.next();
		queue.push({ request: 'a', token });
		queue.push({ request: 'a again', token });
		vi.advanceTimersByTime(10 * ABANDON_MS);
		expect(log).toEqual(['start 1', 'post 1 a']);
		workers[0].reply({ result: 'A' });
		expect(log).toEqual(['start 1', 'post 1 a', 'post 1 a again']);
	});

	it('does not abandon a job that finished in time', () => {
		const { log, workers, ask } = setup();
		ask('a');
		ask('b');
		vi.advanceTimersByTime(ABANDON_MS / 2);
		workers[0].reply({ result: 'A' });
		vi.advanceTimersByTime(10 * ABANDON_MS);
		expect(log).toEqual(['start 1', 'post 1 a', 'post 1 b']);
	});

	it('fails the running job when the worker fails, and starts the waiting one in a new worker', () => {
		const { log, heard, workers, ask } = setup();
		ask('a');
		ask('b');
		workers[0].fail();
		expect(log).toEqual(['start 1', 'post 1 a', 'terminate 1', 'start 2', 'post 2 b']);
		workers[1].fail();
		expect(heard).toEqual(['started a', 'failed a (superseded)', 'started b', 'failed b']);
		expect(log.at(-1)).toBe('terminate 2');
	});

	it('reports a failure with nothing running as no job', () => {
		const { queue, heard, workers, ask } = setup();
		queue.warm();
		workers[0].fail();
		expect(heard).toEqual(['failed undefined (superseded)']);
		ask('a');
		expect(workers).toHaveLength(2);
	});

	it('shows hearts on the way only for the newest request', () => {
		const { queue, heard, workers, ask } = setup();
		ask('a');
		workers[0].reply({ progress: 'a1' });
		queue.next();
		workers[0].reply({ progress: 'a2' });
		expect(heard).toEqual(['started a', 'progress a1 for a']);
	});

	it('stops the worker and forgets every job when the page goes', () => {
		const { queue, log, ask } = setup();
		ask('a');
		const token = queue.next();
		queue.push({ request: 'b', token });
		queue.stop();
		expect(queue.isCurrent(token)).toBe(false);
		expect(log).toEqual(['start 1', 'post 1 a', 'terminate 1']);
		vi.advanceTimersByTime(10 * ABANDON_MS);
		expect(log).toEqual(['start 1', 'post 1 a', 'terminate 1']);
	});
});
