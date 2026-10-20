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
	[item.author, PACKAGES[item.package ?? 'juleflet']].filter(Boolean).join(', ');
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
	localNames[id] ?? localNames[bare(id)] ?? aliases[bare(id)];
export function motifLabel(item: CatalogItem, lang: 'da' | 'en') {
	return lang === 'da'
		? (names(item.id)?.[0] ?? item.name)
		: bare(item.id).replaceAll('-', ' ');
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
/** Every item matching all the words, the grouped figures first. */
export function matchingMotifs(items: CatalogItem[], query: string) {
	const words = normal(query.trim()).split(/\s+/).filter(Boolean);
	return items
		.filter((item) => {
			const group = featured.get(item.id);
			const text = normal(
				`${item.id} ${item.name} ${names(item.id)?.join(' ') ?? ''} ${item.package ?? ''} ${item.author ?? ''} ${group ? groupWords[group] : ''}`
			);
			return words.every((word) => text.includes(word));
		})
		.sort(
			(a, b) =>
				(order.get(a.id) ?? 1000) - (order.get(b.id) ?? 1000) ||
				a.name.localeCompare(b.name)
		);
}
