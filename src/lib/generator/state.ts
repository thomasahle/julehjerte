import { FRAMES, type Frame, type TextFrame } from './geometry';
export type GeneratorState = {
	mode: 'start' | 'figure' | 'text';
	motif: string;
	text: string;
	font: string;
	frame: Frame;
	frameSize: number;
	scale: number;
	style: 'rays' | 'check' | 'plain' | 'sunburst' | 'fitted' | 'corners' | 'layers';
	textFrame: TextFrame;
};
export const defaults: GeneratorState = {
	mode: 'start',
	motif: 'star',
	text: 'ANNA',
	font: 'nunito',
	frame: 'circle',
	frameSize: 70,
	scale: 70,
	style: 'rays',
	textFrame: 'woven'
};
export function readGeneratorState(hash: string): GeneratorState {
	const s = { ...defaults };
	try {
		const raw = JSON.parse(
			new URLSearchParams(hash.replace(/^#/, '')).get('make') ?? ''
		);
		for (const [k, allowed] of Object.entries({
			mode: ['start', 'figure', 'text'],
			font: ['nunito', 'breeserif', 'oswald', 'kalam', 'cinzel', 'righteous'],
			frame: [...FRAMES],
			style: ['rays', 'check', 'plain', 'sunburst', 'fitted', 'corners', 'layers'],
			textFrame: ['woven', 'air', 'repeat', 'repeat-check', ...FRAMES]
		}))
			if (allowed.includes(raw[k])) Object.assign(s, { [k]: raw[k] });
		if (typeof raw.text === 'string') s.text = normalizeText(raw.text);
		if (typeof raw.motif === 'string' && /^[a-z0-9-]{1,80}$/.test(raw.motif))
			s.motif = raw.motif;
		for (const [k, min, max] of [
			['frameSize', 50, 80],
			['scale', 45, 85]
		] as const)
			if (typeof raw[k] === 'number' && Number.isFinite(raw[k]))
				Object.assign(s, {
					[k]: Math.max(min, Math.min(max, Math.round(raw[k])))
				});
	} catch {
		/* An absent or malformed link starts a fresh heart. */
	}
	if (s.style === 'sunburst' || s.style === 'fitted' || s.style === 'corners' || s.style === 'layers') s.frame = 'circle';
	return s;
}

export function normalizeText(text: string): string {
	return text
		.normalize('NFC')
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.slice(0, 3)
		.map((line) => [...line].slice(0, 10).join(''))
		.join('\n');
}
