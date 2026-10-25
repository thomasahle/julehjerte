# Stored hidden cuts

The generator builds a heart's hidden cuts from constructions: panels, gates,
seams, legs and their retries. On the board circle and in the circle frames
these leave cuts that step and hook around the motif. The exact-outline search
Mal uses (`static/inverse/core/exact`) finds templates for the same picture
with straight hidden cuts from the motif's corners to the squares' corners,
board squares of one colour split where that helps, and often less weak paper.
It takes seconds to minutes and its solver is not in the page's bundle, so it
runs offline and the page keeps what it found.

## Topologies

A frame's picture at a size setting is fixed rings (the board's checks, the
frame's rays) and the motif scaled with its circle. Its outline changes shape
only at a few sizes, where the circle passes a corner of the board. Between
them every picture has the same rings with the same corners, so one solved
template draws all of them: its cuts run from the same corners as the corners
move. The generator's `picture` is the outline; two pictures have the same
topology when they have as many rings, each with as many corners (a vertex
turning more than 20°, or one another ring meets).

## The recipe

`src/lib/generator/recipes.ts`. Each slit of each paper is a list of pieces in
the picture's sheet: a stretch of one ring's outline, between two places, which
that paper alone cuts; or a hidden cut both papers cut, straight between two
places or through the bends the search gave it, each given along and across
the cut as a share of its length. A place is the k-th corner of ring r and a
share u of the way to the next. The picture's rings overlap where its parts
are combined even–odd (a check and the circle laid over it), so its outline
can turn from one ring to another at a corner of one on the other's side; a
place there is named by that corner.

A recipe lists the sizes (whole percents) and the space around the motif it
was checked at, and the corners of each ring. The page loads
`static/generator/recipes/<motif>.<style>.json` for the motif and frame chosen
where `index.json` lists it and passes the recipes in the request. `generate`
draws the recipe for the request's size, space and outline, if any, as the
edges of a construction and finishes it like any other; it keeps it only where
it cuts cleanly, and builds the heart as before everywhere else.

## Making recipes

    node scripts/generator/recipes.mjs <motif> board 5          # every size, 45–100%
    SYMMETRY=1 node scripts/generator/recipes.mjs heart board 5   # a mirror-symmetric motif

The script groups the sizes by topology and solves each group at its first
size not yet covered, then draws that solve at every size of the group through
the generator's own path (`fromStoredRecipe`). A size keeps it where the heart
cuts cleanly and is better than the generator's own heart, judged in turn by
the places its paper may tear (weak paper at the 80 mm print, where the paper
check is there, and needles), sharp tips, turns along its hidden cuts and its
cuts' length: the first that differs decides, and a tie keeps the
generator's, and a heart with no fewer places that may tear wins by its
tips only if its cuts are not much busier (at most a quarter more hidden
turns and a twentieth more length). (Weak paper alone first let in solves
with six needles; tips alone, a snowflake with twice the hidden turns.)

The engine's own checks are stricter about clearance than the site's: they
fail the generator's clean star hearts on five strips at 72–95%. So a solve
the engine doubts is drawn all the same, and the generator's path judges it. (The heart at 55% on five
strips keeps its own four short symmetric cuts: the solved one meets the
heart's curve at two sharp tips.) It tries up to four solves a group and writes the motif's file for
the frame, replacing that board's recipes.

A recipe may not change what a size shows: its heart's woven picture must be
within half a percent of the generator's own. The plain picture is not always
the generator's: on a board past the touching circle it keeps some motifs
whole (the diamond at 80–85%, the circle in the edge squares' colour) and
places large ones on their enclosing circle (the star at 88–96%), as the page
learns from the hearts it has made. So the script makes the generator's own
heart at each size first, solves on the picture it tells (`picture(request,
known)`: place, board, circle, enclosed, whole), and stores that as the
recipe's `known`; the generator draws the recipe on the same picture.

`REJUDGE=1` solves nothing: it draws the file's recipes for the board again at
every size they list and keeps only the sizes that still pass, for files made
under older rules. The script needs the paper check
(src/lib/geometry/paperNecks.ts): without it weak paper counts as none and
recipes that win by their paper would be lost, so it stops unless `NO_PAPER=1`.

A motif drawn mirror-symmetric is solved with the heart's two halves tied: a
few seconds a solve rather than minutes, and the heart symmetric. The ties
need the picture exactly symmetric, and a motif drawn by hand is off by a hair
(the star's axis at 0.005), so `SYMMETRY=1` solves on the motif made exactly
symmetric (each point averaged with the one nearest its mirror image) and
checks the recipes on the motif itself: a place is a corner, so the recipe
draws on both. A size whose outline the ties still refuse (the circle through
a corner of the board) is solved untied. Without ties the search fails more
often, mostly on paper and slits crossing on the largest boards.
