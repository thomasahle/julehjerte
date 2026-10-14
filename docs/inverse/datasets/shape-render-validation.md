# Remove font discovery from shape-only rendering checks

Full application QA stopped on the `plus` weave-rendering test after 7.16
seconds, exceeding its unchanged five-second limit. The same 42-test file
passed in isolation, taking 24.47 seconds of test time. The rendering code and
catalogue were unchanged by the fitter work.

Both affected helpers construct SVGs containing only a rectangle and a path,
but each Resvg instance was loading installed system fonts. The independent
export renderer and clipping tests already disable that work. The paint and
conversion-fidelity helpers now do the same, without changing their SVGs,
resolutions, assertions or timeouts.

A paired replay checks all 38 catalogue designs, both weave phases, and both
joined and separate paths: **152 SVG pairs have byte-identical RGBA output**.
Alternating measurement order, total constructor/render time is **21.083 s**
with system fonts and **0.063 s** without. This is local test-renderer timing,
not a browser or solver speed claim.

The two changed files pass all **46 tests** in 2.17 seconds wall time (1.29
seconds reported test time). Full repository validation is pending. The
[evidence record](shape-render-validation.json) preserves the original timeout,
isolated replay, input/output hashes and per-render timings. No application
code or font-bearing SVG exporter changes.
