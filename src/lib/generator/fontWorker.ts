/** A Google font's file outlined and, where thin, thickened, away from the
 * page, which measuring the strokes would hold up (see `loadGoogleFont`). */
import { readFont } from './fontFile';
import { thickened } from './strokes';

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
	try {
		self.postMessage({ font: thickened(await readFont(new Uint8Array(event.data))) });
	} catch (error) {
		self.postMessage({ error: error instanceof Error ? error.message : String(error) });
	}
};
