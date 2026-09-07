# Licenses and attribution

This handoff contains multiple separately attributed materials; it is not a blanket relicensing of the package.

- The delivered JavaScript application retains `javascript/LICENSE` and `javascript/THIRD_PARTY_NOTICES.md`.
- The vendored optimizer retains `javascript/site/vendor/HIGHS-LICENSE.txt` and its recorded binary/source provenance.
- The Python reference retains `python-reference/LICENSE`; older archives retain their own notices.
- The included upstream reference files are copied from the pinned `thomasahle/julehjerte` repository. Its matching full LICENSE is in `upstream/reference-files/LICENSE`. Its README/license-label discrepancy is flagged in the integration notes; nothing was relicensed here.
- User-supplied screenshots and example artwork retain their original attribution and rights. Supplying or tracing an image does not assign it the generated software's license.
- Newly written handoff instructions and helper scripts may be used and modified as part of this project. They do not replace any source or artwork notices.

No font files, private keys, access tokens or production credentials were intentionally included. Run the project's normal security and dependency review before deployment; file hashes alone are not a security audit.

## Photographic recrop addendum

`static/inverse/core/unmix.js` ports the empirical colour-mixture operation and palette estimation from the user-supplied `heart_recrop_reconstruction.zip`, specifically `heart_recrop_study/code/unmix.py`, `targets.py` and `calibrate.py`. The archive describes these workbench experiments as created for this conversation and retains the earlier numerical geometry and cropper notices. The original archive and photograph remain local benchmark inputs; no new rights in the pictured designs are asserted. Source hashes and port/replay validation are recorded in `PHOTO-RECROPS-VALIDATION.json`.

`static/inverse/core/direct/` additionally ports the direct B-spline initializer, boundary-motion gradient, free Bézier refinement and shared-cut operations from `calibrated_direct_fit.py`, `curve_graph.py`, `boundary_loss.py`, `fit_camera.py`, `camera_weld.py` and `weld_geometry.py` in the same archive. The browser implementation uses JavaScript numerical routines and the site's geometry/paper audits; it does not redistribute or run PyTorch. `DIRECT-FITTER.md` and `DIRECT-FITTER-VALIDATION.json` describe the differences, source hashes and measured results.

## Coloured-photo locator addendum

`static/inverse/locator/palette.js` is a local extension to the supplied motif locator. The adaptive path in `locator.js` adds palette inference on a plain background, independent lobe depths and support-aware candidate selection. It retains the supplied projective geometry and numerical optimizer, their original notice and recorded source hashes. The new QA scripts use locally retained photographs as test inputs and do not publish those photographs as website assets. See `GENERATOR-QA.md` and `GENERATOR-QA-VALIDATION.json`.
