/**
 * Saving a file the page made: a Blob handed to the browser through a
 * temporary `<a download>`.
 *
 * The object URL must outlive the click. Some browsers (WebKit among them)
 * start the download only after the click handler has returned, and a URL
 * revoked synchronously after `click()` then downloads nothing, or a file
 * named after the URL. So it is revoked a moment later instead.
 */

/** How long the object URL is kept after the click, in ms. */
export const REVOKE_DELAY_MS = 1000;

/** Offers `blob` as a download named `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	try {
		link.click();
	} finally {
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
	}
}
