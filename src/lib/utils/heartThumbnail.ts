import type { HeartDesign } from '$lib/types/heart';
import type { HeartColors } from '$lib/stores/colors';
import { serializeHeartDesign } from '$lib/utils/heartDesign';
import { trackThumbnailError } from '$lib/analytics';

type ThumbnailOptions = {
  size?: number;
};

const DEFAULT_SIZE = 280;
const MAX_CONCURRENT_RENDERS = 1;

const resolved = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const queue: Array<() => Promise<void>> = [];
let active = 0;

function hashStringFNV1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash.toString(36);
}

function getDesignKey(design: HeartDesign, colors: HeartColors, size: number): string {
  const serialized = JSON.stringify(serializeHeartDesign(design));
  const digest = hashStringFNV1a(serialized);
  return `${digest}:${design.id}:${design.gridSize.x}x${design.gridSize.y}:${colors.left}:${colors.right}:${size}`;
}

async function runQueue(): Promise<void> {
  if (active >= MAX_CONCURRENT_RENDERS) return;
  const next = queue.shift();
  if (!next) return;
  active += 1;
  try {
    await next();
  } finally {
    active -= 1;
    // Yield to keep UI responsive between renders
    await new Promise<void>((resolve) =>
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => resolve()) : setTimeout(resolve, 0)
    );
    void runQueue();
  }
}

export function getHeartThumbnail(
  design: HeartDesign,
  colors: HeartColors,
  options: ThumbnailOptions = {}
): Promise<string> {
  const size = options.size ?? DEFAULT_SIZE;
  const key = getDesignKey(design, colors, size);

  const cached = resolved.get(key);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = new Promise<string>((resolve, reject) => {
    queue.push(async () => {
      try {
        const { renderHeartToDataURL } = await import('$lib/pdf/heartRenderer');
        const url = await renderHeartToDataURL(design, { size, colors });
        resolved.set(key, url);
        resolve(url);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown render error';
        trackThumbnailError(design.id || 'unknown', errorMsg);
        reject(err);
      } finally {
        inflight.delete(key);
      }
    });
    void runQueue();
  });

  inflight.set(key, promise);
  return promise;
}

export function clearHeartThumbnailCache(): void {
  resolved.clear();
  inflight.clear();
  queue.length = 0;
  active = 0;
}
