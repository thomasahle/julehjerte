import { translations, type Language, type TranslationKey } from './translations';

// Simple reactive state using Svelte 5 runes pattern with module-level state
const currentLang: Language = 'da';

export function langFromPathname(pathname: string, basePath = ''): Language {
  let path = pathname;
  if (basePath && path.startsWith(basePath)) {
    path = path.slice(basePath.length) || '/';
  }
  if (!path.startsWith('/')) path = `/${path}`;
  return path === '/en' || path.startsWith('/en/') ? 'en' : 'da';
}

/**
 * Values for a string's `{…}` placeholders. Which placeholders a key takes is
 * documented next to the key in translations.ts.
 */
export type TranslationParams = Record<string, string | number>;

/** Fill in `{name}` placeholders; an unknown one is left as it is written. */
function interpolate(text: string, params: TranslationParams): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  );
}

export function t(key: TranslationKey, lang?: Language, params?: TranslationParams): string {
  const l = lang ?? currentLang;
  const value = translations[l][key];
  const text = Array.isArray(value) ? value.join('\n') : (value as string);
  return params ? interpolate(text, params) : text;
}

/**
 * "3 × 3 striber" — the heart's grid as a label.
 *
 * Its own function because the editor and the detail page both show it, and
 * before this they filled `stripsCount`'s {n} in by hand with two different
 * multiplication signs.
 */
export function stripsLabel(grid: { x: number; y: number }, lang?: Language): string {
  return t('stripsCount', lang, { n: `${grid.x} × ${grid.y}` });
}

export function tArray(key: TranslationKey, lang?: Language): string[] {
  const l = lang ?? currentLang;
  const value = translations[l][key];
  if (Array.isArray(value)) {
    return [...value];
  }
  return [value as string];
}

export { translations, type Language, type TranslationKey };
