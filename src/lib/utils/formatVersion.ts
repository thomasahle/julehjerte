/**
 * Everything the site stores or shares (a heart's JSON, the editor's draft, a
 * generator link) carries the version of its form as `v`, counting from 1;
 * what was written before versioning has none. The field is only ever added:
 * a tab still running the site's older code reads past it, as every reader
 * reads past fields it does not know.
 *
 * A reader takes every version up to its own. A later one was written by a
 * newer site than the one reading it, and may mean what this one cannot know:
 * it is treated as the reader treats a corrupt entry, as not there.
 */
export function readableVersion(v: unknown, current: number): boolean {
	return v === undefined || (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= current);
}
