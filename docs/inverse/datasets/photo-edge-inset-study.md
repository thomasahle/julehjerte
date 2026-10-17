# Photo-edge fringe and new window-heart cases

2026-10-17 diagnostic on unchanged production runtime `b7daccc`.
[Measurements](photo-edge-inset-study.json) and
[committed input photographs](../../../scripts/inverse/fixtures/user-photos-2026-10-17/README.md)
retain failures alongside successes. No neural model or new inset policy is
enabled in the website.

## The reported fringe

The user's exact 650 × 652 screenshot reproduces the thin white fringe in the
classified mask. It is not an outline drawn by the preview. The locator fits
the photographed paper boundary; preprocessing samples that entire quadrilateral
without an inward margin, so blurred background and small outline errors enter
the two-color target. Inset profiles already protect cut-count proposals, but
the image objective still asks the fitter to reproduce the fringe.

All four fresh treatments produced legal exported geometry and passed the
nominal paper checks. Results from the reusable diagnostic:

| Treatment | Cuts per sheet | Error against its own target | Same original interior¹ | Solve/check/export² |
| --- | --- | --- | --- | --- |
| Original crop | 5 | 0.677% | 0.338% | 9.74 s |
| 0.5% inset on each side | 5 | 0.506% | 0.666% | 7.49 s |
| 1% inset on each side | 5 | 0.296% | 0.398% | 7.16 s |
| Ignore outer 2% while fitting | 6 | 0.914% | 0.779% | 9.81 s |

¹ Fixed central 94% × 94% region of the original classified photograph. Each
export is independently rendered at 1600 pixels and mapped through photograph
coordinates. This is a common comparison domain, not original artwork or known
cutting paths. Errors against different cropped targets are not comparable.

² Ten-second search allowance; includes final checks and generated exports,
excludes cropping, preparation, independent replay and browser conversion.
These individual timing observations do not establish a causal speedup.

A 1% inset removes the visible fringe. In separate one-pixel horizontal and
vertical shifts and a 0.5% outward expansion, it improves common-interior error
in all three comparisons, retaining five cuts in each sheet. On the unperturbed
input that metric slightly worsens. Ignoring the border instead selects an
unnecessary extra cut. These results support testing a small evidence-based
inset, not silently changing every crop yet. Neither the existing 22-Hunodan
nor 31-photo release result has been rerun with an inset policy.

The earlier exact-file baseline, 0.5% inset and 1% inset also pass editable
conversion, SVG round-trip, editor intersections and independent paper checks.
They are distinct time-bounded solves, explicitly identified in the record.

## The three hearts in the new photograph

- **Blue/orange:** automatic cropping finds no candidate. The failure reports
  insufficient evidence for both lower paper edges. Approximate photo-only
  corner review lets the downstream solver and editable replay pass, at 1.76%
  disagreement, with unequal 2+4 cuts and visible residual border defects.
- **Orange/white:** the automatic crop extends over the hand. Although its
  template passes mask/geometry checks, visual review rejects that as a faithful
  photo reconstruction. A reviewed crop removes that large error, but fitting
  still loses two classified white regions and fails feature retention. Thus
  cropping alone does not resolve this case. The photograph has curled paper,
  shading and physical gaps; those are not verified intended design features.
- **Lower red/white:** a plausible automatic crop and editable pair pass at
  1.00% disagreement. Some checker edges remain rounded and a thin photographed
  seam remains. There is no verified reference cutting path.

Automatic and reviewed-corner results stay separate. In particular, two formal
mask-check passes do not mean two successful automatic photo reconstructions.
The manually reviewed coordinates diagnose the pipeline and are not training
labels or ground truth.

## Reproduce

```sh
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1 \
  nice -n 15 node scripts/inverse/diagnostics/photo-edge-inset-study.mjs \
  --catalog=scripts/inverse/fixtures/user-photos-2026-10-17/stacked.json \
  --id=stacked-heart-fringe --seconds=10 --output=tmp/photo-edge-new-run
```

Add `--perturb=true` for the original, one-pixel x/y shifts and outward-expansion
comparison, each with and without a 1% inset. Output directories must be new.
The script checks source identities, pins runtime files, fixes corners before
solving and uses a common physical region when scoring different crops. Failed
solves are recorded rather than dropped. The five catalogue/handoff tests pass;
the previous full release checks cover the unchanged production source.
