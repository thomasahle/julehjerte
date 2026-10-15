# Generator robustness checks

Run `npm run test:generator:robustness` from the worktree. The offline corpus uses
34 texts, six bundled fonts, and 51 authored, Phosphor and Tabler motifs.
Every font is tested in all ten text frames. Every motif is tested in all 22 figure
templates. Together this is 2,028 text configurations and 1,122 figure
configurations. Repeat cases exceeding the frame's strip limit are excluded,
not reported as successes. The checkerboard variant uses an even period:
ANNA is 4×4, JUL is 6×6, and OSCAR is 10×10.

The command writes `tmp/generator/report.json` and a visual review in
`tmp/generator/report.html`. It records generation time, accepted/refused status,
errors and strip counts. An unsupported construction is a **refusal**, not a
successful generation. The process fails on an unexpected runtime error, an
invalid accepted result, or the loss of a previously accepted configuration in
`expected.json`. Expand that acceptance list only after reviewing new successes;
never remove entries merely to make a regression disappear.

Each accepted result passes the generator's contour fidelity, open-path topology,
intersection and grid-scaled spacing checks. The harness then independently saves
and reloads both JSON and SVG, compares the woven raster, checks the cut count, and
runs the editor's intersection/spacing checks again. The smaller regression suite
in `src/lib/generator/robustness.test.ts` runs with `npm test`.

These are digital checks, not a physical weaving trial. Figure scale and frame
size use the product defaults. This is a deliberately varied sample of the icon
catalog, not a test of every available icon or every historical slider value.
The expanded matrix has now been audited. Some configurations are still refused;
finishing the sweep does not mean every combination is supported. The accepted
configurations are pinned in `expected.json`, including the additional shaped
frames for all six fonts.

Useful focused runs:

```sh
node scripts/generator/robustness.mjs --mode=text --font=nunito --frame=repeat
node scripts/generator/robustness.mjs --mode=text --frame=repeat-check
node scripts/generator/robustness.mjs --mode=text --input=anna
node scripts/generator/robustness.mjs --mode=figure --input=gift
node scripts/generator/robustness.mjs --mode=figure --frame=circle-layers
node scripts/generator/robustness.mjs --mode=text --failed=tmp/generator/previous-report.json --out=tmp/generator/retest.json
```

Keep each run's output path distinct with `--out=tmp/generator/name.json` when
running batches concurrently. Run the full unit suite separately from large
corpus batches to avoid CPU contention triggering its short per-test timeouts.
