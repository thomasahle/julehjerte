import type { HeartDesignJson } from '$lib/types/heart';
import type { Language } from '$lib/i18n';
import { heartPath } from '$lib/i18n/routes';
import { SITE_URL } from '$lib/config';

/**
 * Sharing a user-created heart without a server: the serialised design travels in the
 * URL fragment of /hjerte/delt/ (never sent to a server, so no request-URI limits) as
 *
 *   #design=<base64url(deflate-raw(JSON))>  when CompressionStream is available
 *   #design=<base64url(JSON)>               otherwise
 *
 * Both are accepted on read: a raw deflate stream of our JSON can never start with the
 * byte '{' (0x7b would mean a final fixed-Huffman block whose first code is not '{'),
 * so the first decoded byte tells the two apart. The editor's legacy
 * encodeURIComponent(JSON) form is accepted as well.
 *
 * Path coordinates (0-100 units) are rounded to 1/1000 before encoding: that is at most
 * 0.006 px at the largest grid, and it makes the links about three times shorter.
 */

/** The detail route id that renders a design from the URL fragment. */
export const SHARED_HEART_ID = 'delt';

const COORD_DECIMALS = 3;

function roundPathData(json: HeartDesignJson): HeartDesignJson {
  return {
    ...json,
    fingers: json.fingers.map((finger) => ({
      ...finger,
      pathData: finger.pathData.replace(/-?\d+\.\d+/g, (m) => String(Number(Number(m).toFixed(COORD_DECIMALS))))
    }))
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  transform: ReadableWritablePair<Uint8Array, BufferSource>
): Promise<Uint8Array<ArrayBuffer>> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
  const reader = source.pipeThrough(transform).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Encode a serialised design for the #design= fragment. */
export async function encodeSharedDesign(json: HeartDesignJson): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(roundPathData(json)));
  if (typeof CompressionStream === 'function') {
    return bytesToBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
  }
  return bytesToBase64Url(bytes);
}

/**
 * Decode a #design= payload back to the raw JSON value (run it through
 * normalizeHeartDesign). Returns null for anything that is not a valid payload.
 */
export async function decodeSharedDesign(payload: string): Promise<unknown | null> {
  const text = payload.trim();
  if (!text) return null;
  // Legacy links: encodeURIComponent(JSON), possibly already percent-decoded by the reader.
  if (text.startsWith('{') || /^%7b/i.test(text)) {
    for (const candidate of [text, safeDecodeUriComponent(text)]) {
      if (candidate === null) continue;
      try {
        return JSON.parse(candidate) as unknown;
      } catch {
        // Try the next candidate.
      }
    }
    return null;
  }
  try {
    let bytes = base64UrlToBytes(text);
    if (bytes[0] !== 0x7b) {
      if (typeof DecompressionStream !== 'function') return null;
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

function safeDecodeUriComponent(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

/** The absolute share link for an encoded payload, in the given language. */
export function sharedDesignUrl(payload: string, lang: Language): string {
  return `${SITE_URL}${heartPath(SHARED_HEART_ID, lang)}#design=${payload}`;
}
