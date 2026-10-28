/**
 * JSON with comments (JSONC), the format of hearts.jsonc: JSON plus `//` line
 * comments, block comments and trailing commas, as editors read a .jsonc file.
 * Plain JavaScript, so the Node scripts import it as well as the site.
 */

/**
 * Parses JSONC text: strips the comments and any comma before a closing
 * bracket or brace, outside strings, then reads the rest as JSON.
 *
 * @param {string} text
 * @returns {any}
 */
export function parseJsonc(text) {
	let out = '';
	let i = 0;
	while (i < text.length) {
		const c = text[i];
		if (c === '"') {
			// A string, escapes included, is copied as it is.
			let j = i + 1;
			while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
			out += text.slice(i, j + 1);
			i = j + 1;
		} else if (c === '/' && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') i++;
		} else if (c === '/' && text[i + 1] === '*') {
			const end = text.indexOf('*/', i + 2);
			if (end < 0) throw new SyntaxError('JSONC: a /* comment is never closed');
			i = end + 2;
		} else {
			if (c === ']' || c === '}') {
				// A trailing comma: the last thing written before the bracket.
				const kept = out.trimEnd();
				if (kept.endsWith(',')) out = kept.slice(0, -1) + out.slice(kept.length);
			}
			out += c;
			i++;
		}
	}
	return JSON.parse(out);
}
