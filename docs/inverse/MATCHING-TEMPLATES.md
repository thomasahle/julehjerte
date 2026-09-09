# Matching templates

The generator prefers an exactly matching template pair when it adds at most
**one percentage point** of disagreement with the original classified crop and
passes the geometry, paper and feature checks. This implements the user's
revised September 8 requirement without adding a pattern-style option.
The default 3% image-fidelity threshold still controls the reported quality
warning; it does not reduce the one-percentage-point matching allowance.

The independent fit runs first. Matching proposals copy either fitted sheet or
average compatible curves. Copying works even when the independently fitted
sheets have different slit counts or curve subdivisions. Exact proposals are
checked before optional refinement, with original-mask scoring. Accepted pairs
share transposed control coordinates. The search remains bounded and does not
prove that all possible matching pairs were considered.

Each disagreeing pair of transposed mask pixels forces at least one error for
identical templates. For the user's earlier `hjhih-01` crop this lower bound is
4.9994%; the original Hunodan photo crop has a 4.5773% bound. Neither can produce
an identical pair within the 3% quality target while retaining those classified
crops. That alone does not rule out the matching preference: the bound must
exceed the independent fit's error plus the allowance to reject matching.

The new 22-case speed replay selected matching pairs for `hjfig-02` and
`hjfig-04`, adding 0.7182 and 0.9557 percentage points of internal mask error.
All 22 passed their checks within 10 seconds on the measured machine. See
[AUTOMATIC-WORKFLOW.md](AUTOMATIC-WORKFLOW.md) and its validation records for
criteria, browser checks and the distinction from the earlier strict
no-error-increase speed target.

Candidate views and exports remain available when quality checks fail; they
include a review notice. Passing checks and export availability are separate
report fields. The available candidate is not necessarily an identical pair.

## Fidelity-warning correction — September 10

Normal final selection previously used
`min(maxImageError, baselineError + matchingErrorAllowance)`. This mistakenly
made a quality-warning threshold part of the preference rule. A controlled
valid pair at **2.75%** disagreement rejected an exactly matching pair at
**3.45875%**, although its additional error was only **0.70875 percentage points**.
The diagonal lower-bound check rejected it before checking the available pair.

Normal selection and retained-checkpoint selection now share one limit:
`min(1, baselineError + matchingErrorAllowance)`. The original mask, weights,
geometry, paper and feature checks are unchanged. Matching results over the
image threshold retain their actual error, fidelity warning and available
exports. Tests also cover an independent fit already above 3% (3.5% becomes
4.1975%), a stricter custom warning threshold, and rejection when the additional
error exceeds the preference allowance.

The regression independently renders the exported curves. The browser policy
replay compares normal selection with early stopping using analytic valid
pairs and original binary masks; it tests final selection, not fresh fitting.
Fresh dataset and Paint workflows are checked separately.

```sh
node --test scripts/inverse/automatic.test.mjs scripts/inverse/stopped.test.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs INVERSE_TEST_URL=http://127.0.0.1:5232 node scripts/inverse/matching-policy-browser-test.mjs
```

The correction is committed in `92aba16`, with the browser policy replay in
`10fb45c`. All **1,074 tests** pass (783 application, 291 engine; one optional
fixture-recording test skipped), along with lint, the production build and
Svelte checking with zero errors and seven existing warnings.

All **12 browser policy cases** pass across Chromium, Firefox and WebKit. Normal
selection and early stopping produce the same exported geometry and independently
rendered error for each controlled case. Another **24 full Paint workflows** pass:
18 completed searches and six early-stop searches, including exact shared spans,
SVG export and the star's PDF. All retain the previous release's geometry and
image error. The 57 served core/worker files match the checked source bytes.

The full dataset replay includes checkpoint retention. All **22 Hunodan** and
**32 free-border** cases pass with byte-identical geometry to the graceful-stop
release. Their median/maximum Node times are **4.95/8.04 seconds** and
**4.51/7.60 seconds**, respectively. The ordinary dataset keeps its existing
quality limits; the over-threshold policy cases are separate controlled tests.
[MATCHING-ALLOWANCE-VALIDATION.json](MATCHING-ALLOWANCE-VALIDATION.json) records
the measurements, source hashes and raw artifact hashes. No push or deployment
was made; the preview is <http://127.0.0.1:5232/en/editor/paint/>.
