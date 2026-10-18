# Robust search: complete native comparison

Runtime `6609581` passes all code tests and retains the accepted-template counts,
but two photographic errors increase. It has not passed the strict release
comparison; `c000d30` remains the latest fully validated runtime. Browser checks
pass separately on the owned preview at port 5232.

Full QA passes **861 inverse tests**, **857 application tests** (one existing
skip), explicit core lint, repository lint, type checking and production build.
All 858 pinned source files remain unchanged. Fresh native fitting solves
**22/22 regular Hunodan designs within ten seconds**, maximum **8.113 seconds**,
with every image error unchanged from the validated baseline. Automatic photo
reconstruction remains **25/31** with no lost pass. All **47 accepted editable
SVG pairs** pass conversion, source-feature, editor geometry and paper checks.

Four accepted photo errors decrease: floral checker, gift, gingerbread and maple
leaf. The floral checker improves from 1.940625% to **1.896250%**, recovering the
previous release's regression. The strict comparison nevertheless fails:

| Photograph | Validated baseline | Current independent error |
| --- | ---: | ---: |
| Warped checker | 1.755000% | 1.788750% |
| Viking | 2.024375% | 2.055000% |

The release runner verifies identical source input records, automatically chosen
corners, classified and fitting masks, and fitting probabilities before comparing
errors. These differences occur downstream of cropping and classification.

The warped checker reports the same initial polishing error and primitive
counts, and identical step-zero and step-40 errors. The saved summaries do not
establish that every starting coordinate is identical. The validated baseline reaches step 74; the previous
clearance release reaches 79; this run stops at 64 under its wall-clock deadline.
This localizes a sensitivity to the amount of polishing completed, without
establishing which preceding operation caused the timing difference.

Viking reaches polishing step 84 in all three runs, but starts with different
geometry: 206 curved/one straight piece in the validated baseline, 211/one in the
previous release and 208/two here. The final iteration count therefore does not
explain its regression. Stage-labelled fresh replays are needed to isolate it.

The [evidence record](robust-search-release.json) pins completed QA, native corpus
comparisons and editable-export audits. It records the failed gate rather than
relaxing the error threshold. All **18 main browser workflows** pass, as do the three ordinary-budget and
three explicit ten-second leaf/star flows. All six actual downloaded editable
SVGs pass independent checks at both 400 and 800 pixels. The previously failing
ordinary shifted leaf now has **0.7600% / 0.9525%** disagreement at those scales,
with the finer 700-resolution paper audit passing. Click-to-ready time is
**17.72 seconds**; this is a quality recovery, not a claim of ten-second browser
latency. Its ten-second counterpart scores 0.87875% / 1.05094%.

The ordinary unshifted leaf scores 1.31063% / 1.47953%; the shifted star scores
0.75875% / 0.91656%. Their ten-second counterparts have the same measured scores.
Visual review confirms recognizable star and leaf motifs, but some rounded tips,
boundary nicks and a thin leaf-border seam remain.

Fresh Draw and Paint contexts verify served build bytes and make zero initial
solver/WASM requests. Initial scripts remain 473,483 / 503,384 bytes, and all
application JS/CSS size multisets match the baseline. The separate earlier
four-byte build-identifier failure remains in its original record. All 862
browser/runtime/harness source pins are verified. The native no-higher-error
comparison still fails; browser success does not override those two photographic
regressions. No push or deployment occurred.
