# User photographs received 2026-10-17

Four heart instances in two unmodified files (about 477 KiB total). These are
development QA fixtures, excluded from neural training. They are not four
independent designs: the motifs are related, and the stacked-heart screenshot
matches photographs already collected from Pinterest. The catalogues record
file and decoded-pixel hashes, provenance, and those known relationships.

`stacked.json` reproduces the reported thin red/white fringe at the detected
overlap boundary. `window.json` selects all three large hearts in the new
window photograph, including blue/orange paper, reflections, paper curvature
and a hand near one boundary. The tiny background ornament is not part of the
requested three woven-heart cases.

The rectangles were chosen by visual inspection before detection or solving.
They select whole hearts; they are not overlap-corner annotations. No cutting
paths, hand-selected slit counts, or reference templates enter the solver.
Original artwork rights remain with its creators. Files are outside public
website assets.

Run either catalogue through the production crop/classification/fitting path:

```sh
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1 \
  nice -n 15 node scripts/inverse/hard-photo-benchmark.mjs \
  --catalog=scripts/inverse/fixtures/user-photos-2026-10-17/window.json \
  --crop=automatic --target=mask --seconds=10 --presets=automatic \
  --output=tmp/window-hearts-new-run
```

Use a new output directory for each run. Ten seconds is the solver's search
allowance; crop detection, import preparation and final checks add time.
Inspect both the original photograph and exported weave, and replay exports
through `scripts/inverse/hard-photo-editor-replay.mjs` before calling them
complete application successes.
