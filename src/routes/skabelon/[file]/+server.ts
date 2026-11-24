/**
 * A heart's template as a PDF file with an address of its own,
 * /skabelon/<id>.pdf: what the "Hent skabelon" dialog gives with its defaults
 * (80 mm wide on A4, one heart, with its picture), written by the build.
 *
 * The dialog makes its PDF in the browser, so there was no file a search
 * engine or an AI assistant could link to or read. A trial with a few hearts
 * (2026-11-24); `TRIAL_HEARTS` is the list.
 */
import { error } from '@sveltejs/kit';
import { createCanvas, loadImage } from 'canvas';
import { getGalleryDesign } from '$lib/data/heartDesigns';
import { DEFAULT_DOWNLOAD_SETTINGS } from '$lib/download/settings';
import { sheetSize } from '$lib/pdf/designPrint';
import { templatePicturePixels, templatePieces } from '$lib/pdf/plan';
import { generateTemplatesPDF } from '$lib/pdf/template';
import { renderHeartSvgMarkup } from '$lib/rendering/heartSvg';
import { DEFAULT_COLORS } from '$lib/stores/colors';
import { TEMPLATE_PDF_HEARTS } from '$lib/templatePdf';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => TEMPLATE_PDF_HEARTS.map((id) => ({ file: `${id}.pdf` }));

export const GET: RequestHandler = async ({ params }) => {
	const id = params.file.endsWith('.pdf') ? params.file.slice(0, -4) : '';
	const design = TEMPLATE_PDF_HEARTS.includes(id) ? getGalleryDesign(id) : null;
	if (!design) error(404, 'No such template');

	const { widthMm } = DEFAULT_DOWNLOAD_SETTINGS;
	// The heart's picture as the dialog draws it (./heartRenderer), on node's canvas.
	const size = templatePicturePixels(templatePieces([design], widthMm, 1), 'da');
	const svg = renderHeartSvgMarkup(design, DEFAULT_COLORS, { size, idPrefix: `pdf-${design.id}`, outline: { color: '#111' } });
	const canvas = createCanvas(size, size);
	canvas.getContext('2d').drawImage(await loadImage(`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`), 0, 0, size, size);

	const pdf = await generateTemplatesPDF([design], {
		widthMm,
		hearts: 1,
		sheet: sheetSize('A4'),
		lang: 'da',
		images: new Map([[design.id, canvas.toDataURL('image/png')]])
	});
	// The same file from the same heart: jsPDF stamps the clock and a random id otherwise.
	pdf.setCreationDate(new Date(0));
	pdf.setFileId('0'.repeat(32));
	pdf.setProperties({ title: `${design.name} – skabelon til flettet julehjerte`, author: 'Juleflet.dk', subject: 'https://juleflet.dk/hjerte/' + id + '/' });

	return new Response(pdf.output('arraybuffer'), {
		headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${id}-${widthMm}mm.pdf"` }
	});
};
