/**
 * The hearts whose template the build also writes as a PDF file
 * (src/routes/skabelon): a trial with four of the most visited, 2026-11-24.
 */
export const TEMPLATE_PDF_HEARTS: readonly string[] = ['classic-3x3', 'stjerne', 'jul', 'nemt-hjerte'];

/** The file's path on the site, or null for a heart without one. */
export function templatePdfPath(id: string): string | null {
	return TEMPLATE_PDF_HEARTS.includes(id) ? `/skabelon/${id}.pdf` : null;
}
