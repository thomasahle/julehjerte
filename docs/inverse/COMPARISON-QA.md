# Original artwork and result comparison

After a fresh image or SVG solve, the generator keeps the prepared original mask and, for traced inputs, its original paths available beside the result previews. Compare offers a difference map, a blend slider, and an optional path overlay. Direct fitting keeps the mask and comparison without inventing traced paths. Loading saved templates has no source-image comparison.

The solver returns the exact sampled woven mask used for the image-error calculation. The comparison reuses those pixels and excludes the same unobserved pixels. It does not realign the source or change the export acceptance threshold. Magenta marks colour present only in the original; teal marks colour present only in the weave. The original means the classified, rectified input, not the unrectified photograph.

Validation on 2026-09-07:

- 240 unit/inverse tests passed; the border-repair regression also verifies the returned mask against the reported mismatch count.
- Type checking and production build passed (eight existing accessibility warnings elsewhere).
- 21 real production-browser checks passed across Chromium, Firefox, and WebKit. These cover original state preservation, every highlighted pixel, blend endpoints, path alignment, mobile layout, downloads, new-upload invalidation, direct fitting, saved templates, and Danish SVG input.
- Each browser highlighted exactly 3,095 of 129,600 pixels, matching the solver report. No page errors occurred.
- The first browser run uncovered an unnamed blend slider: the enclosing label associated with an output element. An explicit input/label association fixed it before the successful replay.

Reproduce with `npm run test:inverse:comparison:browser` against the production preview at port 4174. Local screenshots and logs are under `tmp/inverse-browser/2026-09-07T21-20-32-892Z-comparison/`; structured results are retained beside this document.
