/**
 * Figures beyond the site's own: a search over the open icon sets Iconify
 * hosts (https://iconify.design, some 200 sets), asked from the visitor's
 * browser as the Google fonts are. An icon found is outlined there
 * (`iconOutline`) and only offered if it is a solid shape: most icons are
 * drawings in thin lines, which paper cannot hold. Nothing of these sets is
 * stored on the site; a link names the icon (`motif=mdi:cat`) and the page
 * fetches it again.
 */
import type { CatalogItem } from './catalog';
import { englishWords } from './danishWords';
import type { Ring } from './geometry';
import { isIconId } from './iconId';
import { contourArt, iconOutline } from './iconOutline';

export const ICON_API = 'https://api.iconify.design';

/** The least of a figure that must stay when its edges are taken in (`IconOutline.solid`). */
export const SOLID_ENOUGH = 0.1;
/** Licences that let anyone use and change an icon, at most for a credit. */
const OPEN = /^(MIT|ISC|Apache-2\.0|CC0-1\.0|Unlicense|CC-BY-[34]\.0|OFL-1\.1|BSD-[23]-Clause|MPL-2\.0)$/;
/** Sets the site has whole (its search finds them), and older editions of sets also found. */
const SKIPPED = new Set(['ph', 'tabler', 'fa', 'fa-solid', 'fa6-solid', 'material-symbols-light', 'famicons']);
/** How many icons a search asks for; about a third are solid enough to show. */
const ASKED = 150;

type Collection = { name?: string; author?: { name?: string }; license?: { title?: string; spdx?: string }; category?: string };
type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
type IconSet = { width?: number; height?: number; icons?: Record<string, { body: string; width?: number; height?: number }> };

const outlines = new Map<string, Ring[]>();
/** An icon's name as a label: "ear-fill" is an Ear; the sets' words for their solid style say nothing more. */
const title = (name: string) =>
	(name.replace(/-(fill|filled|solid|sharp|bold)$/, '') || name)
		.split('-')
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');

async function json<T>(fetcher: Fetch, path: string, signal?: AbortSignal): Promise<T> {
	const response = await fetcher(ICON_API + path, { signal });
	if (!response.ok) throw new Error('Icon request failed');
	return (await response.json()) as T;
}

/** The icons of one set, by name; the names in requests short enough for any server. */
async function bodies(fetcher: Fetch, prefix: string, names: string[], signal?: AbortSignal) {
	const groups: string[][] = [[]];
	for (const name of names) {
		if (groups[groups.length - 1].join(',').length + name.length > 400) groups.push([]);
		groups[groups.length - 1].push(name);
	}
	const sets = await Promise.all(groups.map(group => json<IconSet>(fetcher, `/${prefix}.json?icons=${group.join(',')}`, signal)));
	return (name: string) => {
		for (const set of sets) {
			const icon = set.icons?.[name];
			if (icon) return { body: icon.body, width: icon.width ?? set.width ?? 16, height: icon.height ?? set.height ?? 16 };
		}
	};
}

/**
 * The solid figures the open sets have for a search, in Iconify's order,
 * as the picker's items: drawn from the very contours the heart is made of.
 * Danish words the site knows are asked in English.
 */
export async function findIcons(query: string, signal?: AbortSignal, fetcher: Fetch = fetch): Promise<CatalogItem[]> {
	const words = englishWords(query);
	if (!words) return [];
	const found = await json<{ icons?: string[]; collections?: Record<string, Collection> }>(
		fetcher,
		`/search?query=${encodeURIComponent(`${words} style=fill palette=false`)}&limit=${ASKED}`,
		signal
	);
	const sets = found.collections ?? {};
	const ids = (found.icons ?? []).filter(id => {
		const set = sets[id.split(':')[0]];
		return isIconId(id) && set && !SKIPPED.has(id.split(':')[0]) && OPEN.test(set.license?.spdx ?? '') && !/logo|brand|flag/i.test(set.category ?? '');
	});
	const prefixes = [...new Set(ids.map(id => id.split(':')[0]))];
	const read = new Map(
		await Promise.all(
			prefixes.map(async prefix => {
				const names = ids.filter(id => id.startsWith(prefix + ':')).map(id => id.split(':')[1]);
				// A set that fails leaves the others' figures.
				return [prefix, await bodies(fetcher, prefix, names, signal).catch(() => undefined)] as const;
			})
		)
	);
	signal?.throwIfAborted();
	const items: CatalogItem[] = [], seen = new Set<string>();
	for (const id of ids) {
		const [prefix, name] = id.split(':'), icon = read.get(prefix)?.(name), set = sets[prefix];
		if (!icon) continue;
		try {
			const { contours, solid } = iconOutline(icon.body, icon.width, icon.height);
			const art = contourArt(contours);
			// Sets copy each other: one of each drawing is enough.
			if (solid < SOLID_ENOUGH || seen.has(art)) continue;
			seen.add(art);
			outlines.set(id, contours);
			items.push({
				id,
				name: title(name),
				art,
				box: 100,
				source: [set.author?.name, set.name, set.license?.title].filter(Boolean).join(', ')
			});
		} catch {
			/* A body the outliner does not read is not offered. */
		}
	}
	return items;
}

/** The contours of an icon of the open sets: as found by a search, or fetched for a link. */
export async function iconContours(id: string, fetcher: Fetch = fetch): Promise<Ring[]> {
	const known = outlines.get(id);
	if (known) return known;
	if (!isIconId(id)) throw new Error('Not an icon');
	const [prefix, name] = id.split(':'), icon = (await bodies(fetcher, prefix, [name]))(name);
	if (!icon) throw new Error('Icon not found');
	const { contours } = iconOutline(icon.body, icon.width, icon.height);
	outlines.set(id, contours);
	return contours;
}
