# Reported crop and example bugs — 2026-09-07

The photo rectifier rejected counterclockwise selections even though preprocessing already accepted them. Rectification now accepts either convex perimeter direction and retains the supplied image orientation. Tests compare asymmetric perspective crops against the independent preprocessing implementation for both directions and all four starting corners. Crossed, concave and degenerate crops remain invalid. The supplied yellow-star PNG previews and prepares successfully in Chromium and Firefox with top/left/bottom/right corners.

Example buttons previously only loaded the file and left the empty preview visible. Waves now prepares its editable preview immediately. Star and JUL immediately perform saved-template checks, retaining the explicit saved-template labels. Selecting an example clears the previous upload/error state and file control. Failed requests clear old downloads and can be retried. On mobile, the preview scrolls into view. Example controls are unavailable before the page is ready.

All 199 automated tests pass. Type checking reports zero errors and the eight pre-existing PaperHeart accessibility warnings; lint and the static build pass. The production HTTP tests pass 32 workflow checks in each of Chromium and Firefox (64 total): 13 existing regression workflows, 11 example workflows and eight locator workflows. The example suite now checks a single click, without supplying an extra Prepare or Check click that previously concealed the missing feedback.

The expanded coverage includes each example on a fresh page and after an uploaded image with an invalid crop, recovery from rejected uploads and failed example requests, cancellation/restart, both crop directions, the user's yellow-star image, the collage, mobile visibility, Danish labels, real Worker/WASM solves, and downloads.

Evidence:

- `tmp/inverse-browser/2026-09-07T13-57-57-422Z/results.json`
- `tmp/inverse-browser/2026-09-07T13-57-57-422Z-examples/results.json`
- `tmp/inverse-browser/2026-09-07T13-57-57-422Z-locator/results.json`

Each directory retains screenshots and failures are retained in earlier timestamped runs. `VALIDATION.json` records current hashes and detailed checks. These fixes do not change the numerical reconstruction success rate documented in `LOCATOR.md`.
