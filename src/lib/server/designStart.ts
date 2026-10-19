/**
 * The drawings on the /design start screen, made while prerendering.
 *
 * The cards show gallery hearts, the heart the name card opens with and six
 * motifs from the generator's catalogue. Drawing them here keeps all three
 * sources out of the browser: the gallery designs are 360 KB, the catalogue is
 * 1.2 MB, and the generator would otherwise run before the page could show its
 * own example.
 */
import { getGalleryDesign } from '$lib/data/heartDesigns';
import { renderHeartSvgInline } from '$lib/rendering/heartSvg';
import { generate } from '$lib/generator/generate';
import { defaults, fittedCells } from '$lib/generator/state';
import { DEFAULT_COLORS_HEX } from '$lib/stores/colors';
import type { CatalogItem } from '$lib/generator/catalog';
import type { Font } from '$lib/generator/geometry';
import type { HeartDesign } from '$lib/types/heart';
import type { StartArt } from '$lib/components/DesignStart.svelte';
import catalog from '../../../static/generator/catalog.json';

const fonts = import.meta.glob<Font>('/static/generator/fonts/*.json', { import: 'default' });

/** Where each gallery heart appears; a heart shown twice needs two slots for its clip-path ids. */
const GALLERY = {
	introTree: 'juletrae',
	introStar: 'simple-5star',
	introHeart: 'nemt-hjerte',
	figure: 'simple-5star',
	// One tile repeated over the heart, as the Escher tab draws.
	escherFront: 'drageskael',
	escherBack: 'puslespil',
	// Matches the photograph on the same card.
	picture: '5star'
} as const;
const MOTIFS = ['star', 'tree', 'heart', 'snow', 'angel', 'bell'];

// The site's paper pair, so the header's swatches recolour these hearts too (see app.css).
const paper = { left: 'var(--paper-left)', right: 'var(--paper-right)' };
// Hundredths of a unit are far below a pixel at card size, and it halves the markup.
const rounded = (markup: string) => markup.replace(/(\.\d\d)\d+/g, '$1');
const draw = (design: HeartDesign, slot: string) => {
	const { viewBox, markup } = renderHeartSvgInline(design, paper, { idPrefix: `start-${slot}` });
	return { viewBox: rounded(viewBox), markup: rounded(markup) };
};

/** The heart "Skriv et navn" opens with: the generator's defaults, as the page would request them. */
async function nameHeart(): Promise<HeartDesign> {
	const font = await fonts[`/static/generator/fonts/${defaults.font}.json`]();
	return generate({
		mode: 'text',
		name: defaults.text,
		colors: DEFAULT_COLORS_HEX,
		text: defaults.text,
		font,
		frame: defaults.frame,
		frameSize: defaults.frameSize,
		scale: defaults.scale / 100,
		style: defaults.style,
		textFrame: defaults.textFrame,
		fittedCells: fittedCells({ ...defaults, mode: 'text' })
	}).design;
}

async function drawAll(): Promise<StartArt> {
	const hearts: StartArt['hearts'] = {};
	for (const [slot, id] of Object.entries(GALLERY)) {
		const design = getGalleryDesign(id);
		if (!design) throw new Error(`The design start screen needs the gallery heart ${id}`);
		hearts[slot] = draw(design, slot);
	}
	hearts.name = draw(await nameHeart(), 'name');
	const items = catalog as CatalogItem[];
	const motifs = MOTIFS.map((id) => {
		const item = items.find((m) => m.id === id);
		if (!item) throw new Error(`The design start screen needs the motif ${id}`);
		return { id, box: item.box, art: item.art };
	});
	return { hearts, motifs, name: defaults.text };
}

let art: Promise<StartArt> | undefined;
/** Drawn once per server: every request and both languages show the same art. */
export const designStartArt = () =>
	(art ??= drawAll().catch((error) => {
		art = undefined;
		throw error;
	}));
