# Radial motif reconstruction and completed QA

The new candidate batch is still unassigned. A six-design development diagnostic
checks whether its simplest shapes already reconstruct through the existing
pipeline. It selects the first polygonal and smooth design at each of 3, 5 and
8 lobes, and each design's first photographic view, before running any fits.

Each design receives three separate inputs: its canonical binary mask; the
photograph with the known synthetic overlap corners; and the full photograph
with automatic cropping. The main fitter receives no cutting paths, graph,
preferred trace or cut-count hint. The photo tracks use the same classified-mask
objective as Mal. Reference geometry is used only to score the results.

| Track | Checked results | Largest reference disagreement | Slowest solve |
| --- | ---: | ---: | ---: |
| Canonical mask | 6/6 | 0.124% | 1.84 s |
| Photograph, known corners | 6/6 | 0.559% | 2.22 s |
| Photograph, automatic crop | 6/6 | 0.607% | 6.19 s |

These are independently rendered fitted cuts. The solve clock excludes crop
detection, scoring and artifact writes; the requested search allowance is ten
seconds. Automatic crop overlap IoU is at least 98.7%. All eighteen fits recover
two slits per sheet, matching the source count without receiving it as input.
Every pair also passes production editable conversion, SVG round-trip, editor
intersection checks, source-feature retention and nominal paper-core checks.
The largest conversion-render drift is 0.035 percentage points.

All six three-track comparison panels were visually inspected. Clean binary
polygons are reconstructed closely; photographic corners are rounder than the
latent artwork. Several automatic crops contain thin edge artifacts, some of
which remain in the fitted image. They did not produce extra slits in these
six cases. Passing a small aggregate-error gate does not remove those defects.
This is a simple procedural recipe and does not add successes to the fixed
31-photo real-image benchmark or establish performance across the whole batch.

## A scoring bug found and corrected

The first diagnostic mistakenly rendered and compared all results at 400
pixels. Photo preparation had correctly capped the photographic masks at their
384-pixel source resolution. Comparing flattened arrays with different strides
produced spurious errors around 40%, despite the solver passing its own checks.

Those initial comparison scores, statuses and incorrectly sized mask/crop
previews are explicitly invalid. They remain preserved with an `INVALID.md`.
The corrected replay regenerates every input and requires its mask hash to
match the original, then renders the **same saved cuts** at the actual prepared
resolution. No fitting is repeated, no candidate is replaced, and no failed
algorithm result is relabelled through a changed target.

The existing `photo-pipeline.mjs` had the same fixed-resolution assumption for
smaller inputs. It now takes the resolution from preparation for visualization,
reference projection and rendering. Both photographic replay tools use a shared
scorer that rejects mismatched dimensions, and their image writers check buffer
lengths. An integration regression processes a 380 × 320 photograph through
the real CLI: the requested 384-pixel setting correctly yields 320-pixel masks,
previews and reference scores. Seven focused tests pass after this correction.

## Completed checks and preview

The generation changes pass 799 inverse tests, 855 application tests with one
existing skip, type checking, lint and build. The subsequent scoring patch has
the seven focused tests above plus lint; it does not change application code.
A separate annotation fix accepts an omitted optional `overlapCorners` field
where validation already allowed it. Ten Python tests pass, including identical
RGB, label, uncertainty and overlay outputs for omitted versus explicit-null
corners, with the source annotation preserved.

The rebuilt preview was refreshed at `http://127.0.0.1:5232/editor/mal/`, and all
153 built/HTTP-served assets were checked. Three Chromium flows pass: built-in
star, matching free-border hat and the gold routing mask, including editable
geometry and two PDF downloads. Their result/Draw screenshot pairs were inspected.
These repeat existing QA cases; the gold mask's crop remains annotation-assisted.
The 113 application/static source files pinned by the earlier full release are
unchanged. Nothing has been pushed or deployed.

The [evidence record](synthetic-radial-pipeline.json) retains corrected per-case
scores, mask/cut identity checks, editable checks, source hashes, browser results
and 386 local artifacts. The [generation record](synthetic-radial-motifs.json)
preserves the earlier checkpoint when full QA was still pending. No neural model
was trained or deployed, and physical assembly remains untested.
