/**
 * Turning a heart's name into something safe to put on disk.
 *
 * The downloaded PDF is the one artefact a visitor keeps, and the names are
 * Danish: "Juletræ" landed on disk as `juletræ-template.pdf` while the site's
 * own slug for that heart is `juletrae`. Danish letters are folded the way the
 * gallery ids spell them (æ → ae, ø → oe, å → aa) before the accents of any
 * other alphabet are stripped, since NFD would otherwise turn æ into nothing
 * and å into a plain "a".
 */
export function slugify(value: string, fallback = 'julehjerte'): string {
	const slug = value
		.toLowerCase()
		.replace(/æ/g, 'ae')
		.replace(/ø/g, 'oe')
		.replace(/å/g, 'aa')
		.normalize('NFD')
		// Combining marks left by the decomposition: é → e, ü → u.
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	// A name written entirely outside the Latin alphabet slugs to nothing, and a
	// file called "-template.pdf" helps no one.
	return slug || fallback;
}
