import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { benchmarkArtifactEntries } from './benchmark-artifacts.mjs';

const files = Object.freeze({
  'cut_geometry.json': '{"curves":[1,2,3]}',
  'report.json': '{"templateChecksPassed":true}',
  'template_left.svg': '<svg>left cutting paths</svg>',
  'template_right.svg': '<svg>right cutting paths</svg>',
  'weave_preview.svg': '<svg>visible weave</svg>',
  'mask.bin': Uint8Array.of(0, 1, 1, 0),
  'report.html': '<html>full diagnostic report</html>',
  'manufacturability_left.svg': '<svg>dense left paper cells</svg>',
  'manufacturability_right.svg': '<svg>dense right paper cells</svg>'
});

test('compact benchmark storage retains exact replay geometry, mask, checks and cutting previews', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'heart-artifacts-'));
  try {
    for (const [name, content] of benchmarkArtifactEntries(files, { full: false })) {
      await fs.writeFile(path.join(directory, name), content);
    }
    const expected = ['cut_geometry.json', 'mask.bin', 'report.json', 'template_left.svg', 'template_right.svg', 'weave_preview.svg'];
    assert.deepEqual((await fs.readdir(directory)).sort(), expected);
    for (const name of expected) assert.deepEqual(await fs.readFile(path.join(directory, name)), Buffer.from(files[name]));
    assert.equal(Object.keys(files).length, 9, 'Storage selection must not mutate engine exports.');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('explicit full diagnostics retain every original engine file and byte value', () => {
  assert.deepEqual(benchmarkArtifactEntries(files, { full: true }), Object.entries(files));
});
