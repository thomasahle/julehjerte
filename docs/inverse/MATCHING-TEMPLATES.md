# Matching templates and the speed target

Direct fitting proposes an identical pair from the fitted free curves. Exact
candidates share transposed control coordinates during optimization and are
accepted only without increasing measured original-mask error, with the same
geometry and paper checks. The matching option is enabled by default.

The initial experiment put a coordinate penalty inside fitting and awarded a
0.0075 image-objective bonus to an identical candidate. The speed study exposed
accuracy regressions from both: the penalty could push cuts toward a narrow
paper neck, and the bonus could select a worse image. Those mechanisms are no
longer applied to the image fit. Matching is evaluated after fitting against
the unchanged source, and an accepted identical pair stays tied during further
refinement.
There is also an optional early acceptance setting. It is **off by default**:
the initial shortcut preserved all 22 regular Hunodan export passes, but raised
many per-case errors relative to the validated release. That does not meet the
new speed target. A nearly exact validated initial grid can bypass refinement
when early acceptance is enabled; the symmetric checkerboard regression takes
about 1.8 seconds and independently verifies identical exported templates.

For the user's September 8 screenshot of `hjhih-01`, the photograph-only crop
has a 4.9994% lower bound on error for an exactly transposition-symmetric image.
Each observed pair of disagreeing transposed pixels forces at least one error.
The original Hunodan crop has a 4.5773% bound. Both exceed the existing 3% image
gate, so an exactly identical pair cannot pass for these fixed classified crops.
The UI reports this limitation rather than moving the crop or changing the mask.

The first screenshot replay with optional early acceptance took 18.2 seconds
and had 1.03% independent error; the previous committed implementation took
44.1 seconds with 0.70% internal original-mask error. These are a speed/quality
tradeoff, not completion of the new target. A preference-disabled control also
produced close templates, so these runs do not establish that the soft penalty
alone improved template similarity.

The active target is every regular Hunodan case within 10 seconds, including
preparation, initialization, validation and export, with each independently
rendered error no higher than `HUNODAN-VALIDATION.json`. Source decoding and the
external benchmark renderer are timed separately. Reference templates, counts
and saved solutions must not enter initialization. Work toward that target is
ongoing.

Validation for the matching changes: all 254 tests passed, including five new
tests for symmetry bounds, constraint projection, analytic gradients and exact
export identity. Type checking has zero errors and eight existing warnings;
lint passes. The updated pipeline passes a 22-case experimental speed replay; integrated browser validation is in progress.
