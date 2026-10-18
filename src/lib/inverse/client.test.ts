import { describe, expect, it, vi } from 'vitest';
import { InverseWorker, ENGINE_UNAVAILABLE, searchTimedOut } from './client';

function harness() {
  const workers: Worker[] = [];
  const create = vi.fn(() => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null } as unknown as Worker;
    workers.push(worker);
    return worker;
  });
  const engine = new InverseWorker('/inverse/worker-bootstrap.js', create);
  const reply = (worker: Worker, data: unknown) => worker.onmessage?.call(worker, { data } as MessageEvent);
  return { workers, create, engine, reply };
}

describe('inverse worker lifecycle', () => {
  it('cancels a search, discards its late response and uses a new worker on restart', async () => {
    const { workers, create, engine, reply } = harness();
    const first = engine.request('solve', undefined, {});
    const cancelled = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    engine.stop();
    await cancelled;
    expect(workers[0].postMessage).toHaveBeenLastCalledWith({ id: 1, action: 'cancel' });
    expect(workers[0].terminate).not.toHaveBeenCalled();
    reply(workers[0], { id: 1, type: 'cancelled' });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    const progress = vi.fn();
    const second = engine.request('prepare', { type: 'svg', text: '<svg/>' }, {}, progress);
    reply(workers[0], { id: 1, type: 'result', result: 'stale result' });
    // The whole event reaches the listener, not only its stage: the counts and
    // the error are what the searching panel is built out of (PAINT.md §2).
    reply(workers[1], {
      id: 3,
      type: 'progress',
      event: { stage: 'directInitializing', counts: [4, 4], error: 0.031 }
    });
    reply(workers[1], { id: 3, type: 'prepared', preview: 'new artwork' });
    expect(await second).toBe('new artwork');
    expect(progress).toHaveBeenCalledWith({
      stage: 'directInitializing',
      counts: [4, 4],
      error: 0.031
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('retains failure diagnostics and permits a subsequent request', async () => {
    const { workers, engine, reply } = harness();
    const failed = engine.request('solve', undefined, {});
    const rejection = expect(failed).rejects.toMatchObject({
      name: 'EngineError', report: { status: 'no_validated_solution', termination: 'time_limit' }
    });
    reply(workers[0], { id: 1, type: 'error', message: 'Search ended', report: { status: 'no_validated_solution', termination: 'time_limit' } });
    await rejection;
    const retry = engine.request('prepare', undefined, {});
    reply(workers[0], { id: 2, type: 'prepared', preview: 'retry' });
    expect(await retry).toBe('retry');
    expect(searchTimedOut({ termination: 'time_limit' })).toBe(true);
    expect(searchTimedOut({ termination: 'candidate_graph_exhausted' })).toBe(false);
  });

  it('uses the current solve id for a graceful stop and resolves its original promise', async () => {
    const { workers, engine, reply } = harness();
    expect(engine.useBest()).toBe(false);
    const prepared = engine.request('prepare', undefined, {});
    expect(engine.useBest()).toBe(false);
    reply(workers[0], { id: 1, type: 'prepared', preview: 'artwork' });
    await prepared;
    const solving = engine.request('solve', undefined, {});
    expect(engine.useBest()).toBe(true);
    expect(workers[0].postMessage).toHaveBeenLastCalledWith({ id: 2, action: 'stop' });
    expect(workers[0].terminate).not.toHaveBeenCalled();
    reply(workers[0], { id: 2, type: 'result', result: { report: { stoppedEarly: true } } });
    expect(await solving).toEqual({ report: { stoppedEarly: true } });
    expect(engine.useBest()).toBe(false);
    const next = engine.request('solve', undefined, {});
    reply(workers[0], { id: 3, type: 'result', result: 'same prepared artwork' });
    expect(await next).toBe('same prepared artwork');
  });

  it('eventually terminates an unresponsive controller and ignores its late result', async () => {
    vi.useFakeTimers();
    try {
      const { workers, engine, reply } = harness();
      const solving = engine.request('solve', undefined, {});
      const cancelled = expect(solving).rejects.toMatchObject({ name: 'AbortError' });
      engine.stop();
      reply(workers[0], { id: 1, type: 'result', result: 'too late' });
      await cancelled;
      await vi.advanceTimersByTimeAsync(1000);
      expect(workers[0].terminate).toHaveBeenCalledOnce();
      reply(workers[0], { id: 1, type: 'cancelled' });
      expect(workers[0].terminate).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it('terminates a failed worker and rejects overlapping requests', async () => {
    const { workers, engine } = harness();
    const request = engine.request('prepare', undefined, {});
    await expect(engine.request('solve', undefined, {})).rejects.toThrow('already working');
    // The code is what tells a UI that the engine itself is what failed, rather
    // than the engine having something to say about the artwork.
    const rejection = expect(request).rejects.toMatchObject({ name: 'EngineError', code: ENGINE_UNAVAILABLE });
    workers[0].onerror?.call(workers[0], { message: 'Missing worker asset', preventDefault: vi.fn() } as unknown as ErrorEvent);
    await rejection;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });

  it('preserves the symmetry failure code independently of its translated message', async () => {
    const { workers, engine, reply } = harness();
    const request = engine.request('prepare', undefined, {});
    const rejection = expect(request).rejects.toMatchObject({ name: 'EngineError', code: 'IDENTICAL_SHEETS_ASYMMETRIC' });
    reply(workers[0], { id: 1, type: 'error', message: 'Udsnittet er ikke symmetrisk', code: 'IDENTICAL_SHEETS_ASYMMETRIC' });
    await rejection;
  });
});
