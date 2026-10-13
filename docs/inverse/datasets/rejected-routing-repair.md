# Repairing nearly valid photographic routing

Commit `f7056e3` adds a bounded connection between traced MILP routing and the
existing continuous Bézier refiner. It improves a fixed sloth perturbation study
from **one to three checked pairs out of eight**, including editable SVG replay.
The full automatic-photo benchmark remains **24/31**. This does not establish a
neural-model advantage, recover original artwork, or resolve crop sensitivity.

The later [clearance-routing follow-up](clearance-routing-repair.md) extends
repair to nonlocal narrow sections and preserves finer paper verification.
That separate run reaches five of these eight fixed crops; the historical
measurements below still describe `f7056e3`.

## Why the previous search failed

The [real adaptation study](real-adaptation.md) found that a subpixel change in
automatically estimated sloth corners could change a passing 2+2-cut result into
a rejected 3+3-cut result. Both crops were within the approximate manual-corner
uncertainty. Holding the classified pixels fixed exposed two further causes:

- The initial radius-0.3 trace contained narrow returns. The solver spent its
  recovery allowance excluding invalid discrete routes and then constructing a
  larger graph, without reaching the established radius-0.5 alternative.
- A first integer route from the smoother trace missed the 1.5 mm short-return
  clearance by just 0.0037 mm. Its fixed MILP geometry could not move to repair
  that deficit. The common Bézier optimizer could.

A much worse radius-0.3 route can achieve lower image error while remaining
geometrically illegal. It still fails. Image agreement never substitutes for
cut legality, paper support or preservation of substantial motif features.

## Production change

Before expensive routing, recovery compares unbranched visible-chain returns
in the two existing traces. Radius 0.5 goes first only if it reduces the return
count without worsening their maximum relative deficit, improves or preserves
agreement with the unchanged source mask, passes the feature audit, and has no
known endpoint, margin or intrinsic-intersection contradiction. This is ordering
evidence: hidden connectors can change sheet assignments, so visible-chain
quality is not an infeasibility proof. The original trace remains a fallback.
Cheap contradictions keep their existing retry path.

The MILP can expose an independently integer-checked but geometrically rejected
candidate to a private observer. At most one candidate per recovery gets a
continuous repair attempt: it must have only one or two short-return failures,
with at most a 5% clearance deficit, and already pass source-image and feature
checks. Weighted/free-border inputs and requested symmetry are excluded from
this new repair path. The common refiner preserves shared geometry and uses the
original pixels. Its optimization allowance is at most 700 ms; final audits
must finish before the overall recovery deadline. It receives no extra overall
search budget.

A stopped MILP still reports failure. The separately repaired result must pass
all unchanged image, feature, geometry and paper checks, and receives no
optimality bound from the earlier fixed-geometry problem. Rejected proposals
are not published as validated progress or downloadable incumbents.

## Paired perturbation experiment

The original RGB photograph, four previous automatic crops, and four one-pixel
translations of the mixed-model crop are fixed before fitting. Baseline
`55ed2d4` and the candidate run in separate fresh Node processes, alternating
order. Both receive the same ten-second setting and the same classified pixels.
Neither receives saved cutting paths. The four named crop estimates are
historical model outputs, not models newly trained or selected in this study.

| Crop | Baseline error / checked | Candidate error / checked | Candidate prepare + fit + export + independent render |
| --- | --- | --- | ---: |
| Production | 1.3728% / yes | 1.3728% / yes | 7.75 s |
| Frozen neural model | 4.3808% / no | 4.3584% / no | 9.42 s |
| Synthetic-only adaptation | 5.3472% / no | 5.3472% / no | 9.47 s |
| Mixed-model, out of fold | 5.4304% / no | 1.0304% / yes | 7.48 s |
| Mixed crop, x − 1 pixel | 5.3792% / no | 0.5808% / yes | 6.81 s |
| Mixed crop, x + 1 pixel | 5.7328% / no | 5.7328% / no | 9.41 s |
| Mixed crop, y − 1 pixel | 5.6544% / no | 5.6544% / no | 9.44 s |
| Mixed crop, y + 1 pixel | 5.1424% / no | 5.1424% / no | 9.23 s |

Errors use an independent renderer of exported cubic cuts against the complete
classified mask. They are not errors against unavailable ground-truth artwork.
All sixteen saved candidates were independently rendered and feature-audited,
then passed through actual production editable conversion, SVG serialization
and parsing, editor intersection rules, mask replay and physical checks. The
three candidate passes survive that conversion at 1.3600%, 1.0192% and 0.5888%
error, respectively. The standalone export-audit command exits nonzero because
five of the already failing baseline/candidate pairs also fail editor geometry;
none of the checked engine pairs regresses in export.

Visual review confirms that the two recoveries retain the sloth's branch and
toes; failed variants lose or distort those shapes. Uneven boundaries and small
protrusions remain in passing outputs. No physical assembly test is claimed.

The x−1 case benefits from trace ordering alone; the mixed crop also needs
continuous repair. The frozen crop reaches recovery with only 0.326 seconds
left. The other failures still exhaust their graph search; the smoother trace
does not uniformly improve their image and return evidence. These distinctions
matter: this change cannot repair a route the search has not found.

## Broader checks and reproduction

The automatic-crop, binary-mask photo replay retains **24/31 complete cases**:
three have no crop and four fail fitting checks. All previous crops, classified
masks and fitting-probability hashes are unchanged. The inventory also retains
16 incomplete or obscured entries outside that denominator. There are no
pass/fail changes relative to the preceding production run.

The repeated 22-design Hunodan run passes every speed and release-quality
gate in **3.28–8.57 seconds**, with errors identical to the preceding production
run. The initial full run passed only 20/22: hjsta-04 took 10.010 seconds and
hjsta-05 had 1.360% error, above its 1.273% release cap. Both use the unchanged
grid route and never enter the new routing code. Fresh paired baseline/candidate
checks pass both with identical errors (0.503% and 1.062%). Unrelated heavy CPU
work was observed during the initial run; it is a plausible timing contributor,
not proof of its sole cause. Both full runs and all paired checks are retained.

The focused regression fixture includes the original failing mask and saved
rejected proposals for diagnosis. Its fresh-solve test supplies only pixels to
`design()`; separate tests exercise repair rejection and prevent rejected MILP
geometry from becoming a validated incumbent.

```sh
node --test --test-concurrency=1 scripts/inverse/rejected-routing.test.mjs
node scripts/inverse/hard-photo-benchmark.mjs \
  --crop=automatic --target=mask --seconds=10 --output=<new directory>
INVERSE_SPEED_OUT=<new directory> node scripts/inverse/hunodan-speed-benchmark.mjs
```

All **763 inverse tests**, **855 application tests** (one existing skip), type
checking, lint and the production build pass. Type checking retains seven
warnings in two unchanged UI files. The earlier intermittent tree assertion
passes in this full run, including exported branch checks; diagnostic capture
now preserves the actual report and cuts if it fails again. This does not
establish the cause of the earlier failure.

Five actual Chromium flows also pass: sloth-mask upload, star, matching
free-border hat, leaf-mask upload, and the original green-tree photograph.
They exercise the real worker, displayed error, editable SVG download/reparse,
editor geometry, feature and paper checks. Star, sloth and leaf also exercise
PDF downloads. All five have no page errors, and their rendered results were
visually inspected. Passing results still have some uneven edges; the leaf's
border and small framing details are visibly less faithful than the star.

| Browser input | Click to ready | Editable disagreement |
| --- | ---: | ---: |
| Sloth mask | 7.70 s | 1.3181% |
| Star | 1.98 s | 0.1600% |
| Matching free-border hat | 7.66 s | 0.4119% within the protected motif |
| Leaf mask | 8.69 s | 2.6300% |
| Green-tree photograph | 8.13 s | 1.0575% |

Mal resizes the unchanged 250-pixel sloth upload to 400 pixels. Its resulting
mask hash is pinned separately from the native-resolution study, and the
browser observes that exact mask reaching the worker. This resized target
uses ordinary traced routing, without the new ordering or repair. The browser
pass verifies compatibility and export, not an additional repair-specific gain.
The hat keeps 43 exactly shared spans and a matching pair; the star also finds
matching sheets. The preview was rebuilt and restarted at
`http://127.0.0.1:5232/editor/mal/`, and its served solver, feature-recovery and
repair modules match the worktree byte-for-byte. Nothing was pushed or deployed.

Local experiment artifacts are under `tmp/heart-learning/routing-repair-v1/`.
`matrix/results.json` records all sixteen independent audits; `matrix-editor/`
contains actual exported SVGs and their complete checks. `cases.json` freezes
the RGB source hash and crop coordinates; original failed experiments are
retained. The [committed evidence record](rejected-routing-repair.json) includes
the full paired audit, both Hunodan runs, browser results, source hashes and an
artifact ledger. The five remaining sloth perturbations and seven unresolved
complete photographs remain open algorithmic work.
