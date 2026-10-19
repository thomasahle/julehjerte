#!/usr/bin/env node
/**
 * Publish an allowlisted source index, never the development/training manifest.
 * No downloads. Run after reviewing a collection update:
 *   node scripts/archive/build-index.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const retainedKinds = new Set([
  'photo', 'photo-multiple', 'photo-collage', 'photo-process',
  'mixed-photo-template', 'template-render'
]);

/** Allow public web references; strip tracking, credentials and local addresses. */
export function publicUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(u.hostname) || /\.(localhost|local|internal)$/.test(u.hostname)) return null;
    // Only pin permalinks are public archive records, never account/board activity.
    if (/(^|\.)pinterest\.[a-z.]+$/.test(u.hostname)) {
      const pin = u.pathname.match(/^\/pin\/([a-z\d_-]+)\/?$/i);
      return pin ? `https://www.pinterest.com/pin/${pin[1]}/` : null;
    }
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(key)) u.searchParams.delete(key);
    }
    return u.href;
  } catch { return null; }
}

/** Same source image at a different thumbnail size is one reference record. */
function imageKey(url) {
  const u = new URL(url);
  if (u.hostname === 'i.pinimg.com') u.pathname = u.pathname.replace(/^\/[^/]+\//, '/originals/');
  u.pathname = u.pathname.replace(/-\d{2,5}x\d{2,5}(?=\.[a-z]+$)/i, '');
  // Query parameters can identify entirely different images (image.php?id=1).
  // Drop only recognized presentation/tracking parameters, keeping identity.
  for (const key of [...u.searchParams.keys()]) {
    if (/^(w|h|width|height|resize|quality|q|dpr|utm_.*|fbclid|gclid|ref|source)$/i.test(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();
  u.hash = '';
  return u.href;
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function sourceName(url) {
  return new URL(url).hostname.replace(/^www\./, '');
}

function titleFor(asset, url) {
  const pinTitle = asset.origins.map(o => cleanText(o.pinTitle).split(' | ')[0]).find(Boolean);
  if (pinTitle) return pinTitle.slice(0, 150);
  const alt = asset.origins.map(o => cleanText(o.alt)).find(s => s.length > 2 && s.length <= 120);
  if (alt) return alt;
  let name = new URL(url).pathname.split('/').pop() || '';
  try { name = decodeURIComponent(name); } catch { /* Keep a malformed source filename verbatim. */ }
  name = name.replace(/\.[a-z\d]+$/i, '').replace(/-\d{2,5}x\d{2,5}$/, '').replace(/[_-]+/g, ' ');
  // A hash is an identifier, not an invented pattern name; the page supplies a translated fallback.
  return /^[a-f\d ]{20,}$/i.test(name) ? '' : name.slice(0, 150);
}

/** Explicit template associations only. Same-page suggestions stay unverified. */
export function buildExternalIndex(manifest, hunodan, webPhotos, additions = [], overrides = {}, merges = []) {
  const hunodanImages = new Map(hunodan.images.map(p => [imageKey(p.url), p]));
  const knownTemplates = new Map(webPhotos.photos
    .filter(p => p.publisher === 'Bibelselskabet' && p.referenceLinks?.length)
    .map(p => [imageKey(p.url), p.referenceLinks.map(publicUrl).filter(Boolean)]));
  const records = new Map();
  for (const asset of manifest.assets) {
    if (!retainedKinds.has(asset.kind) || !asset.reviewStatus?.startsWith('visually-reviewed')) continue;
    const images = [...new Set(asset.origins.map(o => publicUrl(o.imageUrl)).filter(Boolean))];
    if (!images.length) continue; // User uploads with no public provenance stay private.
    const sourceUrls = [...new Set(asset.origins.flatMap(o => [
      ...(o.sourcePages || []), ...(o.observedSourceLinks || [])
    ]).map(publicUrl).filter(Boolean))];
    if (!sourceUrls.length) continue;
    const key = images.map(imageKey).sort()[0];
    const hun = hunodanImages.get(key);
    const sourceUrl = sourceUrls.find(u => !u.includes('pinterest.com')) || sourceUrls[0];
    const templates = hun ? [images[0]] : knownTemplates.get(key) || [];
    const record = records.get(key) || {
      id: asset.id.replace(/^real-/, 'source-'),
      title: hun ? hun.id.toUpperCase() : titleFor(asset, images[0]),
      kind: ['template-render', 'mixed-photo-template'].includes(asset.kind) ? 'document' : 'photo',
      source: sourceName(sourceUrl),
      sourceUrls: [],
      imageUrls: [],
      credits: [],
      templateUrls: [],
      relatedTemplateUrls: []
    };
    record.sourceUrls = [...new Set([...record.sourceUrls, ...sourceUrls])];
    record.imageUrls = [...new Set([...record.imageUrls, ...images])];
    record.credits = [...new Set([...record.credits, ...asset.origins.map(o => cleanText(o.author)).filter(Boolean)])];
    record.templateUrls = [...new Set([...record.templateUrls, ...templates])];
    record.relatedTemplateUrls = [...new Set([
      ...record.relatedTemplateUrls, ...(asset.unverifiedTemplateLinks || []).map(publicUrl).filter(Boolean)
    ])].filter(u => !record.templateUrls.includes(u));
    if (hun) {
      record.credits = ['Per V. Mortensen'];
      record.history = 'permo';
      record.historyUrl = 'https://web.archive.org/web/20010310083053/http://permo.homepage.dk:80/xmsheart.htm';
    }
    records.set(key, record);
  }
  // These deliberately small, reviewed files contain public fields only. Never spread
  // source/training manifest entries into the public index.
  const enriched = [...records.values()].map(record => ({ ...record, ...overrides[record.id] }));
  const merged = new Map([...enriched, ...additions].map(record => [record.id, { ...record }]));
  if (merged.size !== enriched.length + additions.length) throw new Error('Duplicate public archive record ID');
  const reviewedIds = new Set();
  // Only explicit same-source-image reviews may merge records. Board membership,
  // similar titles and training/split groups do not establish image identity.
  for (const { canonicalId, duplicateIds } of merges) {
    const ids = [canonicalId, ...duplicateIds];
    for (const id of ids) {
      if (!merged.has(id) || reviewedIds.has(id)) throw new Error(`Invalid reviewed source merge: ${id}`);
      reviewedIds.add(id);
    }
    const canonical = merged.get(canonicalId);
    for (const field of ['sourceUrls', 'imageUrls', 'credits', 'templateUrls', 'relatedTemplateUrls']) {
      canonical[field] = [...new Set(ids.flatMap(id => merged.get(id)[field]))];
    }
    canonical.relatedTemplateUrls = canonical.relatedTemplateUrls.filter(url => !canonical.templateUrls.includes(url));
    for (const id of duplicateIds) merged.delete(id);
  }
  return [...merged.values()].sort((a, b) =>
    a.source.localeCompare(b.source, 'en') || a.title.localeCompare(b.title, 'en') || a.id.localeCompare(b.id)
  );
}

export async function generate() {
  const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
  const [manifest, hunodan, webPhotos, additions, overrides, merges] = await Promise.all([
    read('docs/inverse/datasets/real-manifest.json'),
    read('scripts/inverse/fixtures/hunodan/sources.json'),
    read('scripts/inverse/fixtures/web-photos/manifest.json'),
    read('src/lib/archive/source-additions.json'),
    read('src/lib/archive/source-overrides.json'),
    read('src/lib/archive/source-merges.json')
  ]);
  const records = buildExternalIndex(manifest, hunodan, webPhotos, additions, overrides, merges);
  const output = JSON.stringify(records, null, 2) + '\n';
  await writeFile(new URL('src/lib/archive/external-records.json', root), output);
  console.log(`${records.length} public source records; ${Buffer.byteLength(output)} bytes; no media copied.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await generate();
