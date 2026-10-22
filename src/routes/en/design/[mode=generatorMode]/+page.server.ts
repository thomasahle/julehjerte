import type { EntryGenerator, PageServerLoad } from './$types';
import { GENERATOR_MODES } from '$lib/i18n/routes';
import { designStartArt } from '$lib/server/designStart';

/** The design page opened on making a figure or a text: a page of its own for each, prerendered like the start. */
export const entries: EntryGenerator = () => GENERATOR_MODES.map((mode) => ({ mode }));

export const load: PageServerLoad = async ({ params }) => ({ art: await designStartArt(), mode: params.mode });
