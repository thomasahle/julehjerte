# Final return repair preserves matching and requested symmetries

The final repair now moves symmetry-linked controls together. The earlier
projector could repair each sheet's clearance while making previously identical
sheets different. The same problem affected requested mirrors, rotations and
within-curve symmetries. This is an offline algorithm change; the application
has not switched to the experimental return validator or final repair.

## Failure and correction

Eight analytic probes passed the earlier geometry repair but lost their template
relation. Explicit transpose drift reached 0.0171 mm; mirror and within-curve
cases reached about 0.0291 mm. The matching-sheet probe lost exact identity even
without an explicit symmetry request. These are small distances, but exact
coincidence matters for invisible shared cuts.

The old projector corrected one detected close-point pair at a time. It did not
constrain that update to the fitted relationship between partner controls.
Passing separate clearance checks could not establish that the two templates
still matched. The replacement uses the fitter's existing joint affine/chord
projection for both the correction direction and the resulting controls:

- Requested cutting symmetries remain constraints throughout the repair.
- An already identical pair is also constrained to remain identical.
- Fixed coordinates, and visible coordinates during hidden-only repair, remain
  unchanged. Pinned values are restored exactly after reflection, including
  the sign of zero.
- An input that does not satisfy its requested symmetry is rejected instead
  of being silently reshaped into another design.
- Complete geometry and symmetry checks still decide acceptance. The caller
  must separately check image fidelity, paper support and the exported SVGs.

The new regression failed against the old projector. It now passes eleven
cases, including every supported square transform, both within-curve modes,
combined within-curve/transpose constraints and an additional pinned control.
Every repaired case also passes the complete geometry check after four exact
subdivisions, with and without reflection. This tests numerical geometry and
parameter constraints, not physical cutting or assembly.

## Saved-corpus replay

The reusable study reads all 51 available outputs from the current native
release, retaining their original masks. It first tries a hidden-control repair,
then a free-control repair if necessary, within one shared one-second repair
allowance. An edit is accepted only if it preserves fixed controls, requested
symmetries, existing sheet identity, source features and paper validity, and
does not increase full-square mask disagreement.

| Saved output | Selected repair | Mask error before → after | Repair time |
| --- | --- | ---: | ---: |
| Hunodan bird | Hidden controls | 0.904296% → 0.904296% | 237 ms |
| Collage gift | Free controls | 2.309375% → 2.306250% | 163 ms |

Only those two outputs change. All 49 others are retained, including the two
already identical pairs. All **408 geometry representations** pass the stronger
experimental check after selection. None of the 51 mask errors increases.
The four previously rejected reconstructions remain rejected; a valid geometric
pair does not repair a poor image match. The two cases without outputs are not
part of this replay, so this does not increase the 25/31 photographic result.

Both changed geometry objects exactly reproduce the earlier repaired candidates
whose actual SVGs were independently audited. Their visual limitations and the
old editor's subdivision-dependent gift warning therefore remain. The replay
is not a fresh full solve, browser latency measurement or new visual improvement.
Reported repair times exclude initial validation, rendering and final audits.
The experimental whole-cut search is bounded and numerical, not a completeness
proof for all possible curves.

## Reproduction and verification

Run against a saved release containing the original Hunodan editor-input masks:

```sh
node scripts/inverse/diagnostics/build-short-return-runtime.mjs \
  --output=tmp/new-final-return-runtime
node scripts/inverse/diagnostics/final-return-repair-study.mjs \
  --runtime=tmp/new-final-return-runtime \
  --corpus=tmp/heart-learning/turn-limit-v1 \
  --output=tmp/new-final-return-study
```

The study verifies runtime hashes, source geometry immutability and the
independent render of the reconstructed graph. Its report records failed repair
attempts as well as selected candidates. The [evidence record](final-return-symmetry.json)
contains the before/after symmetry diagnosis, all corpus outcomes, source hashes
and retained artifact hashes.

Eight focused projection/representation tests pass, and focused ESLint passes.
The preceding full QA passed 832 inverse and 855 application tests; it predates
this symmetry change and is recorded [separately](final-return-repair-validation.json).
Production integration still needs a consistent editor validator and fresh
end-to-end speed/quality checks within the existing budgets.
