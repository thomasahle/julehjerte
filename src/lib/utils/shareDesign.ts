import { browser } from '$app/environment';
import { base } from '$app/paths';
import type { HeartDesign, HeartDesignJson } from '$lib/types/heart';
import type { Language } from '$lib/i18n';
import { heartPath } from '$lib/i18n/routes';
import { SITE_URL } from '$lib/config';
import { readableVersion } from './formatVersion';
import { DESIGN_VERSION, decodeHeartDesign, encodeHeartDesign } from './storedDesign';

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
 * encodeURIComponent(JSON) form is accepted as well. The JSON is the heart's own
 * (`$lib/utils/storedDesign`), with its version; a link from a later site than the
 * one reading it opens as a broken link does.
 *
 * Path coordinates (0-100 units) are rounded to 1/1000 before encoding: that is at most
 * 0.006 px at the largest grid, and it makes the links about three times shorter.
 */

/** The detail route id that renders a design from the URL fragment. */
export const SHARED_HEART_ID = 'delt';

const COORD_DECIMALS = 3;

function roundPathData<T extends HeartDesignJson>(json: T): T {
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
  const bytes = new TextEncoder().encode(JSON.stringify(roundPathData({ v: DESIGN_VERSION, ...json })));
  if (typeof CompressionStream === 'function') {
    return bytesToBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
  }
  return bytesToBase64Url(bytes);
}

/** The JSON a payload carried, unless it is a heart from a later site than this one. */
function readable(json: unknown): unknown | null {
  return json && typeof json === 'object' && !readableVersion((json as { v?: unknown }).v, DESIGN_VERSION) ? null : json;
}

/**
 * Decode a #design= payload back to the raw JSON value (run it through
 * normalizeHeartDesign). Returns null for anything that is not a valid payload,
 * and for a heart written by a later site than this one.
 */
export async function decodeSharedDesign(payload: string): Promise<unknown | null> {
  const text = payload.trim();
  if (!text) return null;
  // Legacy links: encodeURIComponent(JSON), possibly already percent-decoded by the reader.
  if (text.startsWith('{') || /^%7b/i.test(text)) {
    for (const candidate of [text, safeDecodeUriComponent(text)]) {
      if (candidate === null) continue;
      try {
        return readable(JSON.parse(candidate) as unknown);
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
    return readable(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
  } catch {
    return null;
  }
}

/**
 * The payload of Tegn's own address for a heart, `?edit=true#design=<payload>`:
 * the heart's JSON, percent-encoded, as Tegn has always written it. Tegn reads
 * its address before its first render, with no time to wait for a
 * DecompressionStream, so the shared links' shorter form is no use there.
 */
export function encodeDesignLink(design: HeartDesign): string {
  return encodeURIComponent(JSON.stringify(encodeHeartDesign(design)));
}

/**
 * The heart in Tegn's address, `#design=` or an older link's `?design=`, as
 * URLSearchParams hands it over (percent-decoded once), or encoded once more.
 * Null where it holds no heart this site can read.
 */
export function decodeDesignLink(raw: string): HeartDesign | null {
  // URLSearchParams has already percent-decoded once; fall back to a second decode for
  // links that were encoded twice.
  const candidates = [raw];
  const decoded = safeDecodeUriComponent(raw);
  if (decoded !== null) candidates.push(decoded);
  for (const candidate of candidates) {
    try {
      const design = decodeHeartDesign(JSON.parse(candidate) as unknown);
      if (design) return design;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function safeDecodeUriComponent(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

/**
 * The absolute share link for an encoded payload, in the given language.
 *
 * Built from the origin the visitor is actually on, so "Del" on a preview
 * deploy, a branch build or a reviewer's local server copies a link to *that*
 * build. SITE_URL stays the fallback for prerendering, where there is no
 * window to ask.
 */
export function sharedDesignUrl(payload: string, lang: Language): string {
  const origin = browser ? `${window.location.origin}${base}` : SITE_URL;
  return `${origin}${heartPath(SHARED_HEART_ID, lang)}#design=${payload}`;
}
