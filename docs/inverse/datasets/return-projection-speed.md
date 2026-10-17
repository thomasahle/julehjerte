# Faster bounded short-return projection

The anchor application test exposed a deadline-sensitive local repair. Its
hidden-control attempt correctly stopped when the remaining witnesses had no
movable gradient. The subsequent all-control attempt repeatedly reached their
shared 400 ms cutoff before retaining a valid checkpoint. This failure also
reproduced with the frozen `99399ff` runtime; it was not introduced by the
HiGHS clock correction.

The projector previously ran the complete geometry validator after every small
coordinate update. It now evaluates the same complete short-return predicate
during those intermediate updates and runs the complete geometry validator
before returning any repaired coordinates. The caller's image, feature and
paper checks remain in place. Iteration counts, time budgets, movement bounds,
fixed controls and symmetry constraints are unchanged.

The [measurements](return-projection-speed.json) compare frozen runtime copies
in serial processes:

| Check | Previous loop | New loop |
| --- | --- | --- |
| 104 geometry probes | 27 accepted repairs | Same decisions and identical serialized accepted geometry |
| Total projection time in those probes | 5.744 s | 4.018 s |
| First fresh anchor repair | Accepted, 2.195 s | Accepted, 1.650 s |
| Second fresh anchor repair | Rejected, 2.961 s | Accepted, 1.717 s |
| Accepted anchor's independent disagreement at 400 px | 0.8750% | 0.87375% in both runs |
| Accepted anchor's independent disagreement at 800 px | 0.9796875% | 0.97703125% in both runs |

The 104 probes cover saved and analytic curves, exact halves and reflection,
and both hidden-only and all-control projection. This is not a 27/104 photograph
reconstruction score: some inputs need no repair, and some cannot be repaired
by this bounded local operation. Projection timing excludes the initial audit
and separate final checks. The approximately 30% reduction is specific to these
probes, not a whole-pipeline or browser speed claim.

Both accepted anchor candidates pass final export, geometry and paper checks.
Their independent SVG renders are checked at the original and doubled source
resolution. The source mask and incoming geometry remain unchanged.

A new negative regression supplies an incomplete initial audit for a slit with
a fixed wrong endpoint. The local return is resolved, but the complete final
validator rejects the remaining endpoint defect. This checks that completing
the faster local loop cannot certify an otherwise illegal template.

The adopted code passes twelve focused geometry tests and the previously
failing anchor application test. The committed diagnostic reproduces all 104
decisions and all 27 accepted geometries:

```sh
node scripts/inverse/diagnostics/return-projection-study.mjs \
  --output=tmp/return-projection-check
```

Use `--runtime=<inverse directory>` for a frozen runtime copy. The output must
be new and stays inside this worktree. It records source hashes, stopping
reasons, geometry identities and timing scope.

The complete QA run on runtime revision `c000d30` passes **853 inverse tests**,
**857 application tests** (one existing skip), type checking, lint and build.
All 845 pinned source files remain unchanged. The inverse suite takes 876.88
seconds; that is test-suite duration, not a solver benchmark.

The fresh Hunodan comparison passes all **22 regular designs within ten
seconds**, maximum **8.100 seconds**. Twenty-one independent mask errors are
exactly unchanged from `99399ff`; the bird improves from 0.8444% to 0.8022%.
The crop catalog, verified photograph bytes/pixels, settings and baseline
criteria are unchanged. These results cover the complete newer runtime,
including its scheduling and HiGHS fixes, not only the local projection change.
They do not establish a whole-pipeline speedup: the previous maximum was
7.915 seconds.

The automatic-photo comparison retains **25/31** with no pass or error
regressions. Seven errors decrease, most substantially the leaf from 2.5625%
to 1.3163%. The remaining changes are below 0.05 percentage points and should
not all be attributed to the projector: this is one timed replay of the complete
new runtime. The original photographs, selected crops and fitting mask/probability
hashes are unchanged. The denominator contains all 31 complete cases, including
two without a crop; fifteen incomplete images and one obscured motif stay
excluded as before. The same six failures remain.

All **47 accepted editable pairs** pass actual SVG conversion, serialization,
reparsing, feature retention and nominal geometry/paper checks. The leaf's
editable disagreement is 1.3106%. Visual comparison covers all seven changed
photograph fits, the Hunodan bird and the leaf's editable render. The leaf's
lower frame improves; uneven contours and faint seams remain in some other
designs. These numerical passes do not establish the original artwork or
physical assembly.

The owned preview at `http://127.0.0.1:5232` has been refreshed, and all 158
checked served assets match the build. All **sixteen main Chromium workflows**
pass. Four additional shifted-star/leaf flows pass with both ordinary and
explicit ten-second worker allowances; their actual downloaded editable SVGs
pass independent 400/800-pixel image and feature checks. The ordinary leaf flow
has 2.5488% disagreement at 400 pixels, versus 1.3156% with the shorter request;
more allowed search time does not yet guarantee a better selected result.
The Viking's click-to-ready time is 29.71 seconds. These results establish
`c000d30` as the latest validated runtime, not a universal browser speed target.

Fresh Draw and Paint contexts load no solver or WASM before an action. Their
initial JavaScript sizes remain 473,483 and 503,384 bytes. All 68 application
asset sizes match the prior build, totaling 1,907,733 bytes; only 31 assets are
byte-identical. SvelteKit's generated build version changes a chunk and its
importers' content-hashed filenames. The original local harness failed because
it required old filenames. The reusable replacement verifies current served
bytes, deferred loading and size comparisons separately:

```sh
PLAYWRIGHT_MODULE=<owned-playwright-module> INVERSE_TEST_URL=http://127.0.0.1:5232 \
  node scripts/inverse/entry-loading-browser-test.mjs --output=tmp/entry-loading \
  --baseline-assets=<previous-served-assets.json> \
  --baseline-loading=<previous-lazy-loading.json>
```

Both baseline arguments are optional together. The first two new-harness
attempts exposed a recorded-URL type error and inclusion of blocked external
analytics in the baseline; these failed records are preserved. The corrected
third replay and ESLint pass. No solver source changed during these checks,
and all 845 pinned source hashes still match. Browser screenshot review covers
the hat, star, Viking and gold angel: their main motifs survive, while the hat
retains small edge nicks and the Viking has frame seams and uneven details.

## Scalar cubic evaluation follow-up (`b73b7f4`)

The shared editor/worker cubic evaluator now avoids temporary axis arrays and
callbacks while retaining arithmetic order. A paired, fixed-work projection of
one captured rejected routing takes 28.6% less time at the median and returns
identical coordinates. This is a local benchmark, not a whole-pipeline speedup.
The [measurements](return-arithmetic-speed.json) retain both favourable and
unfavourable browser outcomes.

For the original Art e Sta artwork, the 30-second browser request improves from
2.14% to 0.945% editable disagreement; its SVG is byte-identical to the earlier
default-budget result. The new default-budget replay instead reaches 1.16125%.
Its routing leaves only 2.287 seconds for repair, versus 4.144 seconds in the
better run. Both start with the same trace and initial refinement checkpoints;
the shorter repair performs 45 steps instead of 160. Repair and routing still
compete for one phase deadline, even when the overall request has time left.

All 22 regular Hunodan browser workflows pass, but only 13 finish within ten
seconds in this run (median 9.607 seconds, maximum 20.626). Four errors increase
slightly. Every source-mask hash matches the previous comparison. Other busy
system processes and browser jobs were observed during this low-priority run;
that is a confounder, not an attribution of every difference to machine load.

Type checking, lint, build, 874 application tests (one skip), 31 focused inverse
tests, both artwork browser flows and four browser smoke cases pass. The full
inverse suite has not yet run for this revision. Its waiting queue was stopped
before launch to investigate the repair-budget variation. The preview on port
5232 remains the previous validated snapshot.
