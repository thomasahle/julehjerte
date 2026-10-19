/**
 * Text made safe for XML element content and double-quoted attribute values:
 * the SVG and RDF the site writes (heart files, templates, laser files, the
 * download preview).
 */
export function escapeXml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
