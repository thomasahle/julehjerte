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
