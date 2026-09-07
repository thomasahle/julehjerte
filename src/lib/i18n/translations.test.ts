import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { translations, type Language, type TranslationKey } from './translations';

describe('translations', () => {
  const languages: Language[] = ['da', 'en'];

  it('has all required languages', () => {
    expect(Object.keys(translations)).toEqual(['da', 'en']);
  });

  it('has matching keys for all languages', () => {
    const daKeys = Object.keys(translations.da).sort();
    const enKeys = Object.keys(translations.en).sort();
    expect(daKeys).toEqual(enKeys);
  });

  it('has non-empty values for all keys', () => {
    for (const lang of languages) {
      for (const [key, value] of Object.entries(translations[lang])) {
        if (Array.isArray(value)) {
          expect(value.length, `${lang}.${key} should have items`).toBeGreaterThan(0);
          value.forEach((item, i) => {
            expect(item.trim(), `${lang}.${key}[${i}] should not be empty`).not.toBe('');
          });
        } else {
          expect(value.trim(), `${lang}.${key} should not be empty`).not.toBe('');
        }
      }
    }
  });

  it('has no key without a call site', () => {
    // Guidance 7: no dead code. Eight keys had drifted out of use by the time
    // this was written, one of which had even been re-translated meanwhile.
    // A key is "used" if its name appears anywhere in src outside this file —
    // quoted for t('…'), or after a dot for translations.da.x — which is loose
    // enough that a false pass is possible and a false failure is not.
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(svelte|ts|js)$/.test(entry.name) && !full.endsWith('i18n/translations.ts'))
          sources.push(readFileSync(full, 'utf8'));
      }
    };
    walk('src');
    const haystack = sources.join('\n');
    const unused = Object.keys(translations.da).filter(
      (key) => !new RegExp(`['"\`.\\[]${key}\\b`).test(haystack)
    );
    expect(unused, 'translation keys with no call site — delete them from both languages').toEqual(
      []
    );
  });

  it('instructions array has same length in both languages', () => {
    expect(translations.da.instructions.length).toBe(translations.en.instructions.length);
    expect(translations.da.instructions.length).toBe(5);
  });

  describe('specific translations', () => {
    const criticalKeys: TranslationKey[] = [
      'siteWordmark',
      'createNewHeart',
      'printSelected',
      'select',
      'selected',
      'downloadPdfTemplate',
      'errorNotFound',
    ];

    it.each(criticalKeys)('has translation for %s in both languages', (key) => {
      expect(translations.da[key]).toBeDefined();
      expect(translations.en[key]).toBeDefined();
    });
  });
});
