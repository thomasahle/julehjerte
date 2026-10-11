# Expanded real-photograph dataset

Added 20 source photographs and 44 selected heart instances from Bibelselskabet, Danish Things, Gathering Beauty and ViSSEVASSE. All retain original bytes, attribution, URLs, checksums and published-template links. Related photographs are grouped by family. These are not 44 independent designs.

![The 20 added photographs](web-photo-inputs.jpg)

[Dataset and commands](../../scripts/inverse/fixtures/web-photos/README.md) · [Machine-readable baseline](WEB-PHOTOS-BASELINE.json)

## Full pipeline replay, 2026-10-11

A fresh run uses the current automatic locator, colour conversion, cut-count
search, common fitter, template checks and independent export renderer. All 44
cases remain in the denominator. Inputs are original source pixels and rough
selection rectangles; no corrected corners or published cuts initialize fitting.
The ten-second budget applies to fitting, not the entire photo-to-report process.

| Existing dataset track | Cases | Candidate checks pass | Needs review | No crop |
| --- | ---: | ---: | ---: | ---: |
| Two-colour | 12 | 7 | 3 | 2 |
| Printed paper | 28 | 2 | 16 | 10 |
| Scene | 4 | 0 | 1 | 3 |
| Total | 44 | 9 | 20 | 15 |

All 29 generated pairs pass the nominal geometry and guarded paper checks.
Of the 20 needing review, 19 exceed 3% independent mask disagreement and 15
lose protected source regions; these categories overlap. Proposal presence and
passing checks are not surveyed corner accuracy, physical assembly tests or
recovery of published cutting paths. The two-colour track includes textured
silver paper and subtle printed dots, so it is not a uniform-material guarantee.

Visual inspection identifies different upstream causes:

- **Silver heart on the tree:** the overlap proposal includes part of the lobe
  and surroundings. Classification also fragments the glitter. The solver returns
  1+1 cuts and 3.775% disagreement; neither its mask nor crop describes the intended
  checker reliably.
- **Silver/white checker:** its crop is plausible and the solver selects the
  plausible 2+2 counts, but glitter and printed-paper variation become false
  holes in the mask. The reconstruction remains at 5.51625% disagreement.
- **Dotted tree:** paper decorations become apparent motif holes before fitting.
  The resulting 13.11% disagreement is not explained by solver runtime alone.
- **Blue/green 3×3 checker:** it passes at 1.4875%, but uses 3+3 cuts. Top and left
  inset profiles consistently report two transitions; the other sides are
  inconsistent. `supportedBorderCounts` is therefore null. A 2+2 grid was tried,
  but the fitter stops after the denser 3+3 candidate passes, before fully refining
  and checking the simpler candidate. This is a concrete model-selection issue
  in addition to border/crop distortion. The evidence does not yet establish
  that the 2+2 alternative would pass the final paper and image checks.
- **Printed green checkers:** two pass the numerical checks while retaining some
  printed details as geometric defects. A low mask error does not mean the
  underlying weave has been recovered correctly.

The green nested-heart and angel photographs still have no usable proposal.
The red/white tree remains at 6.71125% with its current automatic crop. These
failures are retained, not silently excluded from fitting success figures.

[Current measurements and source hashes](CURVE-DEGREES-VALIDATION.json) include
all 44 outcomes. Full visual panels and exported candidates are generated at
`tmp/adaptive-primitives-web-all/report.html`. The fresh all-case run is a new
baseline for further pipeline work; it does not isolate the effect of one recent
code change. The narrower [curve cleanup study](CURVE-DEGREES.md) has a separate
fixed-output experiment for that purpose.

```sh
node scripts/inverse/web-photo-benchmark.mjs --stage=solve --seconds=10 --output=tmp/adaptive-primitives-web-all
```

## First pass, 2026-09-08

The Node benchmark uses the same detector, preparation and automatic solver modules as the site. It receives only source pixels and the pre-annotated rough rectangle for group photos. This run does not replace browser QA. No detector, classifier or fitter was tuned on these new cases before recording the results.

- 29/44 selections produced a crop proposal and prepared mask.
- 15/44 produced no crop. These remain in the denominator and report.
- All 29 proposals were marked for review by the detector. Proposal presence is not a crop-accuracy score.

Visual inspection exposed distinct problems:

1. **Cropping:** the silver heart hanging on a tree includes lobe/background pixels in its proposed overlap square.
2. **Colour conversion:** the blue/green 3x3 checker photograph becomes mostly vertical bands. This loses genuine cells before the fitter runs.
3. **Printed paper:** stripes, dots, swans and flowers on the paper become false weave boundaries. These inputs violate the uniform two-colour assumption even when their crop is plausible.
4. **Glitter:** a plausible silver/white crop still contains many false tiny holes from highlights and texture.

These observations are recorded separately from fitting errors. Template links are retained, but the new published cuts have not been digitized or independently audited.

## Solver integration smoke check

Three predetermined examples were run with a ten-second solver budget, followed by an independent resvg rendering of the exported cubic paths. Total times include decoding, detection, preparation, fitting, validation and exporting.

| Photograph | Total time | Estimated-mask disagreement | Candidate checks |
| --- | ---: | ---: | --- |
| Red/white tree | 11.58 s | 7.02% | Needs review |
| Blue/green 3x3 checker | 8.11 s | 1.70% | Passed, but classified input is visibly wrong |
| Red/white nested heart | 11.24 s | 2.94% | Passed |

The checker example demonstrates why candidate checks cannot substitute for visual or published-template evaluation. All three runs checked exported geometry; the numerical scores compare with the estimated image mask, not the original cutting paths. Border/unknown pixels are excluded from error only when the source validity mask says they are unobserved.

Full initial visual reports are generated locally at `tmp/inverse-web-photos/initial-prepare/report.html` and `tmp/inverse-web-photos/solve-smoke/report.html`. Rerun with the documented commands to recreate them; source inputs are committed and the benchmark requires no network.
