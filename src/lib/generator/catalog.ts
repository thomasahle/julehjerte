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
	'tb-bow': ['Bue og pil', 'archery bue pil sport']
};

export type CatalogItem = {
	id: string;
	name: string;
	art: string;
	box: number;
	package?: string;
};
const seasonal = [
	'star',
	'tree',
	'heart',
	'angel',
	'bell',
	'gift',
	'tb-candle',
	'tb-christmas-tree',
	'tb-gift',
	'tb-star',
	'tb-stars',
	'tb-bell',
	'tb-cookie',
	'ph-snowflake',
	'ph-tree-evergreen',
	'ph-star-four',
	'ph-music-notes',
	'ph-moon-stars'
];
const christmas = new Map(seasonal.map((id, i) => [id, i]));
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
const bare = (id: string) => id.replace(/^(ph|tb)-/, '');
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
export function matchingMotifs(
	items: CatalogItem[],
	query: string,
	all = false
) {
	const words = normal(query.trim()).split(/\s+/).filter(Boolean);
	if (!words.length && !all)
		return items
			.filter((item) => christmas.has(item.id))
			.sort((a, b) => christmas.get(a.id)! - christmas.get(b.id)!);
	return items
		.filter((item) => {
			const text = normal(
				`${item.id} ${item.name} ${names(item.id)?.join(' ') ?? ''} ${item.package ?? ''} ${christmas.has(item.id) ? 'jul christmas' : ''}`
			);
			return words.every((word) => text.includes(word));
		})
		.sort(
			(a, b) =>
				(christmas.get(a.id) ?? 1000) - (christmas.get(b.id) ?? 1000) ||
				a.name.localeCompare(b.name)
		);
}
