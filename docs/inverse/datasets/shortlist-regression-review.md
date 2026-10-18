# Preserve simpler finalists and test reconstructed results

The first full QA run for the clearance-initializer integration passes 857 of
859 inverse tests. The two failures require particular search histories: a late
maple comparison and a completed denser checker candidate. Type checking, lint,
all 857 application tests (one existing skip), and build pass. All 855 pinned
source files remain unchanged during that run. The failed inverse run is retained;
the subsequent corpus and browser stages did not run.

Fresh paired diagnostics inspect the actual outputs before changing those tests:

| Input | Baseline | New scheduling | Independent disagreement at 400 px |
| --- | ---: | ---: | ---: |
| Maple, classified mask | 14.06 s | 8.48 s | 1.135% for both |
| Photographed checker | 6.19 s | 5.06 s | 1.31875% → 1.016875% |

The maple retains three cuts per sheet and the checker two. Both retain passing
template checks and source features. The maple mask hashes match; checker crop
coordinates, mask hashes and photographic probability hashes also match. The
maple timing includes mask preparation and export; the checker timing measures
design and export after photo preparation. These single paired replays are not
whole-corpus speed guarantees. Source crops were not moved to improve a score.

The maple now reaches the useful 3+3 pair in its initial shortlist. Requiring a
late retry rejects that faster route. The checker reaches a valid 2+2 pair without
finishing the previously accepted 3+3 competitor. Its original exported-image
limit remains 1.48%; the maple's remains 1.2%. Updated tests require the same final
cut counts, template validity, source preservation and independent image fidelity.
The checker also checks features on its independently rendered export. The
maple browser assertion likewise no longer requires a late retry; its geometry,
image and editable-export checks remain. Dedicated tests still cover the late
simpler-comparison policy.

The maple diagnostic initially applied its 1.2% limit at 800 pixels too. Both
runtimes measure **1.3095%** there and therefore fail that stricter diagnostic
flag identically. The original 400-pixel test passes. Both measurements and the
failed diagnostic flags remain in the [evidence record](shortlist-regression-review.json).
Visual inspection shows the same recognizable maple and a closer checker, with
some uneven photographed edges remaining.

## A separate replacement bug

A constructed counterexample exposed a real bug in the new diversity reservation:
given initial counts `[4,4], [5,5], [3,3]`, a competitive `[4,3]` proposal could
evict `[3,3]`, increasing the displaced candidate's cut count while retaining the
more complex `[5,5]`. The new guard permits replacement only when it reduces the
displaced pair's count. It preserves the existing coarse-rank priority and the
best/supported reservations.

The counterexample now retains `[3,3]` and replaces `[5,5]`. A second case checks
that no replacement occurs when only the protected best seed is more complex.
Replaying all 24 recorded coarse tables from the perturbation comparison yields
unchanged shortlists. This is a pure selection check, not another fitting study.

All fourteen focused tests pass after these changes, including both flower
resolutions and fresh upward-shifted leaf reconstruction. Full QA, corpus and
browser replays are pending; the last validated global rates remain unchanged.
