import { describe, expect, it, vi } from 'vitest';
import { InverseWorker, EngineError, searchTimedOut } from './client';

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
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    const progress = vi.fn();
    const second = engine.request('prepare', { type: 'svg', text: '<svg/>' }, {}, progress);
    reply(workers[0], { id: 1, type: 'result', result: 'stale result' });
    reply(workers[1], { id: 3, type: 'progress', event: { stage: 'preprocessing' } });
    reply(workers[1], { id: 3, type: 'prepared', preview: 'new artwork' });
    expect(await second).toBe('new artwork');
    expect(progress).toHaveBeenCalledWith('preprocessing');
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

  it('terminates a failed worker and rejects overlapping requests', async () => {
    const { workers, engine } = harness();
    const request = engine.request('prepare', undefined, {});
    await expect(engine.request('solve', undefined, {})).rejects.toThrow('already working');
    const rejection = expect(request).rejects.toBeInstanceOf(EngineError);
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
