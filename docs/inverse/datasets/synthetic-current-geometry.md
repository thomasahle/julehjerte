# Current geometry checks on the saved synthetic witnesses

All **256 saved cutting designs** pass the current whole-cut geometry and
paper checks. These comprise the 192 designs used in existing experiments and
64 unassigned radial motifs. They underpin 1,024 synthetic photographic views;
no labels, source images, allocation or trained model changed in this audit.

The existing dataset verifier checks hashes, recorded admission results and
coordinate transforms. It does not rerun physical geometry checks. Because
the solver's whole-cut rules have changed since generation, the stored
`validation.passed` flags alone were insufficient evidence for using these
cuts as graph-supervision witnesses.

The new audit loads each original `cuts.json`, checks its exact file and
geometry hashes, and applies current validation with its **original recorded
settings**. These retain a 100 mm overlap, 2 mm remaining-paper requirement and
2.505 mm tolerance-adjusted nominal width. Every original also passes the
current guarded paper-core audit. No candidate is repaired or substituted.

| Dataset | Designs | Original geometry and paper pass | Geometry representations checked |
| --- | ---: | ---: | ---: |
| Original recipes | 128 | 128 | 384 |
| Mixed-angle lattice supplement | 64 | 64 | 192 |
| Unassigned radial motifs | 64 | 64 | 192 |
| Total | 256 | 256 | 768 |

For each design, the audit also splits every cubic exactly into thirds and
reflects that subdivided representation. All decisions remain passing; sampled
de Casteljau differences are below 1e-10 mm. This checks representation stability
of the current geometry predicate. Paper checks are rerun on originals only.
The entire audit takes 21.01 seconds locally, including reading and saving
records. It does not run the inverse solver or measure browser performance.

The [evidence record](synthetic-current-geometry.json) retains every design's
hash, current verdict, nominal clearance measurements and transformed checks.
It pins the current geometry sources and the complete local audit. All 844
files in that audit's source snapshot remain unchanged during the run.

The audit was initially queued after the application release checks. Those
stopped on two scheduling regressions, so the queue exited without auditing.
After all prerequisite processes and a separate solver diagnostic finished,
the independent geometry audit ran serially against the same frozen sources.
This dataset result does not override the failed application QA.

No synthetic witness needs exclusion under the checked rules. That does not
establish physical assembly, photographic realism or independent motif families.
Recipe splits still share some topologies, and the radial group remains
unassigned. The comparison using `finalGeometry: false` is a diagnostic switch
in the current checker, not a replay of the historical generator runtime.

## Junction labels for future authored imports

A separate source/data audit checks the label representation, not cutting
validity. All **883 generator-defined four-sector crossings** in the existing
192 procedural designs are endpoint-noded and emitted by the current label
helper. All 768 saved view-label records were checked. The 64 channel/frame
designs have no missing interior intersections between visible straight
segments. This is not an exhaustive proof for arbitrary cubic arrangements.

An unallocated authored control exposes a real import hazard: `classic-3x3`
has four visible interior crossings but zero current corner/branch labels,
because its curves do not end at those crossings. Analytic X and T fixtures
independently reproduce the omission; subdividing the identical curves at
their intersection restores the label. Body/material labels and the boundary
pixels drawn from those curves are unaffected by this particular omission.

Future imports need a separate visible-arrangement/junction record prepared
once per design. Keep original cutting paths, ownership and shared-curve
indices unchanged. The existing floating-point `nodeCurves()` helper is a
candidate for this work, but contacts, cancellation and unresolved overlaps
need explicit checks. No labels have been rewritten or models retrained.

The evidence record's `junctionLabelFollowup` pins the audit, analytic
regression and source files. Independent root verification checked all 192
graph hashes, 768 label hashes and 37 source/audit artifacts. All 38 gallery
designs already overlap reference evaluations; the proposed five-design
admission experiment is diagnostic only and allocates zero training families.
