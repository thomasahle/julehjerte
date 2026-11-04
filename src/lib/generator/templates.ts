import { FIGURE_STYLES, FRAMES, type FigureStyle, type Frame, type TextFrame } from './geometry';
import { CELLS, CELL_FRAMES, type Cells, type GeneratorState } from './state';
import { TEXT_FIGURES } from './textFigure';

export type FigureTemplate = {
	id: string;
	frame: Frame;
	style: GeneratorState['style'];
};
/** The figure frames offered, three to a row of the picker: the easy ones
 * (Cirkel · Stråler, Kiler, Tæt om figuren), the circles that are harder to
 * cut (Cirkel · Lige store tern, Cirkel · Strålekrans, Cirkel med dobbelt
 * bort), and the hard ones that weave the motif otherwise (Tern i spidserne,
 * Små motiver, Figur i ternene). */
export const OFFERED_STYLES: readonly FigureStyle[] = ['rays', 'wedges', 'fitted', 'board', 'sunburst', 'layers', 'corners', 'motifs', 'strips'];
/** The frames no longer offered, being plain (Stor silhuet, Lige store tern and
 * Cirkel · Tern): a link or saved setting that names one still draws it. */
export const RETIRED_STYLES: readonly FigureStyle[] = FIGURE_STYLES.filter((style) => !OFFERED_STYLES.includes(style));
export const FIGURE_TEMPLATES: FigureTemplate[] = OFFERED_STYLES.map((style) => ({
	id: `circle-${style}`,
	frame: 'circle',
	style
}));
export type TextTemplate = { id: string; textFrame: TextFrame; cells?: Cells };
/** The frame whose checks follow the text cells comes as a pair, square cells
 * beside letter-sized ones, its space around the text set by a slider; the
 * figure frames that take the text's outline follow the text's own frames. */
export const TEXT_TEMPLATES: TextTemplate[] = (['woven', 'checkered', ...FRAMES, ...TEXT_FIGURES] as TextFrame[])
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
