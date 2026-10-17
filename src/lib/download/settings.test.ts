import { describe, expect, it } from 'vitest';
import { DEFAULT_DOWNLOAD_SETTINGS, parseDownloadSettings } from './settings';

describe('parseDownloadSettings', () => {
	it('reads every field it wrote', () => {
		const saved = {
			mode: 'laser',
			widthMm: 120,
			hearts: 4,
			sheet: { widthMm: 300, heightMm: 200 },
			format: 'dxf',
			scoreFold: true,
			previewImage: false
		};
		expect(parseDownloadSettings(JSON.stringify(saved))).toEqual(saved);
		expect(parseDownloadSettings(JSON.stringify({ sheet: 'A3' })).sheet).toBe('A3');
	});

	it('drops what it does not offer, field by field', () => {
		const parsed = parseDownloadSettings(
			JSON.stringify({ mode: 'fax', widthMm: 900, hearts: 2.6, sheet: 'B5', format: 'pdf', scoreFold: 'yes' })
		);
		expect(parsed).toEqual({ ...DEFAULT_DOWNLOAD_SETTINGS, widthMm: 200, hearts: 3 });
		expect(parseDownloadSettings('not json')).toEqual(DEFAULT_DOWNLOAD_SETTINGS);
		expect(parseDownloadSettings('42')).toEqual(DEFAULT_DOWNLOAD_SETTINGS);
		expect(parseDownloadSettings(null)).toEqual(DEFAULT_DOWNLOAD_SETTINGS);
	});
});
