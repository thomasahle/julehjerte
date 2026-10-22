/** The page's fonts ($lib/generator/fontLibrary) away from the page, which
 * reading files and measuring strokes would hold up: one worker for the visit,
 * each file fetched and read once (see `textFont`). */
import { FontLibrary } from './fontLibrary';
import { fetchedFiles } from './fontFiles';

let library: FontLibrary | undefined;

self.onmessage = async (event: MessageEvent<{ id: number; shipped: string; choice: string; text: string }>) => {
	const { id, shipped, choice, text } = event.data;
	library ??= new FontLibrary(fetchedFiles(shipped));
	try {
		self.postMessage({ id, font: await library.font(choice, text) });
	} catch (error) {
		self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
	}
};
