import type { ParamMatcher } from '@sveltejs/kit';
import { GENERATOR_MODES, type GeneratorMode } from '$lib/i18n/routes';

/** `figure` or `text`: the design page past its start (`/design/figure/`). */
export const match = ((param: string): param is GeneratorMode => GENERATOR_MODES.includes(param as GeneratorMode)) satisfies ParamMatcher;
