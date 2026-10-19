import { generate, type GeneratorRequest } from './generate';
import { ConstructionError } from './geometry';
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
