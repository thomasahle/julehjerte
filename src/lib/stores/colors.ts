import { browser } from '$app/environment';

export interface HeartColors {
  left: string;
  right: string;
}

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

/** The same red as a hex value, for an <input type="color">. */
export const DEFAULT_RIGHT_COLOR_HEX = '#b91313';

// Simple module-level state with subscribers
let currentColors: HeartColors = { ...DEFAULT_COLORS };
const subscribers = new Set<(colors: HeartColors) => void>();

function loadColors(): HeartColors {
  if (!browser) return { ...DEFAULT_COLORS };

  const stored = localStorage.getItem('julehjerte-colors');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.left && parsed.right) {
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
    localStorage.setItem('julehjerte-colors', JSON.stringify(colors));
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
