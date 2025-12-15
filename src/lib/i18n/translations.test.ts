import { describe, it, expect } from 'vitest';
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

  it('instructions array has same length in both languages', () => {
    expect(translations.da.instructions.length).toBe(translations.en.instructions.length);
    expect(translations.da.instructions.length).toBe(5);
  });

  describe('specific translations', () => {
    const criticalKeys: TranslationKey[] = [
      'siteTitle',
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
