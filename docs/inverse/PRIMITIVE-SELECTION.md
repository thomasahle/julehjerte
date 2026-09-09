# Select straight spans without changing the fitted shape

The remaining bends on the hat exposed an all-or-nothing choice in the existing
straight-span proposal. It tried flattening every eligible cubic at once. A few
genuine bends could increase mask error and veto all the useful reductions.
On the saved matching hat, most proposed edits were harmless, but six individual
edits increased the sampled error. The combined proposal was rejected.

The final template selection now considers useful subsets. This is an internal
degree-reduction step in the common fitter, not another image style or solver.
The original straight/curved checkpoint competition and continuous optimization
trajectory remain unchanged.

## Why placement matters

Two intermediate implementations were rejected by broader tests:

- Adding the selective proposal to every checkpoint improved the published
  star's pixel disagreement from 0.1631% to 0.0350%, but moved its cutting paths
  farther from the published template. Maximum sampled distance plus the
  sampling bound increased from about 0.421 to 0.541 mm, failing the existing
  0.5 mm test. A better pixel score did not establish a better reconstruction.
- Applying it after each refinement stage preserved the star, but changed the
  input to later polishing. Two Hunodan photographs, `hjfla-01` and `hjcur-02`,
  then exceeded their existing image-error limits. All 22 were under ten seconds,
  so these were quality regressions rather than speed failures.

Degree reduction now runs **after fitting, matching-sheet selection and shared-
cut recovery**. It cannot seed another optimization stage or promote a different
checkpoint's shape. The final pair must retain all requested symmetries and any
existing identical-sheet relationship. No fitted cutting paths or published
templates are used as initialization for fresh solves.

## Selection and checks

The proposal uses the existing one-pixel handle-to-chord tolerance, measured at
the original source resolution. It does not move a chain's anchors to invent a
new straight outline. Controls joined by a cubic, a shared point, or a symmetry
constraint form one edit group. A moving chord couples the complete within-curve
symmetry constraint as well.

Native SVGs retain their supplied cubic geometry. Their sampled preview is not
used to decide that an exact source curve should become a line.

For each group, the XOR of its old and new sampled boundaries identifies the
pixels it would change. Shared spans cancel, and the same square closures and
strict pixel-centre convention as the full renderer are included. Groups that
do not increase weighted original-mask disagreement are retained. Each accepted
group updates the working mask before the next one is scored: overlapping
changes cannot both claim the same improvement.

The resulting candidate still faces complete checks:

- Render the combined weave again and require no additional sampled mask error.
- Require a lower curved-span count and no increase in the existing boundary
  objective plus primitive cost.
- Independently sample the exported geometry against the original source mask,
  including its validity and free-border weights, and require no added error.
- Retain image features, requested symmetries, existing identical sheets, strict
  geometry checks, and the guarded paper-core checks.

This is an optional bounded final step: it receives at most 500 ms of remaining
work budget, with one second reserved for export. It skips work when no budget
remains. The accepted edit and any rejected proposal have a
`finalPrimitiveSelection` record, including counts, errors, elapsed time and the
rejection reason. The overall solver timing includes this step. Individual
geometry and paper checks are synchronous, so the allocation is not a preemptive
hard deadline for an in-progress check.

## Fixed-output replay

The 24-case replay starts from the preceding browser outputs and their captured
original masks. The baseline is the actual saved final geometry; the old solver
is not rerun. Upstream fitting and validator sources must still match commit
`5c20357`. Only the final degree-reduction step is applied, with an unlimited
diagnostic deadline, followed by geometry, paper, and independent SVG checks.
Fresh timed solves are tested separately.

All 24 cases pass. Fourteen accept a reduction. Original-mask disagreement under
the adaptive geometry sampler improves in eight cases and is unchanged in 16.
The saved WebKit matching hat changes from **141 curved / 19 straight spans**
to **40 curved / 120 straight spans**, with unchanged independently rendered
motif disagreement of **0.3251%**. These count unique spans, including shared
and invisible routing sections, rather than whole cuts.

The independent antialiased SVG renderer reports three improvements, 18 unchanged
scores, and three small increases. Two small-hat outputs increase from 0.3433%
to 0.3525%; one house increases from 0.07175% to 0.07263%. These differences are
retained in the report. Increasing curve samples from 32 to 128 did not change
them; the rasterizers differ in pixel-centre versus antialiased-coverage
classification. No sampled check proves continuous equality or globally optimal
artwork recovery.

This removes unnecessary handle curvature. Zigzags caused by misplaced anchors,
or a wrong cut layout, still require improvements in the main fitting process.

## Reproduction

```sh
node --test scripts/inverse/primitive-selection.test.mjs scripts/inverse/automatic.test.mjs
node scripts/inverse/primitive-selection-replay.mjs \
  --reference=5c20357 --input=tmp/conversion-fidelity-browser \
  --output=tmp/final-primitives-release-replay
VITEST_MAX_WORKERS=2 npm test
INVERSE_SPEED_OUT=tmp/final-primitives-release-hunodan \
  node scripts/inverse/hunodan-speed-benchmark.mjs
node scripts/inverse/weighted-solve-benchmark.mjs \
  --strategies=weighted --variants=original,inverted,shifted,free-noise \
  --output=tmp/final-primitives-release-weighted
```

The saved-output replay needs its named local browser artifacts. The six
committed unit regressions are self-contained and include mixed straight/curved
artwork, shared and reversed spans, fractional and zero weights, both phases,
complete symmetry groups, overlapping edits, exact pixel-centre ties and moved
endpoint closures, and preservation of native SVG geometry. The full-suite
concurrency limit changes scheduling only; quality assertions and solver
deadlines retain their existing limits.
