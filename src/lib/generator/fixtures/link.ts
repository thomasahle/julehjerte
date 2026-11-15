/** A generator link for any fields, as someone could write one by hand: also values the page never writes. */
export const linkOf = (value: object) =>
	'#' +
	new URLSearchParams(
		Object.entries(value)
			.filter(([, v]) => v !== undefined)
			.map(([k, v]) => [k, String(v)])
	);
