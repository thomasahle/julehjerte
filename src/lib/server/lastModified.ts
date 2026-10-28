/**
 * When the gallery last changed, for the sitemap's <lastmod>: per heart, the
 * date of the last commit that touched its SVG (static/hearts/<id>.svg: the
 * picture, name and description) or its photo (static/hearts/photos/<id>.*);
 * and, as `gallery`, the date of the last commit that touched any of them or
 * hearts.jsonc (hearts.json before 2026-10-28), which is when the front page's
 * gallery last changed.
 *
 * Read from git when the site is built. Null when there is no history to read:
 * not a git checkout, or a shallow one (CI checks out a single commit unless
 * asked for more, and every file would get that commit's date). A sitemap
 * without dates is better than one with wrong ones: Google ignores <lastmod>
 * on a site where it does not match the pages.
 */
import { execFileSync } from 'node:child_process';

export interface LastModified {
	/** YYYY-MM-DD per heart id. */
	hearts: Map<string, string>;
	gallery: string | null;
}

export function readLastModified(): LastModified | null {
	const git = (...args: string[]) =>
		execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
	try {
		if (git('rev-parse', '--is-shallow-repository').trim() !== 'false') return null;
		return parseLastModified(git('log', '--format=@%cs', '--name-only', '--', 'static/hearts', 'hearts.jsonc', 'hearts.json'));
	} catch {
		return null;
	}
}

/** The dates in `git log --format=@%cs --name-only` output, newest commit first. */
export function parseLastModified(log: string): LastModified {
	const hearts = new Map<string, string>();
	let gallery: string | null = null;
	let date: string | null = null;
	for (const line of log.split('\n')) {
		if (line.startsWith('@')) {
			date = line.slice(1);
			gallery ??= date;
			continue;
		}
		const id = /^static\/hearts\/(?:photos\/)?([^/]+)\.\w+$/.exec(line)?.[1];
		if (id && date && !hearts.has(id)) hearts.set(id, date);
	}
	return { hearts, gallery };
}
