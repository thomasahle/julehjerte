# Generator robustness checks

Run `npm run test:generator:robustness` from the worktree. The offline corpus uses
36 texts, six bundled fonts, and 51 authored, Phosphor and Tabler motifs.
Every font is tested in all six text frames of the picker: close and spacious,
each with square and letter-sized cells, the checkerboard and the circle. Every
motif is tested in all eleven figure frames, including the two of equal squares.
Together this is 1,296 text configurations and 561 figure configurations. The checkerboard places each typed
line once along a horizontal row of the heart's diamond, on the smallest board
that fits: JUL is 3×3, ANNA 4×4, OSCAR 5×5, and the full diamond
J / UL / JUL / UL / J 3×3.

The command writes `tmp/generator/report.json` and a visual review in
`tmp/generator/report.html`. It records generation time, accepted/refused status,
errors and strip counts. An unsupported construction is a **refusal**, not a
successful generation. A heart whose weave and picture are valid but whose paper
is narrower than the clearance is **hard**: the product shows it with a warning
naming the letters beside the narrow paper. It is never an acceptance; its
handoffs are checked at the fraction of the clearance it keeps. The process
fails on an unexpected runtime error, an invalid accepted result, or the loss
of a previously accepted configuration in
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
configurations are pinned in `expected.json`.

Useful focused runs:

```sh
node scripts/generator/robustness.mjs --mode=text --font=nunito --frame=checkered
node scripts/generator/robustness.mjs --mode=text --frame=circle
node scripts/generator/robustness.mjs --mode=text --frame=woven-letters
node scripts/generator/robustness.mjs --mode=text --input=anna
node scripts/generator/robustness.mjs --mode=figure --input=gift
node scripts/generator/robustness.mjs --mode=figure --frame=circle-wedges
node scripts/generator/robustness.mjs --mode=text --failed=tmp/generator/previous-report.json --out=tmp/generator/retest.json
```

Keep each run's output path distinct with `--out=tmp/generator/name.json` when
running batches concurrently. Run the full unit suite separately from large
corpus batches to avoid CPU contention triggering its short per-test timeouts.
