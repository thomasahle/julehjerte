`hunodan-flag-screenshot.png` is the user's unchanged screenshot supplied on
2026-09-08 at 11:33:55, showing the photograph from Hunodan's `hjfla-01` design.
The original artwork credit is recorded in `../hunodan/sources.json`.

The browser regression uploads this file and the complete `hjsta-05.jpg`
photograph/reference image. For the latter, the test follows the UI's request
to select one heart with a rough rectangle. Corners are then found by the locator;
neither the frozen benchmark crop nor reference cutting paths enter the fit.
It tests uploading after the star example and explicitly choosing the strict
matching-grid preset, then validates the downloaded templates independently.
