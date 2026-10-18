/**
 * Links inside a heart's written description.
 *
 * A description is plain prose (docs/ADDING-A-HEART.md), but it may credit a
 * source, and a credit should be a link rather than a bare domain. The text
 * carries a link as `[words](https://…)`, the one piece of markup descriptions
 * know: HeartPanel renders it as an anchor, and everything that wants the
 * paragraph as plain text (the meta description, the social cards, the
 * paragraph-length test) strips it with `plainDescription`.
 *
 * Only absolute http(s) links are honoured; anything else is left as written,
 * so a stray bracket in a visitor's own heart description cannot become a link
 * to somewhere odd.
 */

export type DescriptionSegment = { text: string; href?: string };

const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

/** The description split into plain runs and links, in order. */
export function parseDescription(text: string): DescriptionSegment[] {
	const segments: DescriptionSegment[] = [];
	let last = 0;
	for (const match of text.matchAll(LINK)) {
		const start = match.index ?? 0;
		if (start > last) segments.push({ text: text.slice(last, start) });
		segments.push({ text: match[1], href: match[2] });
		last = start + match[0].length;
	}
	if (last < text.length) segments.push({ text: text.slice(last) });
	return segments;
}

/** The description with every link reduced to its words. */
export function plainDescription(text: string): string {
	return text.replace(LINK, '$1');
}
