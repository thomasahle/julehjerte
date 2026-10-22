import type { HeartDesign } from '$lib/types/heart';
import { paperReport } from '$lib/geometry/paperNecks';
self.onmessage = (event: MessageEvent<{ design: HeartDesign; widthMm: number; maxMm: number }>) => {
	const { design, widthMm, maxMm } = event.data;
	self.postMessage(paperReport(design, widthMm, maxMm));
};
