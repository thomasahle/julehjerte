import { FIGURE_STYLES, FRAMES, type Frame, type TextFrame } from './geometry';
import { CELLS, CELL_FRAMES, type Cells, type GeneratorState } from './state';

export type FigureTemplate = {
	id: string;
	frame: Frame;
	style: GeneratorState['style'];
};
export const FIGURE_TEMPLATES: FigureTemplate[] = FIGURE_STYLES.map((style) => ({
	id: `circle-${style}`,
	frame: 'circle',
	style
}));
export type TextTemplate = { id: string; textFrame: TextFrame; cells?: Cells };
/** The frame whose checks follow the text cells comes as a pair, square cells
 * beside letter-sized ones, its space around the text set by a slider. */
export const TEXT_TEMPLATES: TextTemplate[] = (['woven', 'checkered', ...FRAMES] as TextFrame[])
	.flatMap((textFrame): TextTemplate[] => CELL_FRAMES.includes(textFrame)
		? CELLS.map((cells) => ({ id: `${textFrame}-${cells}`, textFrame, cells }))
		: [{ id: textFrame, textFrame }]);

export function templateVariants(state: GeneratorState) {
	return state.mode === 'figure'
		? FIGURE_TEMPLATES.map((p) => ({
				id: p.id,
				state: { ...state, frame: p.frame, style: p.style }
			}))
		: TEXT_TEMPLATES.map((p) => ({
				id: p.id,
				state: { ...state, textFrame: p.textFrame, cells: p.cells ?? state.cells }
			}));
}
