/**
 * Every gallery heart's template is also a PDF file the build writes
 * (src/routes/skabelon), so it has an address a search engine or an AI
 * assistant can link to and read. A trial with four hearts 2026-11-24, all of
 * them since 2026-11-25.
 */
import { ALL_HEART_IDS } from '$lib/data/categories';

export const TEMPLATE_PDF_HEARTS: readonly string[] = ALL_HEART_IDS;

const HAS_PDF = new Set(TEMPLATE_PDF_HEARTS);

/** The file's path on the site, or null for a heart without one (a visitor's own, a shared one). */
export function templatePdfPath(id: string): string | null {
	return HAS_PDF.has(id) ? `/skabelon/${id}.pdf` : null;
}
