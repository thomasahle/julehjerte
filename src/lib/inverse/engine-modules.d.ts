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
 *
 * **`$inverse` resolves under vitest and nowhere else.** It is not in
 * vite.config.ts and not in `kit.alias`, so an app module importing from it would
 * type-check cleanly here and then fail at `vite build`. Nothing outside a test
 * may import it — and nothing should want to: the paint page must not pull the
 * engine into its bundle at all (PAINT.md §8); it loads it by URL in a worker
 * when the visitor presses Find snit.
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

declare module '$inverse/core/settings.js' {
  /**
   * The engine's own reading of a settings object: the keys of its `DEFAULTS`
   * copied across, every other key dropped without a word, and a throw for a
   * number outside its bounds. It is the only statement of which settings the
   * engine accepts, which is why `engine.test.ts` runs ours through it.
   */
  export function settings(raw?: Record<string, unknown>): Record<string, unknown>;
}

declare module '$inverse/core/engine.js' {
  /**
   * Classify artwork into the engine's own two-colour reading of the woven
   * square — the very call the worker makes for a `prepare` request.
   * `preview.mask` is `resolution²` cells, 0 for paper B (our left lobe) and 1
   * for paper A (our right); `target` is what a solve then runs on, which the
   * worker keeps and we never touch.
   */
  export function prepare(
    input: {
      type: 'pixels';
      rgba: Uint8ClampedArray;
      imageWidth: number;
      imageHeight: number;
      quad?: number[][];
    },
    settings?: Record<string, unknown>,
    onProgress?: (event: { stage: string }) => void
  ): {
    target: unknown;
    preview: { mask: Uint8Array; resolution: number; metadata: Record<string, unknown> };
  };
}
