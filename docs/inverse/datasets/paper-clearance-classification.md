# Faster paper classification with unchanged checked masks

Commit `9195d1d` avoids computing a full point-to-cut distance when the paper audit only needs to know which of two clearance thresholds it exceeds. The image objective, optimizer, iteration limits, deadlines, checkpoints, geometry constraints and paper thresholds are unchanged. The [machine-readable evidence](paper-clearance-classification.json) compares it with `3b3f58a`.

## What the profile showed

A baseline CPU profile of a fresh ten-second vertical-crop fit found roughly **2.3 seconds of checkpoint work in the first 3.1-second refinement**. About **1.5 seconds of that checkpoint work** was the guarded paper audit. This profile located the cost; it is not used as an unprofiled timing benchmark.

Near either paper-core threshold, the audit refines its approximate distance field using the actual cut chords. It previously evaluated `Math.hypot` for each queried chord and retained the minimum distance, although only the two threshold comparisons enter the output masks.

The new helper compares squared distances with the squared thresholds and returns the two membership bits. A conservative floating-point comparison band retains the original `Math.hypot` evaluation near either threshold, including ties. Negative lower guards and extreme or subnormal scales keep that evaluation when necessary. The original projection arithmetic and strict comparisons are preserved. The result is combined across the same nearby chords and the same capsule outline.

Every changed candidate is still audited. No paper decision or fitted distance field is cached, and no checkpoint is skipped.

## Independent reference and numerical checks

The benchmark now loads the historical chord helper together with the historical material audit, so the reference cannot silently use the optimized helper. Other reference dependencies must still match their recorded revision. Comparisons include every map pixel, component count, area, fold interval, clearance and strict verdict; only elapsed time is excluded.

All **72 fixed-geometry cases** match exactly across three alternating-order rounds. They include controlled pass/fail/uncertain fixtures through resolution 700, the matching hat, a dense photographic proposal at 360 and 700, 22 Hunodan designs and 32 weighted/free-border cases. Saved templates are inputs to this validator benchmark only; they never initialize the fresh fitter.

The median paired saving across complete paper audits is **12.31%**. The Hunodan audit group saves **21.82%** at its median, while gains vary by geometry and resolution. These figures cover whole audits, including mask construction and component labeling, not just the distance helper.

Regression tests compare 150,000 threshold queries with the original distance calculation, including exact and nearby ties, tiny and enormous scales, endpoints and degenerate chords. Additional cases cover negative lower guards and infinite limits. Complete historical-map and native/JavaScript tests also pass. This is numerical regression evidence, not a formal equivalence proof for every floating-point input.

## Fresh fits within the existing budget

All three fresh ten-second vertical-crop runs pass:

| Cold process | Fit, validation and export | Independent disagreement | Template checks |
| --- | ---: | ---: | --- |
| 1 | 9.350 s | 2.71% | Pass |
| 2 | 9.425 s | 2.76% | Pass |
| 3 | 9.359 s | 2.62% | Pass |

The previous version passed two of these three runs. Each run rebuilds the mask from the original photograph and the same one-pixel crop translation; all crop coordinates and source hashes match the baseline. The timer here starts after that preparation, isolating the fitter and export. A saved template is not supplied.

In the matched control replay, local detail completed **65 steps instead of 45**, and source-resolution independent disagreement fell from **2.91% to 2.62%**. The search uses the time saved in paper checks for further refinement. Three successful repeats are not a universal ten-second guarantee across hardware, input perturbations or browser overhead.

The original and horizontal-shift controls also pass. With a thirty-second allowance the vertical variant measures **2.35%** in **27.337 s**. Per-case eye shape, feature retention and 400/800-pixel independent exports are retained in the report; improved whole-image error does not establish uniformly better small-feature shape.

All **22/22 regular Hunodan designs** pass the existing prepare/solve/validate/export benchmark with **exactly unchanged independent image errors**. The slowest takes **8.906 s**. Their total measured solve time drops from **131.056 s to 120.319 s**, with a median paired reduction of **6.22%**. Image decoding and external replay are timed separately by that benchmark.

The complete-photo benchmark remains **24/31**, with unchanged outcomes, automatic crop coordinates, source masks and probability hashes. The timed fits do not produce identical curves: twelve cases have lower disagreement and the gingerbread case rises from 1.56% to 1.65%. Faster validation does not resolve the remaining crop and routing failures by itself.

## Application and browser verification

Type checking, lint, all **855 application tests** with one existing skip, all **714 inverse tests**, and the production build pass. The five actual Chromium flows pass worker, source-feature, editable SVG, geometry, strict paper, shared-cut and applicable PDF checks with unchanged input/settings:

| Browser case | Previous click to ready | Current click to ready | Previous editable disagreement | Current editable disagreement |
| --- | ---: | ---: | ---: | ---: |
| bird-y-shift-mask | 28.563 s | 28.596 s | 2.20% | 2.39% |
| bird-shift-mask | 14.491 s | 14.481 s | 2.54% | 2.54% |
| bird-mask | 12.878 s | 12.428 s | 2.52% | 2.52% |
| star | 2.033 s | 2.034 s | 0.16% | 0.16% |
| top-hat-preferred | 8.004 s | 7.935 s | 0.41% | 0.41% |

The browser replay uses the ordinary longer allowance; it is not a ten-second browser claim. Its vertical-shift bird has higher disagreement than the previous run, despite the improvement in the separate ten-second replays. These measurements do not show uniform image-error improvements. The rebuilt preview's entry modules respond successfully and its served material and distance-helper bytes match the tested sources. It remains at `http://127.0.0.1:5232/`.

Raw profiles, measurements, exports and logs are under `tmp/heart-learning/penalty-profile-v1/`. Agreement is measured against classified photographs, not unavailable original cutting geometry. No physical assembly has been tested. Changes are committed locally; nothing was pushed or deployed.
