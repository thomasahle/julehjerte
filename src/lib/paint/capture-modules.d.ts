/**
 * The two node facilities the progress-fixture capture uses.
 *
 * `searchProgress.test.ts` can re-record its fixture by running the engine's
 * own `design()` and writing the events to disk (see its header). That is the
 * only thing under `src/` that touches node at all — everything else here runs
 * in a browser — so `@types/node` is not a dependency, and `svelte-check`
 * reports `node:fs` and `process` as unknown.
 *
 * Declaring exactly the sliver that is used, next to the code that uses it, is
 * the same answer `src/lib/inverse/engine-modules.d.ts` gives for the engine:
 * one small, readable declaration instead of a package of types for a whole
 * runtime the app never runs in.
 */

declare module 'node:fs' {
	export function writeFileSync(path: string, data: string): void;
}

/** Only `env`, and only so the capture can be switched on from the command line. */
declare const process: { env: Record<string, string | undefined> };
