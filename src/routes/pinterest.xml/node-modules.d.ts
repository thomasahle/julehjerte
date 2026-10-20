/**
 * The one node facility the feed uses: the size of a pin image, for the RSS
 * enclosure's length. `@types/node` is not a dependency (see
 * src/lib/paint/capture-modules.d.ts, which declares `process.env` and merges
 * with this module declaration).
 */
declare module 'node:fs' {
	export function statSync(path: string): { size: number };
}
