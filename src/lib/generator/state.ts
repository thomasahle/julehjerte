import type { Frame } from './geometry';
export type GeneratorState = {
	mode: 'start' | 'figure' | 'text';
	motif: string;
	text: string;
	font: string;
	palette: number;
	frame: Frame;
	frameSize: number;
	scale: number;
	style: 'rays' | 'check' | 'plain';
	textFrame: 'woven' | 'air';
	paperWidth: number;
};
export const defaults: GeneratorState = {
	mode: 'start',
	motif: 'star',
	text: 'ANNA',
	font: 'nunito',
	palette: 0,
	frame: 'circle',
	frameSize: 70,
	scale: 70,
	style: 'rays',
	textFrame: 'woven',
	paperWidth: 100
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
			frame: ['circle', 'diamond', 'hexagon'],
			style: ['rays', 'check', 'plain'],
			textFrame: ['woven', 'air']
		}))
			if (allowed.includes(raw[k])) Object.assign(s, { [k]: raw[k] });
		if (typeof raw.text === 'string')
			s.text = [...raw.text.normalize('NFC')].slice(0, 10).join('');
		if (typeof raw.motif === 'string' && /^[a-z0-9-]{1,80}$/.test(raw.motif))
			s.motif = raw.motif;
		for (const [k, min, max] of [
			['palette', 0, 3],
			['frameSize', 50, 80],
			['scale', 45, 85],
			['paperWidth', 80, 140]
		] as const)
			if (typeof raw[k] === 'number' && Number.isFinite(raw[k]))
				Object.assign(s, {
					[k]: Math.max(min, Math.min(max, Math.round(raw[k])))
				});
	} catch {
		/* An absent or malformed link starts a fresh heart. */
	}
	return s;
}
