# Solver and redesigned Paint integration

`codex/solver-initialization` includes `redesign` through `456e628`, merged in
`c10e093`. It retains the complete solver tree from `d318e34`. The main and
redesign checkouts have not been modified, and nothing was pushed or deployed.
This branch is ready for the agent responsible for integrating and publishing.

The merge preserves the weighted free-border objective, native binary-mask
preparation, exact shared-cut recovery after matching, shared-run simplification,
and the independent geometry and mask checks on editable exports. Copying one
cleanup module would not reproduce this behavior; the common finalizer and the
Paint-to-worker bridge are part of the fix.

The incoming interface adds compact paint controls, draggable frame handles,
accessible panel explanations and live fitting progress. Two conflicts required
care: Paint must continue passing the original mask and protected-region weights,
and the paper-colour controls must retain the function binding that prevents a
repeated click from clearing the selected radio. Tests for the result panel were
updated to the weighted report contract rather than its removed frame prop.

Progress now carries full worker events. Its displayed strip counts are corrected
in `fe35ddf`: the worker reports cuts, so three cuts must read as four paper strips.
The reducer retains raw counts for attempt identity. Both languages, both progress
displays and an unequal-count fixture are checked. Live error remains approximate;
the final result reports disagreement measured on the converted heart.

The newer UI also describes optional future geometry previews and graceful
stopping. Those engine hooks remain dormant. Cancel still terminates the worker;
the QA replay explicitly checks that a new search succeeds afterward.

## Verification

All **1,041 tests** pass: 778 application tests and 263 engine tests. One optional
fixture-recording test is skipped. Svelte checking has zero errors and seven
existing warnings; lint and the production build pass.

`scripts/paint/search-progress-browser-test.mjs` exercises real worker progress
on desktop (1440 × 950) and phone (390 × 844). It imports a fresh hat, operates a
panel explanation by keyboard, drags the protected-region handle, checks required
radios, cancels a running fit, and solves again. It checks visible strip counts
against worker events, protected-region weights, geometry and paper validation,
horizontal overflow and page errors. Both viewports pass. The initial harness
attempt stopped at an ambiguous import-button selector, before fitting; using
the existing page's first import action resolves that test-selector issue.

The separate export replay covers matching, independent and Anti-mode hats,
the star, a Hunodan photo and a circle in Chromium, Firefox and WebKit. It checks
shared control points after conversion, the editor's own geometry rules, source
mask disagreement, SVG export and the star's PDF export. A further Anti-hat
replay blocks the numerical Wasm kernel to exercise JavaScript fallback.
All **18 export workflows and the fallback replay pass**. All 18 measured source
errors and exported engine geometries are unchanged from the previous browser
release; the latter match byte for byte. Each browser's matching,
independent and Anti hats retain 41, 30 and 39 shared spans respectively, with
0.3206%, 0.2958% and 0.3189% protected-motif disagreement. The blocked-Wasm hat
retains 39 shared spans and 0.3189% disagreement as well.

The 22-Hunodan and 32-free-border Node release benchmarks are the previous
[curve-penalty validation](CURVE-PENALTY.md), not new runs attributed to this
UI merge. Every engine file is unchanged from that release. The production
preview's 52 engine files also match the committed source byte for byte.

Per-case results and source checks are recorded in
[REDESIGN-INTEGRATION-VALIDATION.json](REDESIGN-INTEGRATION-VALIDATION.json).
Raw artifacts are under `tmp/redesign-integration-{controls,browser,fallback}`;
check logs use the same `tmp/redesign-integration-` prefix.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
INVERSE_TEST_URL=http://127.0.0.1:5232 \
node scripts/paint/search-progress-browser-test.mjs

PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
INVERSE_TEST_URL=http://127.0.0.1:5232 \
INVERSE_TEST_CASES=top-hat,top-hat-independent,top-hat-anti,star,hunodan,circle \
node scripts/inverse/paint-browser-test.mjs
```

Restart the preview after building: an already-running preview can retain old
HTML asset names after those files have been replaced. The checked preview is
<http://127.0.0.1:5232/en/editor/paint/>.
