import { generate, onProgress, type GeneratorRequest } from './generate';
import { ConstructionError } from './geometry';
// Each heart found on the way, shown while its cuts are refined.
onProgress(heart => self.postMessage({ progress: heart }));
self.onmessage = (event: MessageEvent<GeneratorRequest>) => {
	try {
		self.postMessage({ result: generate(event.data) });
	} catch (error) {
		self.postMessage({
			error: error instanceof ConstructionError ? error.code : 'clearance',
			character:
				error instanceof ConstructionError && error.code === 'character'
					? error.message
					: undefined
		});
	}
};
