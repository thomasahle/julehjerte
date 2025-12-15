import { browser } from '$app/environment';

export interface HeartColors {
  left: string;
  right: string;
}

const DEFAULT_COLORS: HeartColors = {
  left: '#ffffff',
  right: '#cc0000'
};

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
    } catch {}
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

export function resetColors() {
  setColors({ ...DEFAULT_COLORS });
}

export function subscribeColors(fn: (colors: HeartColors) => void) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export { DEFAULT_COLORS };
