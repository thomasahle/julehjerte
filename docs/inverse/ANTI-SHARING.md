# Shared cuts with anti-paired sheets

The between-lobes **Anti** setting enforces reflection in the square's other
diagonal, `x + y = width`. Shared-cut recovery previously returned immediately
for this request, even when the fitted geometry already respected it and had
long near-coincident spans. Its repair code only handled ordinary transposition.

A quarter turn of the existing free-border hat fixture reproduces the omission.
Its geometry and paper checks pass, and its anti-transposition deviation is
below `1e-13` mm, but nine sharing candidates are ignored. No exact shared spans
exist and the narrow seams remain.

## Repair

Anti-paired cuts are matched by crossing order, with the partner order reversed.
Their cubic order and the four controls within each cubic reverse as well. An
edit to two different cuts also updates both partners using the exact reflected
geometry. This uses the configured square width and does not assume that the
serialized path arrays happen to be sorted.

When a cut meets its own partner, the shared interval must align with the mate's
**reversed parameter interval**. Aligning just the spatial endpoints is not
enough: unequal subdivisions would prevent exact symmetry ties. After replacing
the intervals, the existing affine constraints project their common controls
and the resulting symmetry is measured before accepting the candidate.

The original mask, both image-error resolutions, geometry checks, bend-quality
checks, paper-core checks and final feature audit retain their existing gates.
Any ordinary identical-sheet relationship already present is also retained.
The final repair keeps its existing two-second allocation inside the solve
budget. No new visitor setting or separate fitter is introduced.

## Fixed-geometry regression

On the rotated fixture, recovery adds **215.2 mm of exactly shared cuts** on a
100 mm overlap square. Whole-mask disagreement decreases from **3.1925% to
2.9475%**, and an independent antialiased SVG renderer at four times the source
resolution confirms lower coverage error. Both geometry and paper checks pass.
The actual exported controls retain anti-transposition below `1e-7` mm. A second
repair leaves the solution unchanged.

This fixture includes the earlier checker border and its score covers the
whole square. It is not interchangeable with the protected-motif score of the
current free-border workflow. The saved geometry is used only to test cleanup;
fresh fitting receives the original silhouette and starts from new grids.

The regressions also reorder the serialized cuts independently in each family,
check that the original geometry is untouched, and retain the tests for ordinary
matching sheets, independent sheets, genuine narrow lines, sharp joins, near-
repeated subdivisions and budget exhaustion.

## Selected controls must stay selected

The first fresh browser replay failed before fitting: clicking the already
selected **Anti** radio left the row with no checked button. The application
still retained `anti`, because its change handler correctly rejected an empty
selection, but the nested toggle primitive had already cleared its own value.
Ignoring a callback did not make that primitive controlled.

The single-choice toggle now binds through a getter and setter to its caller,
and every required single-choice caller binds to its actual model. This fixes
all three symmetry rows in Paint and Draw, plus Paint's border mode, brush size
and paper colour. The existing guards still reject empty selections and avoid
unnecessary symmetry or border undo steps. No visual restyling is involved.
The browser test reselects the active choices with clicks and Space, verifies
one checked radio remains, switches Anti off and back on, and repeats the
between-lobes check in Draw before downloading the SVG.

## Scope

This extends final recovery to **one anti-transposition request**. Ordinary
transposition and unconstrained fitting retain their existing support. Combined
square symmetries and within-curve symmetry still need complete coordinated
edits and remain excluded from this repair pass. Those requests still constrain
fitting; this pass returns their fitted curves unchanged.

## Verification

All **22 regular Hunodan photographs** pass the existing quality and ten-second
gates, with a median **5.96 s** and maximum **9.00 s**. The eight original,
inverted, shifted and free-border-noise top-hat cases at two frame sizes also
pass, with a median **4.81 s** and maximum **8.16 s**. Their independent image
scores match the previous run. Twenty Hunodan scores are unchanged; one improves
and one increases while remaining within its existing release limit. These are
fresh, time-limited solves, not a paired randomized performance comparison.

A fixed-geometry replay loads the previous repair from `ad64c58`. Ordinary
matching and independently fitted hats produce **byte-identical exported
geometry** with the old and new repair. The rotated anti-paired case improves
as described above. All dependencies other than `share.js` still match that
reference, so this isolates repair from fitting and scheduling differences.

All **15 production browser workflows** pass across Chromium, Firefox and
WebKit, including matching, independent and anti-paired hats, the star with PDF
export, and a Hunodan photograph. The anti-paired hats retain **107 exactly
shared spans** and **0.3189%** protected-motif disagreement in every browser.
The JavaScript fallback also passes the anti-paired workflow with the actual
WebAssembly request blocked. All three browsers verify repeated activation of
the required controls in Paint and Draw. The hat preview and editable drawing
were visually inspected.

All **722 application tests and 250 engine tests** pass, including seven sharing
regressions. Type checking reports zero errors and seven existing warnings; lint
and the production build pass. The application tests and browser checks were
rerun after the control fixes. The Node benchmarks use the same unchanged engine
sources, and all **50 served engine files** match their hashes.
[ANTI-SHARING-VALIDATION.json](ANTI-SHARING-VALIDATION.json) records the source,
artifact and exported-geometry hashes, numerical comparisons and timings.

```sh
node --test scripts/inverse/sharing.test.mjs
INVERSE_TEST_URL=http://127.0.0.1:5232 \
INVERSE_TEST_CASES=top-hat-anti,top-hat,top-hat-independent,star,hunodan \
INVERSE_TEST_OUTPUT=tmp/anti-sharing-release-browser \
  node scripts/inverse/paint-browser-test.mjs
```

The browser harness uploads a newly rendered, rotated top-hat silhouette,
selects the real **Free** border and between-lobes **Anti** controls, and reads
the actual worker result and downloaded editable SVG. It requires the requested
symmetry and shared controls to survive conversion, along with the existing
image-fidelity, crossing, spacing and export checks.
