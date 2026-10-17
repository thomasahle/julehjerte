/**
 * Small text helpers shared by more than one page.
 */

/**
 * The first sentence of a paragraph, terminator included.
 *
 * The heart detail page shows a two-to-four sentence description but its
 * `<meta name="description">` only has room for an opening line, so it takes
 * the first sentence of the paragraph.
 *
 * A sentence ends at `.`, `!` or `?` followed by whitespace and a capital
 * letter, or at the end of the text. The capital is what keeps abbreviations
 * such as "én pr. stribe" and hosts such as "brodal.dk" from ending a sentence
 * early. Text with no terminator at all comes back whole.
 */
export function firstSentence(text: string): string {
	const trimmed = text.trim();
	const match = /^[\s\S]*?[.!?](?=\s+[^\p{Ll}\s]|\s*$)/u.exec(trimmed);
	return match ? match[0] : trimmed;
}

/** A sentence end, by the same rule as firstSentence(). */
const SENTENCE_END = /[.!?](?=\s+[^\p{Ll}\s]|\s*$)/gu;

/**
 * `text` cut to at most `max` characters, for a meta description.
 *
 * It ends at the last sentence end that fits, so what is left reads as whole
 * sentences. When not even the first sentence fits it is cut at the last word
 * boundary that leaves room for an ellipsis, with any dangling comma, colon or
 * dash dropped first. Text that already fits comes back trimmed and otherwise
 * unchanged.
 */
export function truncateAtSentence(text: string, max: number): string {
	const trimmed = text.trim();
	if (trimmed.length <= max) return trimmed;

	let end = 0;
	for (const match of trimmed.matchAll(SENTENCE_END)) {
		const after = match.index + 1;
		if (after > max) break;
		end = after;
	}
	if (end > 0) return trimmed.slice(0, end);

	return truncateAtWord(trimmed, max);
}

/** `text` cut at a word boundary to at most `max` characters, "…" included. */
export function truncateAtWord(text: string, max: number): string {
	const trimmed = text.trim();
	if (trimmed.length <= max) return trimmed;
	if (max < 1) return '';
	const room = trimmed.slice(0, max); // max - 1 characters of text, plus "…"
	const space = room.search(/\s\S*$/);
	const cut = space > 0 ? room.slice(0, space) : room.slice(0, max - 1);
	return `${cut.replace(/[\s,;:–—-]+$/u, '')}…`;
}
