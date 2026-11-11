/**
 * What a step of the weaving film says, in the page's language.
 *
 * The player (static/weave/film.js) only says which step it is: one of the fixed steps before
 * and after the weaving by `id`, a weaving step by the `tag` scripts/weave/pack.py stored in the
 * recording. A recording that names neither keeps its own English words.
 *
 * The steps name the two papers by the colours the visitor has them in (`papers`: $lib/weave/papers).
 */
import { t, tArray, type Language } from '$lib/i18n';
import type { WeaveStep } from './film';
import type { PaperWords } from './papers';

export interface StepWords {
	title: string;
	text: string;
}

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** "første" for strip 0; the number itself beyond the words the language file has. */
function ordinal(index: number, lang: Language): string {
	return tArray('weaveOrdinals', lang)[index] ?? `${index + 1}.`;
}

/** "tre" for 3. */
function count(n: number, lang: Language): string {
	return tArray('weaveCounts', lang)[n - 2] ?? String(n);
}

function fixedStep(step: WeaveStep, lang: Language, papers: PaperWords): StepWords | null {
	switch (step.id) {
		case 'strips':
			return { title: t('weaveStripsTitle', lang), text: t('weaveStripsText', lang) };
		case 'fold':
			return { title: t('weaveFoldTitle', lang), text: t('weaveFoldText', lang) };
		case 'round':
			return { title: t('weaveRoundTitle', lang), text: t('weaveRoundText', lang) };
		case 'cut': {
			const [red, white] = step.n ?? [0, 0];
			const title =
				red === white
					? t('weaveCutTitle', lang, { n: count(red, lang) })
					: t('weaveCutTitleTwo', lang, { a: count(red, lang), b: count(white, lang) });
			return {
				title,
				text: t(step.straight ? 'weaveCutTextRuler' : 'weaveCutTextTemplate', lang)
			};
		}
		case 'lay':
			return { title: t('weaveLayTitle', lang), text: t('weaveLayText', lang, { ...papers }) };
		case 'handle':
			return { title: t('weaveHandleTitle', lang), text: t('weaveHandleText', lang) };
		case 'hang':
			return { title: t('weaveHangTitle', lang), text: t('weaveHangText', lang) };
		default:
			return null;
	}
}

function weavingStep(tag: string, lang: Language, papers: PaperWords): StepWords | null {
	if (tag === 'start') {
		return { title: t('weaveStartTitle', lang), text: t('weaveStartText', lang, { ...papers }) };
	}
	const parts = tag.split(',');
	if (parts[0] === 'row' && /^\d+$/.test(parts[1] ?? '')) {
		return {
			title: t('weaveRowTitle', lang, { n: ordinal(Number(parts[1]), lang), ...papers }),
			text: t('weaveRowText', lang, { ...papers })
		};
	}
	if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return null;
	const red = ordinal(Number(parts[0]), lang);
	const white = ordinal(Number(parts[1]), lang);
	if (parts[2] === 'R') {
		return {
			title: t('weaveRedTitle', lang, { n: capital(red), m: white, ...papers }),
			text: t('weaveRedText', lang, { ...papers })
		};
	}
	if (parts[2] === 'W') {
		return {
			title: t('weaveWhiteTitle', lang, { m: capital(white), n: red, ...papers }),
			text: t('weaveWhiteText', lang, { ...papers })
		};
	}
	return null;
}

export function stepWords(step: WeaveStep, lang: Language, papers: PaperWords): StepWords {
	return (
		fixedStep(step, lang, papers) ??
		weavingStep(step.tag, lang, papers) ?? { title: step.title, text: step.text }
	);
}
