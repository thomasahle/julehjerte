import { browser } from '$app/environment';
import type { HeartColors } from '$lib/types/heart';
import { readStorage, writeStorage } from '$lib/utils/safeStorage';

// Paper colours are a site-wide viewing preference. A saved/exported design
// may also carry an appearance snapshot, without changing its cutting pattern.
export type { HeartColors };

/**
 * The paper colours a heart starts with: white on the left, the classic red on
 * the right. Exported because every component that shows a heart before the
 * store has been read has to start from the same pair — they used to retype it,
 * in four places.
 */
export const DEFAULT_COLORS: HeartColors = {
  left: '#ffffff',
  right: 'rgb(185, 19, 19)'
};

/**
 * The same pair in hex, which is what `<input type="color">` and a design's own
 * `colors` field take. The store's red is still spelled `rgb(…)` for the
 * colours already in visitors' localStorage.
 */
export const DEFAULT_COLORS_HEX: HeartColors = {
  left: '#ffffff',
  right: '#b91313'
};

/** Shared footer suggestions; the colour pickers still allow any paper pair. */
export const COLOR_PRESETS = [
  { colors: DEFAULT_COLORS_HEX, key: 'footerPaletteClassic' },
  { colors: { left: '#fffdf5', right: '#b72f2b' }, key: 'footerPaletteRed' },
  { colors: { left: '#fffdf5', right: '#365943' }, key: 'footerPaletteGreen' },
  { colors: { left: '#ddba6b', right: '#725483' }, key: 'footerPalettePurple' },
  { colors: { left: '#efd6cc', right: '#344e66' }, key: 'footerPaletteBlue' }
] as const;

const STORAGE_KEY = 'julehjerte-colors';

// Simple module-level state with subscribers
let currentColors: HeartColors = { ...DEFAULT_COLORS };
const subscribers = new Set<(colors: HeartColors) => void>();

function loadColors(): HeartColors {
  if (!browser) return { ...DEFAULT_COLORS };

  // Blocked storage reads as nothing stored: the page starts from the defaults.
  const stored = readStorage(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed.left === 'string' && typeof parsed.right === 'string' && parsed.left && parsed.right) {
        return parsed;
      }
    } catch {
      // Ignore invalid stored colors.
    }
  }
  return { ...DEFAULT_COLORS };
}

function saveColors(colors: HeartColors) {
  if (browser) {
    // Blocked or full: the colours still change, for this page view only.
    writeStorage(STORAGE_KEY, JSON.stringify(colors));
  }
}

export function getColors(): HeartColors {
  if (browser && currentColors.left === DEFAULT_COLORS.left && currentColors.right === DEFAULT_COLORS.right) {
    currentColors = loadColors();
  }
  return { ...currentColors };
}

export function setColors(colors: HeartColors) {
  currentColors = { ...colors };
  saveColors(currentColors);
  subscribers.forEach(fn => fn({ ...currentColors }));
}

export function setLeftColor(color: string) {
  setColors({ ...currentColors, left: color });
}

export function setRightColor(color: string) {
  setColors({ ...currentColors, right: color });
}

/** Swap the two paper colours using the shared footer. */
export function flipColors() {
  const { left, right } = getColors();
  setColors({ left: right, right: left });
}

export function subscribeColors(fn: (colors: HeartColors) => void) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
