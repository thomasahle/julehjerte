/**
 * The one node facility the sitemap's dates use ($lib/server/lastModified):
 * running git. `@types/node` is not a dependency (see
 * src/lib/paint/capture-modules.d.ts).
 */
declare module 'node:child_process' {
	export function execFileSync(
		file: string,
		args: string[],
		options: { encoding: 'utf8'; stdio: ('ignore' | 'pipe')[] }
	): string;
}
