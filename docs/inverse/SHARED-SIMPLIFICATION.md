# Fewer control points on shared cuts

Exact shared-cut recovery removed the hat's hairlines, but left many short
cubics. The editor deliberately preserves common spans, so its ordinary
simplifier could not remove those points independently. The common fitter now
simplifies complete shared runs after matching, shared-cut recovery and
primitive selection. This final cleanup leaves the optimization trajectory
intact and adds no visitor setting.

A run may continue through a vertex only when exactly two edges meet there,
every occurrence follows the same pair, and no slit starts or ends there.
Visible boundaries terminate runs. All occurrences of an accepted run use one
replacement curve chain, including occurrences travelled in reverse. The
replacement retains the original branch anchors exactly.

## Preserving template symmetry

Related runs are transformed to a canonical orientation before fitting.
Rotations, reflections and travel reversal therefore reuse one fit and the
same subdivisions. This cache belongs to the current proposal and retains
nothing between fitted hearts.

A run can also be its own reflected, reversed partner. Fitting that entire run
without a symmetry constraint produced incompatible subdivisions in the first
experiment, even though the woven mask stayed correct. The final implementation
fits one half and constructs the other half by reflection. The whole-template
symmetry and matching checks remain acceptance requirements.

## Acceptance checks

The proposal uses the existing polyline-to-cubic fitter. It checks sampled
bidirectional distance against the original run, with a 0.02 mm limit on a
100 mm square. Adaptive polylines use a 0.001 mm flattening tolerance and a
0.3 mm maximum chord length at that width. These are sampled comparisons, not
an analytic maximum-distance certificate.

The rebuilt graph must retain the exact visible control polygons. The final
candidate must also retain the complete independently sampled binary weave
at the source resolution and at twice that resolution, all requested
symmetries, an existing identical-template pair, and the geometry and paper
checks. A rejected proposal keeps the previous cutting curves. Native artwork
marked for exact preservation is skipped. Cleanup checks a 500 ms deadline,
bounded by the remaining solve budget and the existing export-time reserve.

## Fixed-geometry replay

All **63 saved-template replays** pass: 22 Hunodan outputs, 32 free-border
outputs, and nine matching, independent and Anti hat outputs from the three
browser engines. Cleanup simplifies **32** of those designs. Their total
number of distinct cubics falls from **5,927 to 5,133**. The other designs
retain their existing representation.

Every 800-cell weave produced by the independent exported-curve renderer
remains identical, including fractional pixel coverage. Original geometry,
slit endpoints, matching status, requested symmetries, geometry and paper gates
are checked separately. Saved templates are inputs to this cleanup replay,
not initializations for fresh image fitting.

The fixed Chromium matching hat falls from **160 to 87** distinct cubics;
its Anti counterpart falls from **157 to 89**. The cleanup regression based on
the original hat failure falls from **151 to 82** while retaining its symmetry
and independently rendered weave.

```sh
node --test scripts/inverse/shared-simplification.test.mjs \
  scripts/inverse/sharing.test.mjs scripts/inverse/primitive-selection.test.mjs

# Defaults use the preceding kernel-equality replay's saved geometries.
node scripts/inverse/shared-simplification-benchmark.mjs
```

The benchmark accepts `INVERSE_SIMPLIFY_HUNODAN`, `INVERSE_SIMPLIFY_WEIGHTED`,
`INVERSE_SIMPLIFY_BROWSER`, and `INVERSE_SIMPLIFY_OUT` for alternate artifact
locations. [SHARED-SIMPLIFICATION-VALIDATION.json](SHARED-SIMPLIFICATION-VALIDATION.json)
records exact source/input hashes, per-case changes and timings.

## Fresh fitting and browser verification

All **22/22 regular Hunodan photographs** pass the existing quality and
ten-second gates with unchanged independently rendered image errors. Their
Node median is **5.88 s**, with an **8.88 s maximum**. The **32/32 free-border
cases** also retain their previous errors, with a **4.69 s median** and an
**8.68 s maximum**. Preparation, fitting, validation and export are timed;
decoding and independent export replay are separate. These are fresh runs,
not a randomized before/after measurement of total fitting speed.

The fixed replay's complete cleanup takes a **58.8 ms median** and **214.8 ms
maximum** among accepted proposals. This change primarily reduces the amount
of editable geometry; it adds a final check rather than making the earlier
optimizer run faster.

All **18 browser workflows** pass in Chromium, Firefox and WebKit, together
with the Chromium JavaScript fallback when the actual WebAssembly request is
blocked. Matching, independent and Anti hats, the star, Hunodan and circle
are checked through editor conversion and downloaded SVG; the star's PDF is
checked too. The matching hat's editable representation falls from **278 to
132 segments** in every engine. Its **41 remaining shared spans** retain
exact common controls on both sheets. Its protected-motif disagreement stays
at **0.3206%**. Anti hats fall from **268 to 132 editable segments**, retaining
**39 shared spans** and **0.3189%** disagreement.

The fresh Firefox independent hat selects different pre-cleanup geometry and
its error improves from **0.4562% to 0.4420%**; the other browser error scores
remain unchanged. The cleanup's own before/after mask checks still agree.
The report preserves both sets of measurements. The matching hat's result and
editable preview were visually inspected.

All **984 tests** pass: 722 application tests and 262 engine tests. Svelte
checking reports zero errors and seven existing warnings; lint and the
production build pass. All **51 served engine files** match the source hashes
used in the fixed replay and the fresh Node fits.
