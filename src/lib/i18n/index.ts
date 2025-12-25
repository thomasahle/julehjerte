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

export function langPrefix(lang: Language): '' | '/en' {
  return lang === 'en' ? '/en' : '';
}

export function t(key: TranslationKey, lang?: Language): string {
  const l = lang ?? currentLang;
  const value = translations[l][key];
  if (Array.isArray(value)) {
    return value.join('\n');
  }
  return value as string;
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
