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
place there is named by that corner. Two rings can also cross at a vertex of
neither (a motif over a check's side): a place there is their crossing, named
on one ring with the other as `x`. And two rings can share a side that
cancels (two checks of a colour side by side): a cut along it is hidden, so
the script calls a piece of a slit visible only where the picture's colour
changes across it, not wherever it lies on a ring.

A recipe lists the sizes (whole percents) and the space around the motif it
was checked at, and the corners of each ring. The page loads
`static/generator/recipes/<motif>.<style>.json` for the motif and frame chosen
where `index.json` lists it and passes the recipes in the request. `generate`
draws the recipe for the request's size, space and outline, if any, as the
edges of a construction and finishes it like any other; it keeps it only where
it cuts cleanly, and builds the heart as before everywhere else.

## A topology's recipe

On the board circle a recipe is a topology's, not a motif's. Inside the circle
the board's lines are cleared (each check and its part inside the circle
cancel even–odd), so the motif is an island that touches none of the board's
outline, and any two motifs whose rings nest alike (one outline; an outline
with a hole; ...) can be drawn into each other without touching the board. The
heart's and the star's solves at 60% on five strips are the same, piece for
piece; only where the hidden cuts land on the motif differs (the heart's dip,
the star's tip). So the topology is the board's outline and how the motif's
rings nest (`nestingOf`), and one recipe draws every motif of it.

The board's outline is what the picture shows (`boardOutline`): where the
colour changes, the sides that cancel even–odd left out, as a graph whose
vertices are where three or more pieces of it meet, where it meets the
paper's edge, or where it turns more than 20°, numbered by walking the graph
itself (breadth first from the leftmost vertex on the paper's top edge, each
vertex's edges clockwise from the one it was reached by), so that the numbers
hold while the circle grows. Its rings' corners would not do: as the circle
passes a line it cuts a thin lens into the check beyond, which adds corners to
the rings, but the check's edge just follows the circle there and nothing is
cut along the line. Counted so, the board circle has 3, 5, 10 and 12
topologies on 3, 5, 7 and 9 strips (by the rings' corners, 4, 6, 12 and 15).

Such a recipe (`outline`, `motif` and `places`, see `TopologyRecipe` in
recipes.ts and topologyRecipes.ts) names its places on the board by an edge
of the outline and a share along it, its board stretches as stretches of one
edge, and its places on the motif by their order round each ring (`motifRings`: outer
rings first, each followed by those inside it, all running with positive
area), each with where it lay when solved: its direction from its ring's
centre and its distance as a share of the ring's mean radius. Rings nesting
alike are named by where their centres lay (`rings`), not by the order of
their directions alone: a ring right of the motif's middle lies at 0° or 360°
by a hair, and the polar star's points swapped places between 86% and 87%.
Where the places fall on a particular motif is chosen when it is drawn
(`placeMotif`): each is first put at the point of its ring nearest where it
lay (at a vertex where it lay at one), and where those are in order round the
ring they stay there; else every point a unit apart round
the ring may take a place, the places keep their order, and each goes where
its hidden cuts are shortest. A held recipe (`held`) keeps every place it can
cut from; another moves each to make its cuts short. Its hidden cuts keep the
solve's bends, taken along and across each cut as before. A cut may not cross the outline, nor come nearer than the board's
clearance to it or to another cut away from its ends, nor meet the outline at
under 8° (a cut along a star's point into it meets it at half its tip, which
the generator allows); under 45° it costs more. A thin part of the motif (where
its outline comes back near itself, as the generator's severe pinch has it)
needs a place in it, so that the paper on either side is cut by different
papers.

A recipe whose places lie in mirror pairs across the heart's middle (the
sheet's diagonal; a solve tied so, its places at the corners nearest each
other across it) keeps them in mirror pairs on any motif that is its own
mirror image there (to a unit), so the heart's two lobes share one template
(`lobesShareTemplate`). One place of each pair is kept and the other put at
its mirror image (at the corner nearest it where the kept one is at a
corner: a place a hair beside a corner adds a segment to one lobe only, and
the lobes no longer match); a place paired with itself goes where its ring
crosses the middle between its neighbours (at the corner there, or a hair
beside it, where the tip itself is too sharp to cut from). The cheapest of
three ways to choose which place is kept (those right of the middle, those
left, each pair's cheaper) is taken where every cut is clear and the places
keep their order; else the places stay as found. Drawn so, the heart's 5×5
solves at 45–86% keep one template on the tree, house and diamond at nearly
every size (9 of 30 such draws without it, 24 with), and over the page's
recipes at five sizes on ten symmetric motifs 33 draws gain one template and
none loses it.

The page loads the frame's `board.json` as well, and `generate` makes its own
heart first, then draws up to three of the topology's recipes for the size and
keeps the best where it beats its own (`fromTopology`): fewer places the paper
may tear (the paper check at 80 mm, `paperNecks`, and needles), then one
template for both lobes over two, then sharp tips, hidden turns and length,
as below. Its sharp tips are then bent as the generator bends its own, a tip
with its mirror image in the other lobe where the lobes share a template,
which they go on sharing (bent one at a time, the star's 96% lost its one
template for four fewer sharp tips). They are drawn on its own heart's
picture (whole, or on a larger circle, where it keeps the motif so). A recipe
whose places all lie on the motif's outline (`motifFit`: it was solved on this
motif, at whatever size) is drawn first, the one solved for this size
(`solved`) first of those: held, it is that solve, so a solved motif keeps
every heart its own recipes drew. A held recipe's places a hair off the
outline (`exact`) are drawn there only where they fall within half a unit of
where it places them: on its own motif at the size solved. A motif no recipe was solved for
draws its topology's all the same: the butterfly, which never solved, is one
outline like the star (an owl, with its eyes as holes, is another topology).

## Making recipes

    node scripts/generator/recipes.mjs <motif> board 5          # solves, every size, 45–100%
    SYMMETRY=1 node scripts/generator/recipes.mjs heart board 5   # a mirror-symmetric motif
    TEMPLATE=1 node scripts/generator/recipes.mjs gi-squirrel rays 0 80 90   # from the generator's hearts
    node scripts/generator/topology.mjs board 5 <motif>...         # the topologies' recipes

A board's solves go to `scripts/generator/solves/<motif>.board.json`; they are
not shipped. Beside them, `<motif>.board-<strips>.sym.json` holds tied
(mirror-symmetric) solves of the symmetric motifs, made at five to ten fixed
sizes a board, from the generator's own heart as the search's start, each kept at
every size of its outline where it cuts cleanly, for `topology.mjs` to judge:
`recipes.mjs` itself starts from nothing and keeps a solve only where it beats
the generator. A file of solves made on an outline the motif has since
changed carries that outline (`contours`), and its solves are turned into
topology recipes on it: the circle's, made on a 63-gon before the circle
became an exactly symmetric 64-gon, are `circle.board-5.63gon.json` and
`circle.board-5.sym.json`. `topology.mjs` turns every one into its topology's (`topologyOf`),
draws each, held and made short, on every motif given of its topology at
every third size, beside the generator's own heart, and keeps at each size the
up to three that make the page's choice beat the generator's own heart for the
most motifs; the sizes between take the nearest's. Each held recipe is also
listed at the sizes it was solved for where it is the best of its motif's
solves there and beats the generator's heart (`solved`): the page draws only
three, and with every clean tied solve kept the star had six of its own at
71–81%. A solve is held as converted at its first size, and converted again at
the first size where that draws worse than the solve itself (the bauble's
93–96% solve, converted at 93%, left a sharp tip at 96%), so each size it was
made for keeps its cuts; a held solve whose pieces another solve has is judged
on its own motif only. It writes `static/generator/recipes/board.json`.
Give it the motifs the page features (`MOTIF_GROUPS` in catalog.ts), so its
choice is not just the solved motifs'.

The script groups the sizes by topology and solves each group at its first
size not yet covered, then draws that solve at every size of the group through
the generator's own path (`fromStoredRecipe`). A size keeps it where the heart
cuts cleanly and is better than the generator's own heart, judged in turn by
the places its paper may tear (weak paper at the 80 mm print, where the paper
check is there, and needles), one template for both lobes over two, sharp
tips, turns along its hidden cuts and its cuts' length: the first that
differs decides, and a tie keeps the
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
under older rules. The script judges hearts as the page compares them
(`cutMeasures`, `betterCuts` in cutQuality.ts, with the paper check).

A frame's recipe (not the board's solves, which `topology.mjs` takes as they
are) is kept only over runs of at least three neighbouring sizes (`RUN`, 3 by
default): a size drawn with another template than both its neighbours jumps as
the slider passes it, mostly for a few turns or a shorter cut. Without the
rule the nisse in the rays kept recipes at 45, 47–48, 56, 69, 71, 75–76, 93
and 99–100%, four templates taking turns with the generator's; with it, 49–51%,
where the recipe holds paper the generator's heart leaves weak.
`frameRecipes.test.ts` checks the stored files keep to it.

A motif drawn mirror-symmetric is solved with the heart's two halves tied: a
few seconds a solve rather than minutes, and the heart symmetric. The ties
need the picture exactly symmetric, and a motif drawn by hand is off by a hair
(the star's axis at 0.005), so `SYMMETRY=1` solves on the motif made exactly
symmetric (each point averaged with the one nearest its mirror image) and
checks the recipes on the motif itself: a place is a corner, so the recipe
draws on both. A size whose outline the ties still refuse (the circle through
a corner of the board) is solved untied. Without ties the search fails more
often, mostly on paper and slits crossing on the largest boards.

`TEMPLATE=1` starts each solve from the generator's own heart at that size: its
cuts are read onto the picture's outline as the search's template, which it
repairs where they do not fit. In the rays a search from nothing runs out of
time at the start (the squirrel at 80–84%); from the generator's heart it takes
three to five seconds. `VERBOSE=1` prints each size's measures beside the
generator's, and why a size is not kept.
