# Hunodan upload and preset recovery

The two reported Hunodan failures on 2026-09-08 came from the strict
**Straight motif · matching sheets** preset. It rejects a crop when more than
1% of classified pixels differ across its diagonal, before starting the MILP.
The direct fitter's **Prefer matching templates** option is a separate, soft
preference and does not reject asymmetric images.

Trying the star example selected the strict preset, and uploading another image
previously retained it. The 22-case benchmark explicitly selected direct fitting
and used photograph-only inputs, so it did not cover this interaction.

## Change

- New raster uploads select direct fitting. SVG uploads select general tracing;
  examples select their own presets. Physical settings and colour choices persist.
- Explicitly choosing the strict grid for an asymmetric crop now switches to
  direct fitting during preparation, with a visible explanation. It retries the
  same uploaded pixels and accepted corners, then lets the user inspect the mask.
- A stable error code identifies this one recoverable failure across the worker
  boundary. Other preparation failures are still reported normally.
- The strict grid remains available for symmetric artwork, including the star
  example. No solver, fidelity threshold or geometry constraint was weakened.

## Browser verification

The regression uses the user's exact flag screenshot and the complete Hunodan
`hjsta-05.jpg` image. Each browser tries the star example, uploads a photograph,
checks the new default, then explicitly chooses the strict grid and verifies
automatic recovery. It downloads the resulting ZIP and independently renders
its exported curves against the original classified crop. Original-mask and
difference views remain available.

| Browser | Flag screenshot disagreement | Blue stars disagreement |
| --- | ---: | ---: |
| Chromium | 1.233% | 1.119% |
| Firefox | 1.943% | 1.386% |
| WebKit | 1.247% | 1.304% |

All six reconstructions pass geometry, paper-core, image-fidelity and substantial
feature checks. These percentages measure the classified photograph, not exact
agreement with published cutting paths. The flag reference itself has different
left and right templates. For its fixed photographed crop, identical templates
would incur at least about 25% image error.

The full blue-star source includes a printed cutting diagram beside the photo.
The initial QA run incorrectly expected four corners without a region selection;
all three browsers instead requested a rough rectangle around one heart. The
completed run follows that visible selection workflow, then uses the locator's
corners without manual adjustment. Both attempts are recorded in
[PRESET-RECOVERY-VALIDATION.json](PRESET-RECOVERY-VALIDATION.json).

These uploads and crops differ from the frozen release benchmark. Their errors
and internal fitting times must not be substituted for that benchmark's
per-design error and end-to-end 10-second criteria.

Validation: 260 automated tests pass (132 Vitest and 128 inverse tests), including
the unchanged star/reference reconstruction test. Type checking has zero errors
and eight existing warnings; lint and the production build pass.
The existing example browser suite also passes all 22 checks across Chromium
and Firefox, including recovery, cancellation, mobile layout and Danish text.
Its evidence is in `tmp/inverse-browser/2026-09-08T09-41-39-157Z-examples/`.

Replay the browser regression against a running production preview:

```sh
INVERSE_TEST_URL=http://127.0.0.1:4174 \
  node scripts/inverse/preset-recovery-browser-test.mjs
```

Set `PLAYWRIGHT_MODULE` if Playwright is installed outside the repository.
