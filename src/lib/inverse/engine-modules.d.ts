/**
 * The parts of the inverse engine our tests call directly.
 *
 * `static/inverse/**` is the engine as shipped: plain, untyped ESM that the app
 * loads by URL inside a worker, never through the bundler. A test that wants to
 * compare our conversion with the engine's own answer has to import it for real,
 * and importing the source by relative path would drag every one of its modules
 * into `svelte-check` (the project has `checkJs`), which reports hundreds of
 * implicit-any errors in code we do not own and must not edit.
 *
 * So tests import `$inverse/...` — an alias defined in vitest.config.ts — and
 * these declarations describe the handful of functions they use. Only what the
 * tests touch is declared; extend it as more of the engine is needed.
 */

declare module '$inverse/core/graph.js' {
  /** One edge reference inside a slit: the curve's index, and whether it runs forwards. */
  export type EnginePathStep = [number, boolean];

  /** The engine's in-memory solution: its cut graph plus the two slit families. */
  export type EngineSolution = {
    graph: { target: { width: number; phase: 0 | 1 } };
    /** `[A, B]`; A's slits cross the square in y, B's in x. */
    paths: [EnginePathStep[][], EnginePathStep[][]];
    report: Record<string, unknown>;
  };

  /** Read a saved `heartcurves-2` template back into a solution. Throws on bad input. */
  export function loadSolutionJSON(data: unknown): EngineSolution;
}

declare module '$inverse/core/validate.js' {
  import type { EngineSolution } from '$inverse/core/graph.js';

  /**
   * The engine's own picture of the woven square: an `n × n` row-major grid where
   * 0 is paper B (the left lobe) and 1 is paper A (the right lobe).
   */
  export function sampleWeave(solution: EngineSolution, n?: number): Uint8Array;
}
