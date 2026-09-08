# Automatic fitting and candidate access — 2026-09-08

The generator exposes one fitting workflow. Photos keep their accepted crop and
start with independent Bézier grids. Flat, un-cropped angular artwork can use a
small traced HiGHS problem first; SVG artwork retains its native paths. A failed
traced attempt falls back to direct fitting against the original mask.

Matching templates are selected when a validated identical pair adds no more
than **one percentage point** of original-mask disagreement, within the 3% quality
target. Proposals copy either sheet or average corresponding cuts, then refine
exactly tied coordinates when time remains. Exact proposals are checked even
when optimization time has expired. This is a bounded candidate search, not a
proof that every possible matching pair will be found. A diagonal mismatch bound
can rule out matching for a fixed crop without search.

Candidate views and downloads stay available when checks fail. The UI and
exported SVG/print sheets explain the image difference or failed checks.
`templateExportAllowed` describes availability; `templateChecksPassed` records
quality. Benchmarks use the latter. Original paths (when present), masks and
comparison overlays remain available after solving.

## Measurements

`AUTOMATIC-VALIDATION.json` records all 22 regular Hunodan photo cases passing
geometry, paper and feature checks in 5.15–9.98 seconds, including preparation,
validation and export. Decoding and independent external rendering are separate.
The source photographs and crops are frozen; no reference paths initialize fits.

Two matching pairs were selected: `hjfig-02` adds 0.7182 percentage points to
internal original-mask error; `hjfig-04` adds 0.9557. Independent exported-image
errors are 1.4137% and 1.3781%. The other cases retain the previous release's error
or improve it. This intentionally uses the subsequently requested matching
allowance; it is different from the earlier strict no-error-increase criterion.
Timing is local evidence, not a guarantee for every device.

`AUTOMATIC-BROWSER-VALIDATION.json` records 130 successful checks across the
reference, matching, photo-upload recovery, candidate-review, general generator
and comparison suites. The reference suite uses Chromium and Firefox; the other
five also use WebKit. Checks include actual worker solves, independently rendered
ZIP contents, failed-check downloads, manual crop recovery, mobile layout,
Danish controls, cancellation and worker reloads. The 4.37% UI case is controlled
engine output, not a reconstruction of the user's separate screenshot.

The same browser review confirms the cropped Uret v2 photo (`circle.jpg`,
1000 × 1000) and Amy Young's author link to https://www.amydesign.co/.

## Additional dense photograph

The subsequently supplied orange heart exposed an eight-slit ceiling in direct
fitting. The search now expands, based on repeated evidence from opposing inset
bands, up to 16 slits per sheet. All 22 frozen Hunodan cases keep their existing
count hypotheses, so this extension does not add initialization work to that
benchmark. Dense cases may use a longer first-candidate refinement budget when
requested; the 10-second Hunodan measurement is not a promise for this new photo.

See [HARD-ORANGE.md](HARD-ORANGE.md) for the initial fixed-crop improvement and the tiny region warning retained in browser
fits. Automatic detection was subsequently added in
[ORANGE-CROPPER.md](ORANGE-CROPPER.md).
The final code passes 269 automated tests, lint, a production build, and type
checking with zero errors and eight pre-existing warnings.
