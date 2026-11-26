import { danishName, danishWords } from './danishWords';
export const localNames: Record<string, [string, string]> = {
	star: ['Stjerne', 'star jul'],
	tree: ['Juletræ', 'christmas tree gran jul'],
	heart: ['Hjerte', 'heart kærlighed'],
	circle: ['Cirkel', 'circle form'],
	flower: ['Blomst', 'flower natur'],
	snow: ['Snefnug', 'snowflake jul vinter'],
	moon: ['Måne', 'moon nat'],
	house: ['Hus', 'house hjem'],
	angel: ['Engel', 'angel jul'],
	bell: ['Klokke', 'bell jul'],
	gift: ['Gave', 'gift jul'],
	diamond: ['Rude', 'diamond form'],
	nisse: ['Nisse', 'nissemand julemand tomte elf gnome'],
	'yule-goat': ['Julebuk', 'ged buk halm yule goat'],
	'christmas-angel': ['Juleengel', 'engel angel'],
	turkey: ['Kalkun', 'fugl thanksgiving turkey'],
	'ph-cat': ['Kat', 'cat katte killing dyr'],
	'ph-dog': ['Hund', 'dog hunde dyr'],
	'ph-bird': ['Fugl', 'bird fugle dyr'],
	'ph-butterfly': ['Sommerfugl', 'butterfly dyr natur'],
	'ph-horse': ['Hest', 'horse pony dyr'],
	'ph-rabbit': ['Kanin', 'rabbit hare dyr'],
	'ph-fish': ['Fisk', 'fish hav dyr'],
	'ph-paw-print': ['Pote', 'paw hund kat dyr'],
	'ph-tree-evergreen': ['Grantræ', 'evergreen juletræ gran jul natur'],
	'ph-coffee': ['Kaffe', 'coffee kop hverdag'],
	'ph-bicycle': ['Cykel', 'bicycle cykler sport'],
	'ph-sailboat': ['Sejlbåd', 'sailboat båd ferie'],
	'ph-flower-tulip': ['Tulipan', 'tulip blomst natur'],
	'ph-crown': ['Krone', 'crown konge dronning'],
	'ph-snowflake': ['Snefnug', 'snowflake jul sne'],
	'ph-music-notes': ['Noder', 'music musik node'],
	'ph-sun': ['Sol', 'sun natur'],
	'ph-leaf': ['Blad', 'leaf blade natur'],
	'tb-bow': ['Bue og pil', 'archery bue pil sport'],
	// Christmas motifs and animals from the open sets in SOURCES.txt.
	'gi-polar-star': ['Nordstjerne', 'stjerne julestjerne betlehemsstjerne polar star'],
	'ms-candle': ['Stearinlys', 'lys lysestage candle'],
	'gi-santa-hat': ['Nissehue', 'nisse hue julemand santa hat'],
	'pin-reindeer': ['Rensdyr', 'hjort julemand reindeer deer'],
	'fa-sleigh': ['Kane', 'slæde julemand sleigh sled'],
	'mc-snowman': ['Snemand', 'sne vinter snowman'],
	'mc-gingerbread-man': ['Honningkagemand', 'peberkage honningkage småkage gingerbread cookie'],
	'mdi-candy-cane': ['Slikstok', 'slik stok candy cane'],
	'mdi-stocking': ['Julesok', 'sok strømpe stocking'],
	'fa-mitten': ['Vante', 'vanter handske vinter mitten'],
	'mdi-bauble': ['Julekugle', 'kugle pynt juletræ bauble ornament'],
	'mc-wreath': ['Krans', 'dørkrans adventskrans wreath'],
	'fa-holly': ['Kristtorn', 'bær blade holly'],
	'mdi-church': ['Kirke', 'church'],
	'pin-dove': ['Due', 'fred fugl dove peace'],
	'mc-moon-stars': ['Måne og stjerner', 'måne stjerne nat moon stars'],
	'mc-candy': ['Bolsje', 'slik karamel candy sweets'],
	'fa-tree': ['Juletræ', 'gran træ christmas tree'],
	'pin-heart': ['Hjerte', 'heart kærlighed'],
	'fa-bell': ['Klokke', 'bell'],
	'mdi-gift': ['Gave', 'pakke gift present'],
	'mc-snowflake': ['Snefnug', 'sne vinter snowflake'],
	'pin-cat': ['Kat', 'katte killing cat'],
	'pin-dog': ['Hund', 'hunde hvalp dog'],
	'pin-horse': ['Hest', 'pony horse'],
	'mdi-bird': ['Fugl', 'fugle dompap rødhals bird'],
	'mdi-owl': ['Ugle', 'fugl owl'],
	'fa-fish': ['Fisk', 'hav fish'],
	'mdi-rabbit': ['Kanin', 'hare rabbit'],
	'pin-bear': ['Bjørn', 'isbjørn bamse bear'],
	'gi-mouse': ['Mus', 'mouse'],
	'hi-pig': ['Gris', 'svin pig'],
	'hi-cow': ['Ko', 'køer kalv cow'],
	'mdi-penguin': ['Pingvin', 'penguin'],
	'mdi-unicorn': ['Enhjørning', 'hest unicorn'],
	'gi-swan': ['Svane', 'fugl swan'],
	'gi-squirrel': ['Egern', 'squirrel'],
	'fe-hedgehog': ['Pindsvin', 'hedgehog'],
	'pin-elephant': ['Elefant', 'elephant'],
	'pin-butterfly': ['Sommerfugl', 'insekt natur butterfly']
};

export type CatalogItem = {
	id: string;
	name: string;
	art: string;
	box: number;
	package?: string;
	/** The icon's author, where its licence asks for a credit. */
	author?: string;
	/** Where an icon found in the open sets comes from: author, set and licence. */
	source?: string;
};
/** The figures on show before any search. The rest of the catalogue is found by searching. */
export const MOTIF_GROUPS = {
	jul: [
		'star',
		'tree',
		'heart',
		'christmas-angel',
		'nisse',
		'yule-goat',
		'bell',
		'gift',
		'mc-snowflake',
		'gi-polar-star',
		'ms-candle',
		'gi-santa-hat',
		'pin-reindeer',
		'fa-sleigh',
		'mc-snowman',
		'mc-gingerbread-man',
		'mdi-candy-cane',
		'mdi-stocking',
		'fa-mitten',
		'mdi-bauble',
		'fa-holly',
		'mdi-church',
		'pin-dove',
		'mc-moon-stars',
		'mc-candy',
		'house',
		'mc-wreath'
	],
	dyr: [
		'pin-cat',
		'pin-dog',
		'pin-horse',
		'mdi-bird',
		'mdi-owl',
		'fa-fish',
		'mdi-rabbit',
		'pin-bear',
		'gi-mouse',
		'hi-pig',
		'hi-cow',
		'mdi-penguin',
		'mdi-unicorn',
		'turkey',
		'gi-swan',
		'gi-squirrel',
		'fe-hedgehog',
		'pin-elephant',
		'pin-butterfly'
	],
	form: ['circle', 'diamond', 'flower', 'moon']
};
export type MotifGroup = keyof typeof MOTIF_GROUPS;
const groupWords: Record<MotifGroup, string> = {
	jul: 'jul christmas',
	dyr: 'dyr animal',
	form: 'form shape'
};
const featured = new Map(
	Object.entries(MOTIF_GROUPS).flatMap(([group, ids]) =>
		ids.map((id) => [id, group as MotifGroup] as const)
	)
);
const order = new Map([...featured.keys()].map((id, i) => [id, i]));
export const PACKAGES: Record<string, string> = {
	juleflet: 'Juleflet',
	phosphor: 'Phosphor',
	tabler: 'Tabler',
	fontawesome: 'Font Awesome',
	'game-icons': 'Game Icons',
	pinhead: 'Pinhead',
	mdi: 'Material Design Icons',
	'material-symbols': 'Material Symbols',
	mingcute: 'MingCute',
	healthicons: 'Healthicons',
	'fluent-emoji': 'Fluent Emoji'
};
/** Where a motif comes from, for its tooltip: the set, and the author when the licence asks. */
export const motifSource = (item: CatalogItem) =>
	item.source ?? [item.author, PACKAGES[item.package ?? 'juleflet']].filter(Boolean).join(', ');
const aliases: Record<string, [string, string]> = {
	candle: ['Stearinlys', 'lys jul christmas candle'],
	'christmas-tree': ['Juletræ', 'gran træ jul christmas tree'],
	gift: ['Gave', 'gave pakke jul christmas present gift'],
	cookie: ['Småkage', 'peberkage jul cookie biscuit'],
	stars: ['Stjerner', 'stjerne jul stars'],
	'star-four': ['Julestjerne', 'stjerne jul christmas star'],
	'bell-ringing': ['Juleklokke', 'klokke jul christmas bell'],
	sparkles: ['Stjernedrys', 'stjerne jul stars sparkles'],
	'moon-stars': ['Måne og stjerner', 'måne stjerne jul moon stars']
};
const bare = (id: string) => id.replace(/^(ph|tb|fa|gi|pin|mdi|ms|mc|hi|fe)-/, '');
const names = (id: string) =>
	id.includes(':') ? undefined : (localNames[id] ?? localNames[bare(id)] ?? aliases[bare(id)]);
export function motifLabel(item: CatalogItem, lang: 'da' | 'en') {
	return lang === 'da'
		? (names(item.id)?.[0] ?? danishName(item.name) ?? item.name)
		: bare(item.id.split(':').pop()!).replaceAll('-', ' ');
}
const normal = (s: string) =>
	s
		.toLocaleLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
/** The groups shown before any search, in order, with the items the catalogue has. */
export function motifGroups(items: CatalogItem[]) {
	const byId = new Map(items.map((item) => [item.id, item]));
	return Object.entries(MOTIF_GROUPS).map(([group, ids]) => ({
		group: group as MotifGroup,
		items: ids.flatMap((id) => byId.get(id) ?? [])
	}));
}
/** The words an item is found by: its id, names in both languages, set, author and group. */
function searchWords(item: CatalogItem): string[] {
	const group = featured.get(item.id);
	return normal(
		`${item.id} ${item.name} ${names(item.id)?.join(' ') ?? ''} ${danishWords(item.name)} ${item.package ?? ''} ${item.author ?? ''} ${group ? groupWords[group] : ''}`
	)
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
}
/** How well a word finds an item: 0 as a whole word of it, 1 as a word's start, 2 inside a word; none if it does not. */
function rank(words: string[], word: string): number | undefined {
	let best: number | undefined;
	for (const w of words) {
		const at = w.indexOf(word);
		if (at < 0) continue;
		const r = w === word ? 0 : at === 0 ? 1 : 2;
		if (r === 0) return 0;
		if (best === undefined || r < best) best = r;
	}
	return best;
}
/**
 * Every item matching all the words, the best matches first: "ear" finds the
 * ear before the gear, and both before the bear and the heart, which only
 * have the letters inside them. Among equals the grouped figures lead.
 */
export function matchingMotifs(items: CatalogItem[], query: string) {
	const asked = normal(query.trim()).split(/\s+/).filter(Boolean);
	const found: { item: CatalogItem; rank: number }[] = [];
	for (const item of items) {
		const words = searchWords(item);
		let worst = 0;
		for (const word of asked) {
			const r = rank(words, word);
			if (r === undefined) {
				worst = -1;
				break;
			}
			worst = Math.max(worst, r);
		}
		if (worst >= 0) found.push({ item, rank: worst });
	}
	return found
		.sort(
			(a, b) =>
				a.rank - b.rank ||
				(order.get(a.item.id) ?? 1000) - (order.get(b.item.id) ?? 1000) ||
				a.item.name.localeCompare(b.item.name)
		)
		.map((f) => f.item);
}
