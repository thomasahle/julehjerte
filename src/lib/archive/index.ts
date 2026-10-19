import externalRecords from './external-records.json';
import heartMeta from '$lib/data/heart-meta.json';
import { ALL_HEART_IDS } from '$lib/data/categories';
import { heartName } from '$lib/utils/heartName';
import type { Language } from '$lib/i18n';

export type ArchiveRecord = {
	id: string;
	title: string;
	kind: 'juleflet' | 'photo' | 'document';
	source: string;
	sourceUrls: string[];
	imageUrls: string[];
	credits: string[];
	creditRole?: 'publisher' | 'drawings';
	templateUrls: string[];
	relatedTemplateUrls: string[];
	heartId?: string;
	thumbnail?: string;
	date?: string;
	history?: 'permo';
	historyUrl?: string;
	license?: string;
	licenseUrl?: string;
	preservedTemplates?: { url: string; name: string }[];
};

export type ArchiveFilter = 'all' | 'juleflet' | 'templates' | 'references';

/** Source metadata remains plain text; never render a source title as HTML. */
export function safeArchiveUrl(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
	} catch { return null; }
}

export function archiveRecords(lang: Language): ArchiveRecord[] {
	const metadata = heartMeta as Record<string, {
		name: string; names?: Partial<Record<Language, string>>;
		author: string | null; authorUrl: string | null;
		publisher: string | null; publisherUrl: string | null;
		source: string | null; date: string | null;
		photo: { src: string } | null;
	}>;
	const local = ALL_HEART_IDS.map((id): ArchiveRecord => {
		const meta = metadata[id];
		const sourceUrls = [...new Set([meta.source, meta.authorUrl, meta.publisherUrl]
			.map(safeArchiveUrl).filter((url): url is string => url !== null))];
		return {
			id: `juleflet-${id}`, heartId: id, title: heartName(meta, lang), kind: 'juleflet',
			source: 'Juleflet.dk', sourceUrls, imageUrls: [],
			credits: [...new Set([meta.author, meta.publisher].filter((s): s is string => Boolean(s)))],
			templateUrls: [], relatedTemplateUrls: [],
			thumbnail: meta.photo?.src ?? `/og/${id}.png`,
			...(meta.date ? { date: meta.date } : {})
		};
	});
	return [...local, ...externalRecords as ArchiveRecord[]];
}

export function hasArchiveTemplate(record: ArchiveRecord): boolean {
	return record.kind === 'juleflet' || record.templateUrls.length > 0 || Boolean(record.preservedTemplates?.length);
}

function searchText(value: string): string {
	return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().trim();
}

/** Filter by source credit too: a publisher/uploader is not assumed to be the designer. */
export function filterArchive(records: ArchiveRecord[], query: string, source: string, filter: ArchiveFilter): ArchiveRecord[] {
	const words = searchText(query).split(/\s+/).filter(Boolean);
	return records.filter(record => {
		if (source && record.source !== source) return false;
		if (filter === 'juleflet' && record.kind !== 'juleflet') return false;
		if (filter === 'templates' && !hasArchiveTemplate(record)) return false;
		if (filter === 'references' && hasArchiveTemplate(record)) return false;
		const text = searchText([record.id, record.title, record.source, ...record.credits, ...record.sourceUrls].join(' '));
		return words.every(word => text.includes(word));
	});
}
