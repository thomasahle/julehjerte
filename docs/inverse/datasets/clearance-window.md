# One-pixel leaf shifts expose two scheduling cliffs

The classified leaf is translated one pixel in each direction, extending the
nearest edge. These are fixed-mask perturbations, not new photographs or crop
proposals. Six inputs (original, four translations, shifted-star control) each
receive two fresh ten-second solves per policy, reversing policy order for the
second repeat. No saved cutting geometry enters fitting.

The existing policy checks another clearance grid only with more than 3.5
seconds remaining. An isolated 3.0-second variant retains all existing final
gates, candidate criteria, grid count and overall deadline.

The baseline passes **four of six cases in both repeats**. The variant passes
**five of six in both repeats**. The downward leaf shift improves from
4.9769–5.0469% disagreement to **1.27375%** at 400 pixels, and passes independent
800-pixel rendering, feature, geometry and paper checks. It now compares a
3-by-3 grid with the initially preferred 3-by-5 grid. Native preparation and
solving take 9.07–9.11 seconds for that variant; process startup, rendering and
browser interaction are outside that timer.

The upward shift still fails. Both policies compare a 4-by-4 alternative and
keep the 3-by-5 grid. The useful 3-by-3 seed never reaches that comparison: its
coarse error is 7.8232%, just outside the raw-image shortlist ceiling of
6.1768% + 1.5 percentage points. The solver's later error-plus-cut-count ranking
places it near the leading candidates. This is a separate shortlist cliff,
not a reason to increase MILP time or loosen geometry validation.

The [record](clearance-window.json) retains all 24 outcomes and artifact hashes;
all 207 pinned source files remain unchanged. Small timing-dependent error
changes remain on other cases, and the upward failure is not hidden. These
six inspected development masks do not establish a global success rate.

The next isolated study compares using the existing 0.005-per-cut score for
the low-cut shortlist reservation, alone and with the earlier comparison.
It still uses three finalist slots and preserves the best seed and any
opposite-border reservation. No policy from either experiment is adopted yet.
