# Known-valid hearts separate border noise from crop uncertainty

This development diagnostic generates six predetermined cutting designs and
validates them before fitting. Five pass geometry and paper checks: a lattice,
shared lattice, channel, frame and radial motif. The corner-lattice candidate
fails self-clearance and remains recorded as an invalid source; it is not
silently replaced or counted as a reconstruction failure.

Each valid reference is independently rendered at 400 pixels. The preprocessing
probe tests the clean image, isolated edge pixels, shallow paired patches and
two narrow fringes. The last variant flips two 2 mm-wide, 7 mm-deep rectangles
on perpendicular edges of a 100 mm square: **0.28% of its pixels change**.
Perturbations do not use cutting paths. Only pixels enter the reconstruction;
source cuts are used to validate and score the reference.

## What the end-to-end check changed about the diagnosis

The ordinary 3 mm border fallback gives inconsistent endpoint counts on all
five narrow-fringe inputs. Joint profiles restore the reference slit counts.
But **the complete existing fitter already recovers all five**, via its grid
fallback, in 2.45–6.72 seconds. Adding the joint profiles late in feature
recovery makes no difference to the exported outputs. An endpoint-only test
would therefore overstate the improvement.

Trying joint profiles in the early topology initializer speeds up two cases,
but creates visible notches: extruding one profile across a short band leaves
the inward end of the noise behind. Independently fitting every inward row
reduces that problem but still permits abrupt transitions between rows.

The new offline `proposeSmoothBoundaryProfiles` starts at the inside of an
8 mm band and works outward. A soft continuity cost discourages each inferred
transition from jumping away from the previous row. The current weight of 100
was chosen during these development experiments; it is not a validated
photographic default. The band is capped at eight percent of the square and
eight millimeters. Input pixels and the entire fitting reference stay unchanged.

## Full fitting and export results

These are native solve/validation/export timings from one run per variant,
with the same ten-second solver allowance. They exclude input preparation and
independent rescoring. Startup is not isolated, and no repeated latency claim
or browser speed claim follows from them.

| Noisy design | Existing fitter | Smooth-row proposal | Existing error against clean reference | Proposal error against clean reference |
| --- | ---: | ---: | ---: | ---: |
| Lattice, 6+5 cuts | 6.72 s | 2.15 s | 0.0875% | 0.0925% |
| Shared lattice, 5+1 cuts | 3.63 s | 1.40 s | 0.0050% | 0% |
| Channel, 1+1 cuts | 2.45 s | 1.03 s | 0.0019% | 0% |
| Frame, 2+2 cuts | 3.56 s | 1.04 s | 0% | 0% |
| Radial motif, 2+2 cuts | 3.55 s | 1.57 s | 0.0344% | 0.0913% |

All ten clean/noisy cases pass native checks with both the existing fitter and
the smooth-row experiment. Original slit counts survive. Four of the five
experimental noisy cases reproduce their clean-input run's **exact control
coordinates, path memberships and rendered pixels**. The lattice remains
perturbation-sensitive. Errors against the actual noisy inputs are retained
separately in the record; they are not replaced by the clean-reference scores.

All twenty baseline/experimental pairs also pass production editable conversion,
SVG round-trip, editor intersection rules, original-source features, nominal
geometry and paper checks. Conversion is not numerically identical: for example,
the noisy channel's source error changes from 0.2800% to 0.3638% after conversion.
All five reference/input/baseline/experimental/editable comparison panels were
inspected. The smooth variant removes the obvious false notches in the shared
lattice and frame. Slight border displacement remains in the dense lattice,
and the radial motif retains small contour irregularities.

This is encouraging speed and stability evidence, **not a uniformly better
reconstruction result**. The lattice and radial reference errors are slightly
higher. Neither the new initializer nor its experimental early-fitter integration
has been added to the website, tested across the fixed 31 photographs, or trained
as a neural model. The automatic-photo benchmark remains 25/31.

## Verification and reproduction record

Six focused tests pass, including exhaustive DP comparisons and the prior Santa
regression. New tests check paired fringes at 128/256/400 pixels in four rotations
and both paper phases, preserve slanted cuts, enforce the edit-band bounds and
leave interior/source pixels unchanged. The committed smooth helper reproduces
all sixty proposal masks from the frozen prototype exactly. Its metadata records
the actual outer transitions separately from the initial averaged-profile ones.

The [frozen diagnostic record](controlled-border-perturbations.json) includes
all fifty native attempts across baseline and four development variants, twenty
editable replays, rejected source geometry and source/artifact hashes. Local
scripts and outputs are under `tmp/heart-learning/border-perturbation-v1/`.
The subsequent [completed full QA](controlled-border-qa.json) passes **807
inverse tests**, **855 application tests** with one existing skip, type checking,
lint and build. The preview was refreshed on port 5232 and all 153 served assets
match the build. Application/static source hashes still match the prior three
passing Chromium flows; those browser flows were not rerun for this offline
change. The original diagnostic record preserves its earlier pending-QA status.

Next steps are additional fringe positions and real-photograph comparisons,
including checking whether the wider proposal band damages legitimate near-edge
motifs. Promotion must preserve the current image/feature/geometry checks and
the Hunodan timing/error results. No files have been pushed or deployed.
