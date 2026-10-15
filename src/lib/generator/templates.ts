import { FRAMES, type Frame, type TextFrame } from './geometry';
import type { GeneratorState } from './state';

export type FigureTemplate = {
	id: string;
	frame: Frame;
	style: GeneratorState['style'];
};
const preferred: [Frame, GeneratorState['style']][] = [
	['circle', 'rays'],
	['circle', 'sunburst'],
	['circle', 'fitted'],
	['circle', 'corners'],
	['circle', 'layers'],
	['circle', 'check'],
	['circle', 'plain'],
	['diamond', 'check'],
	['hexagon', 'rays'],
	['oval', 'plain'],
	['rounded', 'check'],
	['scalloped', 'plain']
];
const pairs = [
	...preferred,
	...FRAMES.flatMap((frame) =>
		(['rays', 'check', 'plain'] as const).map(
			(style) => [frame, style] as const
		)
	)
];
export const FIGURE_TEMPLATES: FigureTemplate[] = pairs
	.filter(
		([frame, style], i, all) =>
			all.findIndex((p) => p[0] === frame && p[1] === style) === i
	)
	.map(([frame, style]) => ({ id: `${frame}-${style}`, frame, style }));
export const TEXT_TEMPLATES: TextFrame[] = ['woven', 'air', 'repeat', 'repeat-check', ...FRAMES];

/** Keep old shared links selected even when they use a less common combination. */
export function figureTemplates(state: GeneratorState, expanded = false) {
	return expanded
		? FIGURE_TEMPLATES
		: FIGURE_TEMPLATES.filter(
				(p, i) =>
					i < preferred.length ||
					(p.frame === state.frame && p.style === state.style)
			);
}
export function templateVariants(state: GeneratorState, expanded = false) {
	return state.mode === 'figure'
		? figureTemplates(state, expanded).map((p) => ({
				id: p.id,
				state: { ...state, frame: p.frame, style: p.style }
			}))
		: TEXT_TEMPLATES.map((textFrame) => ({
				id: textFrame,
				state: { ...state, textFrame }
			}));
}
