# Reject poor shared-cut joins before a full geometry audit

The gingerbread and Viking reconstructions retain faint interior seams.
A diagnostic removes exact duplicate curves from their SVG fill contours
without moving any cutting coordinates. The original and cancelled renders
have **identical PNG bytes at both 400 and 1600 pixels**. These particular
seams therefore come from still-separated cuts, not rasterization of cuts
that are already exactly shared.

An additional offline alignment pass accepts six spans in gingerbread and
eight in Viking. Several visible seams disappear, although uneven boundaries,
nicks and some frame seams remain. This does not add an extra production pass
or claim the original design has been recovered.

The pass repeatedly considers proposals that fail the existing bend-radius
or sharp-turn limit. Previously each underwent a full geometry audit before
that cheaper rejection. The implementation now checks cutting quality first.
Every accepted proposal still passes the same geometry, image, feature,
symmetry and paper gates. Budgets and thresholds are unchanged.

The [measurement record](shared-alignment-speed.json) contains two comparisons:

| Frozen-export replay | Previous order | Quality first |
| --- | ---: | ---: |
| Gingerbread alignment, instrumented | 2.654 s | 2.251 s |
| Gingerbread full geometry calls | 18 | 6 |
| Viking alignment, instrumented | 4.275 s | 3.451 s |
| Viking full geometry calls | 37 | 9 |
| All 47 accepted exports, uninstrumented | 29.443 s | 26.517 s |

All **47 serialized output geometries are identical across the two orders**.
Both orders change nine of the frozen inputs through additional alignment;
all 47 outputs pass full final geometry, nominal paper and feature-change
checks. The matrix uses the same masks, settings and twelve-round limit with
no wall-time cutoff. Timing covers alignment only, excluding independent
rendering and the subsequent checks. These single serial runs establish about
10% less local work, not a whole-solver or browser speedup.

The independent pixel-centre score of the additionally aligned maple leaf
rises by one pixel at 400 pixels, identically in both orders. The production
sampler and independent antialiased renderer can differ at such boundaries.
This is retained in the report, not presented as universal image improvement.

Reproduce against a saved release containing `hunodan`, `photos` and
`hunodan-editor-input` directories:

```sh
node scripts/inverse/diagnostics/shared-span-order-study.mjs \
  --corpus=<saved-release> --output=tmp/shared-span-study
```

Use `--runtime=<inverse-directory>` for another frozen implementation. The
diagnostic checks input immutability, retains source/mask/output hashes and
saves independently rendered outputs. It is not a fresh photo solve.

All **110 focused sharing tests** and the diagnostic's ESLint check pass.
Fresh full QA, photo/Hunodan fitting and browser replays are pending. Runtime
`c000d30` remains the latest fully validated release until those checks finish:
reordering rejection work can change which candidate a bounded search reaches,
even though unlimited-pass outputs match exactly.
