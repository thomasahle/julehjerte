/**
 * The generator page's preview worker and the jobs it runs.
 *
 * One job runs at a time and only the newest request waits for it: while a
 * slider moves, only its latest value waits, and every finished result goes
 * to the page, which keeps them for moving back. A job still running for a
 * value already left is abandoned once it has run `ABANDON_MS`, worker and
 * all, so a slow heart nobody looks at any more does not hold up the one
 * asked for now.
 *
 * The page hands in how to start the worker and the clock, so a test can
 * stand in for both.
 */

/** How long a job for a value already left may keep the worker. */
export const ABANDON_MS = 400;

/** What the queue uses of a Web Worker. */
export interface QueueWorker {
	postMessage(message: unknown): void;
	terminate(): void;
	onmessage: ((event: MessageEvent) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
}

export interface QueueClock {
	now(): number;
	setTimeout(run: () => void, ms: number): void;
}

const browserClock: QueueClock = {
	now: () => performance.now(),
	setTimeout: (run, ms) => void setTimeout(run, ms)
};

/** A job: what is posted to the worker, and the `next` it was asked for under. */
export interface QueuedJob {
	request: unknown;
	token: number;
}

/** What the queue tells the page. `current`: the job is for the newest request. */
export interface JobEvents<J extends QueuedJob, Progress, Reply> {
	/** The job is posted to the worker. */
	started(job: J): void;
	/** A heart the worker found on the way to the newest job's. */
	progress(heart: Progress, job: J): void;
	/** The worker's answer, for the job it ran (none where it ran none). */
	finished(reply: Reply, job: J | null, current: boolean): void;
	/** The worker failed (its script did not load, say), while `job` ran if one did. */
	failed(job: J | null, current: boolean): void;
}

export function createJobQueue<J extends QueuedJob, Progress, Reply>(
	createWorker: () => QueueWorker,
	events: JobEvents<J, Progress, Reply>,
	clock: QueueClock = browserClock
) {
	let running: { job: J; started: number } | null = null,
		waiting: J | null = null;
	let worker: QueueWorker | null = null,
		revision = 0;

	function generatorWorker(): QueueWorker {
		if (!worker) {
			worker = createWorker();
			worker.onmessage = (e) => (e.data.progress ? showProgress(e.data.progress) : finishJob(e.data));
			worker.onerror = () => {
				const failed = running?.job ?? null;
				worker?.terminate();
				worker = null;
				running = null;
				events.failed(failed, failed?.token === revision);
				nextJob();
			};
		}
		return worker;
	}
	function startJob(job: J) {
		events.started(job);
		running = { job, started: clock.now() };
		generatorWorker().postMessage(job.request);
	}
	function showProgress(heart: Progress) {
		if (!running || running.job.token !== revision) return;
		events.progress(heart, running.job);
	}
	function finishJob(reply: Reply) {
		const job = running?.job ?? null;
		running = null;
		events.finished(reply, job, job?.token === revision);
		nextJob();
	}
	function nextJob() {
		if (running || !waiting) return;
		const job = waiting;
		waiting = null;
		startJob(job);
	}
	return {
		/** A new request: its token, and the job waiting for an older one is dropped. */
		next(): number {
			const token = ++revision;
			waiting = null;
			return token;
		},
		/** Whether `token` is the newest request's. */
		isCurrent: (token: number) => token === revision,
		/** Runs the job now if the worker is free, else as the one waiting. */
		push(job: J) {
			if (!running) return startJob(job);
			waiting = job;
			clock.setTimeout(() => {
				if (running && running.job.token !== revision && waiting === job) {
					worker?.terminate();
					worker = null;
					running = null;
					nextJob();
				}
			}, Math.max(0, ABANDON_MS - (clock.now() - running.started)));
		},
		/** Starts the worker ahead of its first job (while a text's font is read, say). */
		warm() {
			generatorWorker();
		},
		/** The page is gone: no request is the newest, and the worker stops. */
		stop() {
			revision++;
			worker?.terminate();
			worker = null;
			running = waiting = null;
		}
	};
}
