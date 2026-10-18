# Joint border proposals: balanced endpoints are not a recovered template

The offline initializer in `scripts/inverse/border-profile-proposals.mjs`
fits the four near-edge color profiles jointly. A dynamic program finds
alternating color runs with a minimum physical width, including the two outer
margins. Opposite sides share transition counts and all four corner colors
agree. It ranks at most eight provisional masks and changes only a band up to
3 mm wide. Neither the input mask nor its interior is overwritten.

This addresses a limitation of the current single-edge fallback: it cannot
repair two inconsistent opposite-edge pairs at once. The implementation is
**not imported by the website**. Balanced endpoints are a necessary condition,
not evidence of legal cuts or good image reconstruction.

## Santa diagnostic

The source is the same historical approximate crop as the
[six-failure investigation](remaining-photo-failures.md). These coordinates are
not verified ground truth. Physical settings remain a 100 mm overlap square,
2 mm minimum strip width, 0.25 mm cutting error and 0.2% shrinkage, giving a
2.50501 mm nominal spacing requirement.

An initial two-edge extension probe tried 100 integer-radius combinations;
none balanced the endpoints. A half-millimeter probe tried 324 combinations.
Two balanced, but changed over 5.5% of the source and still failed spacing.

The joint-profile prototype produced 32 balanced traces across four profile
settings. The narrowest proposals changed only 0.21–0.29% of the mask, but their
traces disagreed with the source by 2.42–2.57%. They still entered forbidden
corner margins. Wider proposals reduced that particular problem, but did not
produce a cutting pair. The committed regression verifies that its eight
default proposals balance endpoints and **still fail the margin check**.

Further experiments retained their failures:

| Intervention | Outcome |
| --- | --- |
| Exact subdivision of margin-spanning curves | Some whole-curve margin rejections disappear; other margin and self-intersection failures remain. |
| Mixed straight/cubic tracing plus subdivision | Reaches HiGHS, but the tested candidate graphs exhaust without a valid route. |
| Slanted guides joining opposite endpoints | Three ordinary graphs exceed the candidate-edge cap; three sparse alternatives exhaust. |
| Coarser mixed tracing | All three candidate graphs exhaust. |
| Lower spacing for initialization, with strict final checks planned | Nine attempts yield graph exhaustion or timeout; none supplies a route to refine. |

No final refinement or export was possible in those last probes. Timeouts are
not infeasibility proofs, and exhausted finite graphs do not establish that
Santa is unweavable. Visual inspection of the profile proposals shows short
rectangular border stubs; the interior is preserved but the border is not
established artwork. The automatic benchmark remains **25/31**.

The early prototype and committed DP have slightly different floating-point
tie handling: all 16 compared proposals choose the same counts, but only six
masks are byte-identical. Earlier routing results are therefore records of
the pinned prototype, not exact replays of every committed proposal. The
slanted-guide, coarse and relaxed-initialization probes use the committed DP.
The mixed-trace experiment's nominal 0.3/0.5 smoothing entries both override
smoothing to zero; they are duplicate traces, not independent evidence.

## Verification

Four focused tests compare the DP against exhaustive short binary profiles,
check color-complement behavior, unchanged interiors and physical bounds, and
replay the frozen Santa input. A later defaults correction scales profile/edit
bands for small physical hearts; the same four tests and lint pass afterward.

The full run before that defaults-only correction passed **805 inverse tests**
and **855 application tests**, with one existing application skip, plus type
checking, lint and build. The later patch changes only the offline module and
its tests; the full suite was not repeated for that patch.

Three Chromium flows on the refreshed build pass through editable conversion:
the built-in star, matching free-border hat and gold-angel mask. Both downloaded
PDFs have valid file signatures. All six result/Draw screenshots were inspected.
The star and hat retain aligned shared cuts; the hat has small contour bumps,
and the angel retains uneven border arms. The gold case uses an
annotation-assisted crop and is not an automatic-photo success. All 153 served
assets match the build. The app/solver sources remain unchanged from the
previous release, so this is no new Hunodan or 31-photo benchmark run.

The [frozen record](joint-border-profiles.json) pins local experiments, reports,
screenshots and source hashes. Nothing is pushed or deployed. Next, controlled
noise on known-valid cutting geometries can distinguish profile-repair failures
from crop uncertainty and missing routing connections.
