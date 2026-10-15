# Automatic recovery of enclosed motifs

The direct fitter now has a bounded corner-routing recovery, followed by the
existing clearance projection, Bézier refinement and final cleanup. It starts
from the uploaded mask, never a saved cutting template. The earlier isolated
[clearance experiment](corner-clearance-repair.md) remains unchanged as evidence.

Global pixel error can reward a narrow channel that opens an otherwise enclosed
motif. Rejecting those fits alone did not recover the missing enclosures in the
paired development runs. The new path constructs an alternative routing before
the ordinary grid search, when a small corner disturbance supports that attempt.

## Source support and limits

Larger interior regions receive enclosure protection only if a small dilation
of their colour still cannot reach the square boundary or unknown pixels. This
avoids treating checkerboard point contacts and thin classification gaps as
confidently closed shapes. Same-colour neighbours may merge inside a protected
group. Both colours are treated alike. This is a source-mask confidence
heuristic, not knowledge of the original artwork.

Cleanup and matching-sheet proposals may not open a confidently enclosed motif
that their incoming candidate preserved. An already imperfect candidate remains
eligible for improvement. The ordinary final acceptance test has not been
replaced by a blanket large-region enclosure requirement: that stricter rule
rejected candidates without finding better routings.

Automatic corner recovery requires at least a 20-second requested allowance,
fully observed pixels, no requested hard symmetry, stable interior enclosures,
and a bounded corner proposal. The smallest proposal must change no more than
0.5% of the original pixels, preserving the ordinary border-recovery allowance.
Its MILP/repair/refinement attempt shares at most 16 seconds. All image scores
and feature checks use the unchanged original mask; geometry and paper checks
remain mandatory. Short searches keep their existing scheduling.

The border-change limit matters in practice. Before it was applied, Stonehenge
spent 23.31 seconds instead of 7.72 without improving its 1.905% error. With the
limit it takes 7.48 seconds at the same error. The flower remains at 0.50625%
and about 6.6 seconds. These are fresh paired fits of fixed benchmark masks,
not new crop-detection measurements or repeated timing distributions.

## Verification

The fresh automatic replay takes **16.34 seconds** through fitting and engine
export. Its independent disagreement is **1.7475% at 400 pixels** and **1.8664%
at 800 pixels**. The finer reference repeats each original cell; it contains
no extra photographic information. Editable SVG disagreement is **1.73%**.
All four heart motifs remain enclosed, and geometry and paper checks pass.
These measurements exclude the subsequent independent rendering and editor
audit; actual browser latency is measured separately.

The automatic stacked-hearts regression checks the original mask and probability
bytes, fresh routing, geometry and paper validity, independent exports at 400
and 800 pixels, and the shape and enclosure of all four hearts. A separate
replay converts the result to editable SVG, parses it back, and checks physical
geometry, paper support, source fidelity and the enclosed components.

The browser harness also has a `stacked-hearts-mask` case. It uploads the frozen
estimated mask through Paint, uses the real worker, opens Draw and downloads
the editable SVG. It does not supply saved geometry, rerun neural inference or
claim to test photograph cropping.

```sh
node scripts/inverse/diagnostics/corner-clearance-repair.mjs \
  --mode=automatic --seconds=30 --output=FRESH_DIRECTORY
node --test --test-concurrency=1 \
  scripts/inverse/feature-enclosures.test.mjs \
  scripts/inverse/corner-topology.test.mjs
```

The reference mask is a frozen neural estimate, not original artwork. The
recovered motifs still have uneven boundaries. No physical assembly or
ten-second performance claim follows from this recovery.

Runtime commit `8ca7c42` passes **883 inverse tests**, **857 application tests**
(one existing skip), type checking, explicit core lint, repository lint and
the production build. All 732 pinned source files remained unchanged during
that QA run. The [evidence record](enclosure-recovery.json) retains the separate
corpus, export and browser measurements, including failed comparisons.

All **22 Hunodan designs** retain exactly the validated baseline's error, with
a maximum measured preparation/solve/validation/export time of **7.94 seconds**.
The automatic photo corpus remains **25/31**, with no lost accepted case. All
**47 accepted editable pairs** pass the independent editor/geometry/paper checks.
Five photo errors nevertheless increase against the older validated runtime:

| Photograph | Baseline error | Current error |
| --- | ---: | ---: |
| Warped checker | 1.755000% | 1.761875% |
| Round checker | 1.213750% | 1.214375% |
| Fine checker | 2.168750% | 2.245000% |
| Crown | 2.411875% | 2.413125% |
| Viking | 2.024375% | 2.056875% |

The strict no-higher-error gate remains **failed**. Source photographs, automatic
crops, classified masks and fitting probabilities match the baseline exactly.
The differences arise downstream. A focused before/after/after/before replay
of the fine checker produces errors of 2.281875%, 2.281875%, 2.245000% and
2.168750%. The first before/after exports have identical cutting coordinates.
The latter pair starts polishing at the same recorded error but reaches steps
44 and 59 respectively. This exposes sensitivity to how much refinement fits
inside the wall-clock budget; it does not establish that every regression has
the same cause or excuse the failed comparison.

All **six actual Chromium workflows** pass: stacked hearts, native flower,
Stonehenge photograph, puppy photograph, example star and preferred-matching
free-border hat. The stacked-heart upload takes **16.74 seconds click to ready**,
and its downloaded editable SVG has **1.73%** source-mask disagreement. All four
hearts remain enclosed at 400 and 800 pixels. The result screenshot was reviewed;
remaining uneven edges are visible.

The strict initial-script-size comparison records a four-byte failure. The
generated SvelteKit identifier changes from `__sveltekit_pcs580` to
`__sveltekit_19yb0vv`, appearing four times in the affected runtime chunk. This
accounts for the size difference. Separate fresh Draw and Paint checks verify
served bytes, no page errors and **zero initial solver/WASM requests**. The
original strict failure is retained rather than overwritten.

## Refinement rollback follow-up

The [rollback study](paper-rollback.json) isolates another loss of useful work.
A coarse paper audit can remain uncertain on curves that pass the independent
700-cell audit. Refinement then repeatedly restores an older, much poorer safe
checkpoint. Waiting until the stage ends to resolve that uncertainty wastes
the intervening gradient steps.

The fitter now tries the finer audit before such a rollback, only when a safe
incumbent already exists and the audit reserve remains. The identical geometry
must pass; no physical tolerance changes. Its verification resolution travels
with progress snapshots, subsequent polishing and final export. A finer pass
does not bypass source-image checks, other ordinary finalists or the existing
comparison with simpler layouts. When time prevents another fit, the cheap
comparison records its deferred candidate explicitly.

The distinction between preventing a rollback and introducing one is material.
An unrestricted prototype verified Viking's provisional shape too early,
creating a safe rollback point that interrupted its useful search through later
provisional states. Its independent error rose to 2.398125%. Requiring an existing
safe incumbent restored the prior 2.056875% result in the five-case timing probe.
Early stage handoffs were also rejected after inconsistent photographic results.

With identical 201-step work, the floral-checker fixture improves from 4.611875%
to 1.580625% independently rendered disagreement. The gift fixture, which has no
safe incumbent, retains exactly the same coordinates. New tests replay the
published progress geometry through the finer paper audit and preserve the
remaining-time reserve. These are refinement diagnostics on fixed inputs, not
new automatic-cropping or physical-assembly results. Full corpus and release QA
for this follow-up are still pending.
