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
