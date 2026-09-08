# Matching templates

The generator prefers an exactly matching template pair when it adds at most
**one percentage point** of disagreement with the original classified crop and
passes the geometry, paper, feature and 3% image-quality checks. This implements
the user's revised September 8 requirement. The matching control and separate
pattern-style choices have been removed from the UI.

The independent fit runs first. Matching proposals copy either fitted sheet or
average compatible curves. Copying works even when the independently fitted
sheets have different slit counts or curve subdivisions. Exact proposals are
checked before optional refinement, with original-mask scoring. Accepted pairs
share transposed control coordinates. The search remains bounded and does not
prove that all possible matching pairs were considered.

Each disagreeing pair of transposed mask pixels forces at least one error for
identical templates. For the user's earlier `hjhih-01` crop this lower bound is
4.9994%; the original Hunodan photo crop has a 4.5773% bound. Neither can produce
an identical pair within the 3% target while retaining those classified crops.
The UI explains this limit and leaves the independent templates available.

The new 22-case speed replay selected matching pairs for `hjfig-02` and
`hjfig-04`, adding 0.7182 and 0.9557 percentage points of internal mask error.
All 22 passed their checks within 10 seconds on the measured machine. See
[AUTOMATIC-WORKFLOW.md](AUTOMATIC-WORKFLOW.md) and its validation records for
criteria, browser checks and the distinction from the earlier strict
no-error-increase speed target.

Candidate views and exports remain available when quality checks fail; they
include a review notice. Passing checks and export availability are separate
report fields. The available candidate is not necessarily an identical pair.
