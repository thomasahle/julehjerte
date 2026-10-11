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

The later [curve-deviation refinement](CURVE-DEGREES.md) adds a second bounded
pass that measures the actual curve and uses adaptive sampling for edit-group
selection. The original pass below still runs first.

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

## Fresh solve verification

All **22 regular Hunodan photographs** pass the existing quality and ten-second
limits. Preparation, fitting, validation and export take a median **7.50 s**,
with a maximum **9.52 s**. The final reduction is accepted in 20 cases.
All **32 weighted motif variants** also pass, with a median **4.96 s** and a
maximum **9.25 s**; 17 accept a reduction. These are fresh solves from masks
and grids, not replays seeded with saved cutting paths. Both runs independently
render the exported curves and retain the existing geometry and paper checks.

Passing the release limits is not a claim that every independent pixel score
improves. Relative to the previous `grid-parity` runs, the Hunodan scores improve
in two cases, stay equal in five, and increase in 15; the largest increase is
**0.0178 percentage point**. Weighted scores improve in four, stay equal in 23,
and increase in five, by at most **0.0123 percentage point**. Timed fitting and
the independent rasterizer both differ from the fixed-output, adaptive-source
comparison above. The report retains each value rather than treating these
metrics as interchangeable or attributing every difference to one cause.

All **722 application tests and 248 engine tests** pass, along with type checking,
lint and the production build. Type checking retains seven existing warnings
and reports zero errors. The full suite passed at `9fdcda7`; a later test-only
change removes a Node type dependency from buffer assertions. All 27 affected
tests, type checking and lint passed again, with buffer constructor, length and
every scalar still checked. The served algorithm and application are unchanged.

## Production browser and export verification

All **24 workflows** pass across Chromium, Firefox and WebKit, including the
star example, a Hunodan upload, small and large free borders, and matching and
independent hats. Every prepared source mask is byte-identical to its preceding
browser input. Checks cover the real worker, visible readiness, Draw, downloaded
editable SVG, original-mask fidelity at both resolutions, shared controls and
the editor's crossing and spacing rules. The star also exercises PDF export.
The matching hat passes again with the actual WebAssembly request blocked;
the worker reports its JavaScript numerical backend.

All three matching hats retain **114 shared spans** and reduce editable motif
disagreement from **0.3224% to 0.3206%**. Their curved-span counts drop from 141
to 40. The independent hats retain **40 shared spans** and unchanged **0.2958%**
disagreement. The hat preview and editable drawing, the house preview and the
fixed-output hat images were visually inspected.

Across the 24 fresh browser runs, editable source scores improve in nine cases,
stay equal in 14 and increase in one. The WebKit large house changes from
**0.0744% to 0.0797%**; it still passes the comparison against its own unsimplified
fit. As with the Node results, that distinction is retained in the report.

All **50 served engine files** match the tested source hashes.
[PRIMITIVE-SELECTION-VALIDATION.json](PRIMITIVE-SELECTION-VALIDATION.json) records
the fixed-output and fresh comparisons, source and downloaded-artifact hashes,
timings, rejected experiments and numerical qualifications. The preview used
for these checks is `http://127.0.0.1:5232/en/editor/paint/`.

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
INVERSE_TEST_URL=http://127.0.0.1:5232 \
INVERSE_TEST_CASES=house-free-small,hat-free-small,star,hat-free,house-free,hunodan,top-hat,top-hat-independent \
INVERSE_TEST_OUTPUT=tmp/final-primitives-browser \
  node scripts/inverse/paint-browser-test.mjs
```

The saved-output replay needs its named local browser artifacts. The six
committed unit regressions are self-contained and include mixed straight/curved
artwork, shared and reversed spans, fractional and zero weights, both phases,
complete symmetry groups, overlapping edits, exact pixel-centre ties and moved
endpoint closures, and preservation of native SVG geometry. The full-suite
concurrency limit changes scheduling only; quality assertions and solver
deadlines retain their existing limits.
