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
  export function solutionJSON(solution: EngineSolution): unknown;
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

declare module '$inverse/locator/locator.js' {
  /**
   * Flatten the quadrilateral `quad` out of `image` into a `size × size` square
   * of RGBA pixels, sampled bilinearly. The unit square's corners
   * `(0,0) (1,0) (1,1) (0,1)` map onto the four given points in order, and the
   * points are read in *pixel-centre* coordinates — which is what
   * `rectifyQuad` in `$lib/paint/rectify.ts` converts to. Pixels the quad
   * reaches outside the picture come back as zeroes, with `valid` 0.
   *
   * Throws a `TypeError` for corners that do not form a convex quadrilateral in
   * perimeter order (either winding), and a `RangeError` for a size outside
   * 16…2048.
   */
  export function rectifyMotif(
    image: { width: number; height: number; data: Uint8ClampedArray },
    quad: number[][],
    options?: { size?: number }
  ): {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    valid: Uint8Array;
  };
}

declare module '$inverse/core/engine.js' {
  import type { EngineSolution } from '$inverse/core/graph.js';
  import type { ArtworkInput } from '$lib/inverse/client';
  export function finish(solution: EngineSolution, settings: Record<string, unknown>, onProgress?: (event: Record<string, unknown>) => void, options?: { refine?: boolean; deadline?: number }): { files: Record<string, string>; report: Record<string, unknown> };
  /**
   * Classify artwork into the engine's own two-colour reading of the woven
   * square — the very call the worker makes for a `prepare` request.
   * `preview.mask` is `resolution²` cells, 0 for paper B (our left lobe) and 1
   * for paper A (our right); `target` is what a solve then runs on, which the
   * worker keeps and we never touch.
   */
  export function prepare(
    input: ArtworkInput,
    settings?: Record<string, unknown>,
    onProgress?: (event: { stage: string }) => void
  ): {
    target: { sourceImage: { weights?: Float64Array } };
    preview: { mask: Uint8Array; weights?: Float64Array; resolution: number; metadata: Record<string, unknown> };
  };

  /**
   * Solve a prepared target and finish it into files and a report — the very
   * call the worker makes for a 'solve' request, and the only way to get the
   * real progress stream out of the engine in a test. `onProgress` is handed
   * each event whole, which is what `src/lib/paint/searchProgress.test.ts`
   * records to build its fixture.
   */
  export function design(
    target: unknown,
    settings?: Record<string, unknown>,
    onProgress?: (event: Record<string, unknown>) => void
  ): Promise<{ files: Record<string, string>; report: Record<string, unknown> }>;
}

/** Topology simplification uses the same exported geometry checked by Draw. */
declare module '$inverse/core/direct/short-returns.js' {
  import type { EngineSolution } from '$inverse/core/graph.js';
  export function finalizeShortReturns(solution: EngineSolution, settings: Record<string, unknown>, options?: { deadline?: number; completionDeadline?: number }): EngineSolution;
}
