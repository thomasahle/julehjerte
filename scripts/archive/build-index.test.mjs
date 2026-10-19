import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildExternalIndex, publicUrl } from './build-index.mjs';

const read = async path => JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('the published source index is reproducible from reviewed inputs', async () => {
  const [manifest, hunodan, webPhotos, additions, overrides, published] = await Promise.all([
    read('docs/inverse/datasets/real-manifest.json'),
    read('scripts/inverse/fixtures/hunodan/sources.json'),
    read('scripts/inverse/fixtures/web-photos/manifest.json'),
    read('src/lib/archive/source-additions.json'),
    read('src/lib/archive/source-overrides.json'),
    read('src/lib/archive/external-records.json')
  ]);
  assert.deepEqual(published, buildExternalIndex(manifest, hunodan, webPhotos, additions, overrides));
  assert.equal(new Set(published.map(r => r.id)).size, published.length);
  assert.equal(published.filter(r => r.history === 'permo').length, 32);
  const allowed = new Set(['id', 'title', 'kind', 'source', 'sourceUrls', 'imageUrls', 'credits',
    'templateUrls', 'relatedTemplateUrls', 'history', 'historyUrl', 'license', 'licenseUrl', 'preservedTemplates', 'creditRole']);
  for (const record of published) {
    for (const key of Object.keys(record)) assert.ok(allowed.has(key), `${record.id}: unexpected public field ${key}`);
    assert.ok(record.sourceUrls.length > 0, `${record.id}: no public source`);
    for (const url of [...record.sourceUrls, ...record.imageUrls, ...record.templateUrls, ...record.relatedTemplateUrls]) {
      assert.ok(publicUrl(url), `${record.id}: invalid public URL ${url}`);
      if (/pinterest\./.test(new URL(url).hostname)) assert.match(url, /\/pin\/\d+\/$/);
    }
    for (const original of record.preservedTemplates || []) {
      assert.match(original.url, /^\/archive\/templates\/[a-f\d]{64}\.pdf$/);
      assert.equal(record.license, 'CC BY-NC-SA 4.0');
      assert.ok(record.credits.includes('Kim G. L. Pedersen'));
    }
  }
  const text = JSON.stringify(published);
  assert.doesNotMatch(text, /(?:"localPath"|"splitStatus"|"trainingEligibility"|"pinDiscoveryPaths"|\/Users\/ahle\/|TemporaryItems|heart-training-real)/);
});

test('public URLs never reveal accounts, credentials, local files or tracking', () => {
  for (const value of ['file:///Users/a/photo.jpg', 'javascript:alert(1)', 'http://localhost/x',
    'http://192.168.1.2/x', 'https://me:password@example.com/x', 'https://dk.pinterest.com/private-name/private-board/']) {
    assert.equal(publicUrl(value), null);
  }
  assert.equal(publicUrl('https://dk.pinterest.com/pin/123/?utm_source=private'), 'https://www.pinterest.com/pin/123/');
  assert.equal(publicUrl('https://example.com/heart.pdf?utm_source=foo#page=2'), 'https://example.com/heart.pdf#page=2');
});

test('thumbnail duplicates merge while private, unrelated and unreviewed inputs stay out', () => {
  const asset = (id, overrides = {}) => ({ id, kind: 'photo', reviewStatus: 'visually-reviewed-contact-sheet',
    origins: [{ imageUrl: 'https://example.com/heart-200x300.jpg', sourcePages: ['https://example.com/hearts/'], author: null }],
    ...overrides });
  const records = buildExternalIndex({ assets: [
    asset('real-one', { unverifiedTemplateLinks: ['https://example.com/possible-template.pdf'] }),
    asset('real-two', { origins: [{ imageUrl: 'https://example.com/heart.jpg', sourcePages: ['https://example.com/more/'], author: 'Known credit' }] }),
    asset('real-unreviewed', { reviewStatus: 'pending' }),
    asset('real-other', { kind: 'unrelated' }),
    asset('real-private', { origins: [{ imageUrl: null, sourcePages: [], existingFile: '/Users/a/personal.jpg' }] })
  ] }, { images: [] }, { photos: [] });
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].sourceUrls, ['https://example.com/hearts/', 'https://example.com/more/']);
  assert.deepEqual(records[0].credits, ['Known credit']);
  assert.deepEqual(records[0].templateUrls, []);
  assert.deepEqual(records[0].relatedTemplateUrls, ['https://example.com/possible-template.pdf']);
});

test('source image query identities survive thumbnail deduplication', () => {
  const assets = [
    ['real-one', 'https://example.com/image.php?id=1&width=300'],
    ['real-two', 'https://example.com/image.php?width=600&id=2'],
    ['real-one-larger', 'https://example.com/image.php?width=800&id=1']
  ].map(([id, imageUrl]) => ({
    id, kind: 'photo', reviewStatus: 'visually-reviewed-contact-sheet',
    origins: [{ imageUrl, sourcePages: ['https://example.com/hearts/'], author: null }]
  }));
  const records = buildExternalIndex({ assets }, { images: [] }, { photos: [] });
  assert.equal(records.length, 2);
  assert.equal(records.find(r => r.id === 'source-one').imageUrls.length, 2);
  assert.equal(records.find(r => r.id === 'source-two').imageUrls.length, 1);
});
