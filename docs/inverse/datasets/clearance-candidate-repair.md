# A useful clearance candidate can need curve repair

A follow-up to the [comparison-window study](clearance-window.md) uses the
existing 0.005-per-cut preference when reserving a simpler finalist. It keeps
three slots, the best coarse seed and any opposing-border reservation. Six
fixed masks receive two fresh ten-second solves per policy, with reversed
policy order on the second repeat: **36 runs** in total.

The unchanged policy and the shortlist-only variant each pass four of six
cases in both repeats. Combining the shortlist and 3.0-second comparison window
passes five of six in both repeats. On the right-shifted leaf, the shortlist
change improves 400-pixel disagreement from **1.78875% to 1.23375%** and native
preparation/solving from about 9.48 seconds to 6.10–6.14 seconds. The downward
shift is recovered by the comparison window. These are repeated development
results, not a new global photographic success rate.

The upward shift still fails. The broader shortlist now includes the useful
3-by-3 candidate, but its actual prepared curves have a **1.073 mm inter-slit
clearance**, below the unchanged **1.5 mm** limit. Rejecting it as a finished
template is correct. Rejecting it as an initialization for the common curve
fitter may discard useful work.

## Standalone repair evidence

The rejected geometry was captured from the actual fresh run. Each diagnostic
starts again from that same invalid candidate and uses the existing Bézier
refiner, original mask and original acceptance thresholds.

| Requested refinement window | Actual refinement | Independent error, 400 px | Minimum inter-slit clearance |
| --- | ---: | ---: | ---: |
| 0.5 s | 0.714 s | 1.3519% | 2.904 mm |
| 1.5 s | 1.570 s | 0.9950% | 3.141 mm |
| 2.5 s | 2.297 s | 0.9450% | 3.162 mm |

The requested windows are checkpoint deadlines, not hard wall-time caps.
All three repairs pass final geometry and independent 400/800-pixel image and
feature checks. Paper verification is initially uncertain at resolution 360;
the existing finer audit at 700 passes all three, taking another 0.15–0.21
seconds in the reproduced run. No uncertain result is treated as accepted.

The first local run and the reproduced run are both preserved. Inspection of
the short and medium repairs shows a much closer leaf silhouette, with faint
connector seams and some uneven borders remaining. These are native exported
curves, without a browser editable-conversion check or physical assembly test.

The reproducible diagnostic is:

```sh
node scripts/inverse/diagnostics/clearance-refinement-study.mjs \
  --measurement=<captured-result.json> --prepared=<recorded-prepared.json> \
  --runtime=<isolated-inverse-directory> --output=<new-directory>
```

It verifies the source-mask hash, exact recorded input, runtime and generated
output geometry, refuses to overwrite an output directory, and retains both
the initial and finer paper audits. Its ESLint check and all three actual
replays pass. The [evidence record](clearance-candidate-repair.json) pins all
36 fresh results and the subsequent diagnostic outputs.

This establishes that the existing refiner can repair this rejected seed. It
does **not** establish a fresh end-to-end solve below ten seconds. The next
change should reserve a bounded repair attempt for a promising alternative,
carry its finer verified paper resolution forward, retain the existing
candidates and keep every final acceptance gate. No scheduling variant or
repair policy in this study has been integrated into the app yet.
