import { browser } from '$app/environment';
import type { HeartColors } from '$lib/types/heart';
import { readStorage, writeStorage } from '$lib/utils/safeStorage';
import { toHexColor } from '$lib/utils/heartColors';

// A heart's colours are a property of a design as much as of the site, so the
// type lives with the other design types; it is re-exported here because most
// callers reach for it next to getColors().
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

/** Where the pair is kept; the head's inline script reads it too ($lib/stores/colorMode). */
export const COLORS_STORAGE_KEY = 'julehjerte-colors';
const STORAGE_KEY = COLORS_STORAGE_KEY;

/**
 * Which of the header's buttons a pair belongs to: the classic red and white
 * (either way round, `flipped` with the red on the left) or a custom pair.
 */
export type PaperKind = 'classic' | 'flipped' | 'custom';

export function paperKind(colors: HeartColors): PaperKind {
  const left = toHexColor(colors.left, '');
  const right = toHexColor(colors.right, '');
  const { left: white, right: red } = DEFAULT_COLORS_HEX;
  if (left === white && right === red) return 'classic';
  if (left === red && right === white) return 'flipped';
  return 'custom';
}

/**
 * The classes on <html> that tell CSS which kind of pair is on: none for the
 * classic pair, `paper-flipped` or `paper-custom` otherwise. The header's
 * buttons draw their state from them, and the head's inline script sets them
 * from storage before the body paints (with the same rule).
 */
export const PAPER_KIND_CLASSES: Record<Exclude<PaperKind, 'classic'>, string> = {
  flipped: 'paper-flipped',
  custom: 'paper-custom'
};

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

/** Swap the two lobe colours. Used by the footer's swap button and the editor. */
export function flipColors() {
  const { left, right } = getColors();
  setColors({ left: right, right: left });
}

export function subscribeColors(fn: (colors: HeartColors) => void) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
