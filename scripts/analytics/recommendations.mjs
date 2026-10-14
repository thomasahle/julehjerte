#!/usr/bin/env node
// Turn co_downloads.sql into a recommendations map: { heartId: [partnerId, ...] }.
// Usage: node scripts/analytics/recommendations.mjs 20261015 20261231 [perHeart=6]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [start, end, perHeartArg] = process.argv.slice(2);
if (!/^\d{8}$/.test(start ?? '') || !/^\d{8}$/.test(end ?? '')) {
  console.error('usage: recommendations.mjs YYYYMMDD YYYYMMDD [perHeart]');
  process.exit(1);
}
const perHeart = Number(perHeartArg ?? 6);
const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'co_downloads.sql'), 'utf8');
const out = execFileSync('bq', [
  'query', '--project_id=thomasdybdahlahle', '--use_legacy_sql=false', '--format=json',
  '--max_rows=100000', `--parameter=start:STRING:${start}`, `--parameter=end:STRING:${end}`, sql,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const rows = JSON.parse(out || '[]');
const recommendations = {};
for (const row of rows) {
  if (Number(row.rank) > perHeart) continue;
  (recommendations[row.heart_a] ??= []).push(row.heart_b);
}
process.stdout.write(JSON.stringify(recommendations, null, 2) + '\n');
