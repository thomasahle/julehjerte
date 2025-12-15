import { browser } from '$app/environment';
import { translations, type Language, type TranslationKey } from './translations';

// Detect browser language, default to Danish
function detectLanguage(): Language {
  if (!browser) return 'da';

  const stored = localStorage.getItem('julehjerte-lang');
  if (stored === 'da' || stored === 'en') return stored;

  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('da')) return 'da';
  if (browserLang.startsWith('en')) return 'en';

  // Default to Danish for Danish site
  return 'da';
}

// Simple reactive state using Svelte 5 runes pattern with module-level state
let currentLang: Language = 'da';
const subscribers = new Set<(lang: Language) => void>();

export function getLanguage(): Language {
  if (browser && currentLang === 'da') {
    currentLang = detectLanguage();
  }
  return currentLang;
}

export function setLanguage(lang: Language) {
  currentLang = lang;
  if (browser) {
    localStorage.setItem('julehjerte-lang', lang);
  }
  subscribers.forEach(fn => fn(lang));
}

export function subscribeLanguage(fn: (lang: Language) => void) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
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
