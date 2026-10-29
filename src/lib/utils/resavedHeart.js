/**
 * A gallery heart saved over from the editor, given back what the editor left out.
 *
 * A heart opened from the gallery in Tegn is the visitor's own copy, named
 * "Bølger (Kopi)" ("Waves (Copy)"), without the gallery heart's texts, author,
 * publisher, source or date (`loadDesignFromGallery` in EditorPage.svelte): a copy
 * a visitor saves is not by the gallery heart's author. Redrawing a gallery heart
 * that way and saving its "Eksportér SVG" over static/hearts/<id>.svg (Bølger,
 * 2026-10-28) therefore dropped all of that, and the gallery tests stopped every
 * deploy until it was written back by hand.
 *
 * Such a file is told by its two `<desc xml:lang>`, which the editor writes empty
 * for a copy. Its header (names, texts, credit) is written again, as the editor
 * writes one (`serializeHeartToSVG`), from what the generated data still holds of
 * the heart as it was; its cuts and tile stay as they were redrawn. Its name comes
 * back when it is the copy's or the heart's own; a name typed in their place is
 * kept, without the other language's. The colours the editor pins go, as no
 * gallery heart carries any. Plain JavaScript, so scripts/restore-resaved-hearts.mjs
 * runs it as well as the tests.
 */

/** "(Kopi)" and "(Copy)": what the editor puts after a copy's name (translations' `copy`). */
const COPY = { da: '(Kopi)', en: '(Copy)' };

/** @param {string} text */
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** @param {string} text */
const unescape = (text) =>
	text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/**
 * @typedef {{ name: string; names?: { da?: string; en?: string }; author?: string | null; authorUrl?: string | null;
 *   publisher?: string | null; publisherUrl?: string | null; source?: string | null; date?: string | null;
 *   description?: string | null }} HeartMeta  a heart's entry in heart-meta.json
 * @typedef {{ da: string; en: string }} HeartTexts  its entry in heart-descriptions.json
 */

/**
 * The file with its header written again, when it is a re-save of the heart `meta` and
 * `texts` tell of; else null.
 *
 * @param {string} svg
 * @param {HeartMeta} meta
 * @param {HeartTexts | undefined} texts
 * @returns {{ svg: string; keptName: string | null } | null}
 */
export function restoreResavedHeart(svg, meta, texts) {
	if (!texts?.da || !texts.en) return null;
	if (!/<desc xml:lang="da"><\/desc>/.test(svg) || !/<desc xml:lang="en"><\/desc>/.test(svg)) return null;
	const open = svg.match(/^<svg [^>]*>\n/);
	const body = svg.indexOf('  <path');
	if (!open || body < 0) return null;

	const title = unescape(svg.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
	const own = [meta.name, `${meta.names?.da ?? meta.name} ${COPY.da}`, `${meta.names?.en ?? meta.name} ${COPY.en}`];
	const keptName = title && !own.includes(title) ? title : null;
	const name = keptName ?? meta.name;
	const names = keptName ? undefined : meta.names;

	/** @param {string} role @param {string | null | undefined} who @param {string | null | undefined} url */
	const agent = (role, who, url) =>
		who
			? [
					`        <dc:${role}>`,
					url ? `          <cc:Agent rdf:about="${escape(url)}">` : '          <cc:Agent>',
					`            <dc:title>${escape(who)}</dc:title>`,
					'          </cc:Agent>',
					`        </dc:${role}>`
				]
			: [];
	const lines = [
		`  <title>${escape(name)}</title>`,
		...['da', 'en'].map((lang) => `  <title xml:lang="${lang}">${escape(names?.[/** @type {'da' | 'en'} */ (lang)] ?? '')}</title>`),
		...['da', 'en'].map((lang) => `  <desc xml:lang="${lang}">${escape(texts[/** @type {'da' | 'en'} */ (lang)])}</desc>`),
		...(meta.description ? [`  <desc>${escape(meta.description)}</desc>`] : []),
		'  <metadata>',
		'    <rdf:RDF>',
		'      <cc:Work rdf:about="">',
		`        <dc:title>${escape(name)}</dc:title>`,
		...agent('creator', meta.author, meta.authorUrl),
		...agent('publisher', meta.publisher, meta.publisherUrl),
		...(meta.description ? [`        <dc:description>${escape(meta.description)}</dc:description>`] : []),
		...(meta.source ? [`        <dc:source>${escape(meta.source)}</dc:source>`] : []),
		...(meta.date ? [`        <dc:date>${escape(meta.date)}</dc:date>`] : []),
		'      </cc:Work>',
		'    </rdf:RDF>',
		'  </metadata>'
	];
	const tag = open[0].replace(/ data-color-(left|right)="[^"]*"/g, '');
	return { svg: `${tag}${lines.join('\n')}\n${svg.slice(body)}`, keptName };
}
