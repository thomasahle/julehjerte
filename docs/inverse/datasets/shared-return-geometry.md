# Shared return geometry and scale-consistent endpoint handling

The complete-cut return checker now has a standalone TypeScript implementation
usable by the editor, with a generated plain-ESM copy for the worker. The editor
adapter also fixes an endpoint exemption that depended on display coordinates.
These modules are used by the isolated editor experiment; the app and fitter
have not enabled them yet.

## Scale failure and correction

The previous whole-cut prototype excluded witnesses within four editor pixels
of either cut endpoint. A small template therefore had a much larger physical
exemption than an enlarged copy. A narrow return near the fold could disappear
from the check without changing its shape or relative clearance.

The typed adapter normalizes around the start of the cut. The editor's existing
1.5-heart-unit margin becomes 1.5 in these coordinates, and the endpoint exemption
is one heart unit (1% of the overlap width). This matches the native experimental
return check's relative endpoint distance. It does not alter intersection or
inter-cut clearance checks.

The scale probe contains twelve analytic near-endpoint curves and twelve
existing analytic/captured cases. Each is represented at six scales, with four
exact subdivisions and reflection: **1,152 representations**. The prior
whole-cut prototype with the fixed-pixel exemption misses 144 expected returns.
The physical exemption and the typed implementation both agree with the native
return reference on all 1,152 binary verdicts. This is evidence for the tested
return rule; other editor intersection tolerances still use pixel coordinates.

## One implementation for the editor and worker

- `src/lib/geometry/returnSearch.ts` contains the bounded search, its small cubic
  adapter, and the conservative directional exclusion. It imports no solver,
  image-processing or UI code.
- `src/lib/geometry/curveReturns.ts` converts editor segments and their physical
  margin to those normalized coordinates.
- `scripts/inverse/build-return-search.mjs` emits
  `static/inverse/core/return-search.js`. Its check mode verifies exact generated
  content, including the source digest and TypeScript version.
- The isolated editor builder now imports these modules instead of extracting
  executable code from the experimental predicate's function body. The original
  predicate remains the reference implementation for the port tests.

Across **264 cut checks**, both the native cubic objects and the lightweight
typed cubic objects produce exactly the reference witness objects, including
points, parameters, distances and turning values. The inputs remain unchanged.

The editor cubic deliberately has no persistent flattening cache. A regression
first checks a two-unit gap, edits the same control objects to a one-unit gap,
and compares with newly constructed curves. Reusing the native class's cached
flattening misses the new return in this fixture. The typed adapter finds it and
does not mutate its caller's coordinates. Critical-point caching is still local
to one search invocation.

## Actual SVG replay

The new typed editor was replayed on 51 saved original outputs and the two
repaired outputs, each with eight subdivision/reflection representations.
All **424 verdicts** agree with the stronger geometry check. Original bird and
gift are flagged in every representation; their repaired versions pass every
representation. No other saved output is flagged by the typed editor.

| Saved SVG corpus | Representations | Median editor check | Maximum |
| --- | ---: | ---: | ---: |
| Hunodan | 176 | 10.97 ms | 39.40 ms |
| Photographs | 232 | 14.25 ms | 32.83 ms |
| Repaired bird and gift | 16 | 23.96 ms | 27.70 ms |

These native timings include the editor's other geometry checks; they do not
measure browser interaction or solving. The port does not establish a speedup
over the earlier whole-cut prototype. Source hashes, case outcomes, scale-probe
counts, commands and artifact hashes are in the
[evidence record](shared-return-geometry.json). An initial replay invocation
used the wrong Hunodan result wrapper and stopped before auditing any SVG;
the corrected run and original failure log are both retained.

## Verification and activation

Five focused Node tests and two new editor-adapter tests pass. The Node tests
include exact source-to-worker generation, full witness parity, control edits
and the existing whole-cut builder/cone checks. The two adapter tests cover
near-endpoint returns at multiple scales/translations and ordinary sharp bends.
Focused lint passes after removing one unused root-search assignment; numerical
parity was rerun after that cleanup.

```sh
node scripts/inverse/build-return-search.mjs --check
node --test --test-concurrency=1 scripts/inverse/shared-return-search.test.mjs scripts/inverse/whole-return-editor.test.mjs
npx vitest run src/lib/geometry/curveReturns.test.ts --maxWorkers=2
node scripts/inverse/diagnostics/build-whole-return-editor.mjs --output=tmp/new-shared-return-editor
```

The complete repository QA recorded for the preceding experiment is
[separate](whole-cut-editor-validation.json). A fresh full run is required for
these modules. Production activation still needs the final repair and editor
check together, followed by fresh solving and browser checks. In particular,
the experimental finite search is not a completeness proof or physical assembly
test, and this work does not increase the automatic 25/31 photo result.
