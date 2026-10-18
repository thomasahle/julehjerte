# Original hard-heart photograph inputs

Eight frozen PNGs restore the original 31-complete-heart benchmark without
depending on uncommitted `tmp/` files or another worktree:

- `collage.png`: the user's Pinterest collage screenshot, converted to sRGB
  during the earlier study. It contains 40 annotated instances: 24 complete,
  15 clipped and one obscured. The decoded PNG exactly reproduces all 6,591,936
  bytes of the earlier `.rgba` capture; that redundant raw file is unnecessary.
- Four `bibel-*` and three `flettede-*` images: the earlier local photograph
  captures from Bibelselskabet and flettedehjerter.dk. Their originating image
  URLs remain in [`photo-cases.json`](../../photo-cases.json). These are frozen
  study inputs, not a claim that the PNG bytes equal an upstream JPEG download.

The files were copied without modification from the existing local experiment.
File and decoded-pixel SHA-256 hashes and dimensions are stored in
[`hard-photo-cases.json`](../../hard-photo-cases.json) and the individual-photo
catalogue. `hard-photo-data.test.mjs` verifies every input. These test assets are
outside the website's public/static directory.

The default benchmark now uses the production automatic cropper and fitter:

```sh
node scripts/inverse/hard-photo-benchmark.mjs --seconds=10 --output=tmp/hard-automatic
```

Collage cases supply only rough rectangles. Single photographs supply their
entire image. Historical overlap corners and insets never enter automatic
cropping or fitting. A missing proposal remains a failure among the 31 complete
cases; the 16 partial/obscured instances remain in the 47-case inventory.
All proposed corners still require visual inspection.

Use the separate fixed-crop diagnostic track to isolate fitting:

```sh
node scripts/inverse/hard-photo-benchmark.mjs --crop=fixed --seconds=10 --output=tmp/hard-fixed
```

Those historical annotations were disputed. They remain approximate inputs,
not ground truth, and their scores are not directly comparable with automatic
crops. Legacy `general`, `simplify`, `mixture`, `direct`, `direct-mixture` and
`unmerged` presets require an explicit `--presets=...`; unknown names now fail
instead of silently selecting the legacy tracer.

`--ids=...` selects cases. `--perturb=true` uses JPEG and half-resolution input
variants with automatic cropping; fixed cropping also permits one-pixel corner
shifts. The recorded time limit covers fitting; detection, preparation, external
rendering and artifact writing have separate costs. Reports retain failures,
source hashes, effective corners, mask/probability hashes, feature checks and
independently rendered exports. No published cutting paths initialize fitting.

For a controlled source-image comparison, `--catalog=path/to/catalog.json`
replaces the default inventory without changing the frozen inputs. Its format
is `{ "source": { "file": "...", "sha256": "...", "width": 0, "height": 0 },
"cases": [{ "id": "example", "roi": [0, 0, 100, 100] }] }`, with actual source
dimensions in place of zero. Image paths are relative to the repository. The
catalogue and photograph hashes are recorded; automatic cropping needs only
rough rectangles, while `--crop=fixed` additionally requires `quad` corners.
Do not assume that different downloads of the same arrangement have identical
framing or that scaling historical coordinates establishes their alignment.

Replay every saved pair through the production editable conversion and SVG
save/reload path, without rerunning the fitter:

```sh
node scripts/inverse/hard-photo-editor-replay.mjs --run=tmp/hard-automatic --output=tmp/hard-editor-automatic
node scripts/inverse/hard-photo-editor-replay.mjs --run=tmp/hard-fixed --output=tmp/hard-editor-fixed
```

This checks editor geometry rules and rendering fidelity, including the exact
classified source-mask hash. It also records remaining mask disagreement and
missing features. A legal conversion is distinct from an acceptable reconstruction.
Conversion failures give a nonzero exit status; a faithfully converted poor
reconstruction remains visible in the report. This isolates the final stage and
does not replace browser interaction QA. The current full-corpus results and
visual diagnosis are in [HARD-CORPUS.md](../../../../docs/inverse/HARD-CORPUS.md).
