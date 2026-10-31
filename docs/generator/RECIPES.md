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
was checked at, and the corners of each ring. Such a recipe is a motif's solve
(`scripts/generator/solves`); `generate` draws one for the request's size,
space and outline, if any, as the edges of a construction and finishes it like
any other, keeping it only where it cuts cleanly. The page ships no motif's
own: it loads `static/generator/recipes/<style>.json` for the frame chosen
(its topologies' recipes, below), where `index.json` lists it, and passes them
in the request.

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

In the rays the motif is likewise an island in its circle, and the four
corners the frame's cuts turn over outside the circle take the board's place:
the picture lists them first and the motif's rings after (`motif`: 4), and the
corners' outline is the topology's board.

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

Where that finds no places (a recipe solved on another motif, whose straight
cuts the motif's branches block, or whose cuts end in the narrow corners
between the circle, the board's circle and its lines), it is placed twice
more; a heart drawn so already is drawn as before. First a cut whose straight
way is blocked goes round the motif (`ways`): through bends two clearances
off the corners of its outline (to within half a clearance) and of the
board's, on the side each corner points to, by the shortest way through them
that keeps clear as a straight cut must. Then the cuts need only cross
nothing, as a held recipe's on its own motif, each place staying where it
lay where its cuts do: the generator judges their paper as it judges a
solve's. Neither is tried where the board's own hidden cuts cross the motif. The
page tries every listed recipe straight before any of these, and draws one
so only where fewer than three drew straight: a recipe drawn only so never
takes the place of one that drew as before. The nisse's 5×5 cuts at 71–77%
then draw on the tree, the yule goat and the snowflake, and the circle's at
86% on the star, tree, heart and diamond. Each such try costs a few tenths
of a second, and a heart's tries together stop once they have checked
`FALLBACK_WORK` straight pieces of cut: the polar star in the rays, where
none draws so, took 2.5 s more a size without it (a third pass, searching
for places with the cuts only crossing nothing, drew 2 of 64 recipes and was
dropped).

A recipe's cuts end where they ended on the motif solved, carried to this
board and motif, and the placement keeps them only the generator's clearance
apart (1.2 units on five strips, 0.86 on seven), less than paper needs (2 mm
of an 80 mm print, 2.5 units): its heart may leave a sliver of paper by a
line, the paper's edge or the motif that tears. So the page refines the best
heart a topology's recipes drew straight while its paper may tear (`refined`
in generate.ts): it finds where (`paperFaults`' `where`, each weak piece's
widest point), takes the hidden cuts nearest (within `REFINE_NEAR`), and
moves an end of the nearest a step along its board edge (`movedEnd`: the
stretches of the edge ending there move with it, and it keeps a unit from
every other end on the edge) or round its ring of the motif (`placeMotif`'s
`moves`), ±1.5 and ±3 units; where the lobes share a template, the end's
mirror image across the heart's middle moves too, the mirrored way, so they
still do. The first move whose heart has better cuts (`betterCuts`) is kept,
and it starts again from there, until no move helps or it has drawn
`REFINE_DRAWS` hearts. It compares hearts before their connections are bent
(`improveSharedConnections`), which may rank them otherwise (the wreath at
57% on seven strips: no tear unrefined, one refined), so `fromTopology` bends
both and keeps the better: a heart so only ever gets better. Where a weak
piece is paper boxed in by the cuts, held only where they meet the motif (the
house at 87% on five strips, one recipe for its pair), no move frees it:
refining moves where cuts end, never which cuts there are. On every 6th size
of the 48 featured motifs (every second of those, both run at once, for the
times) it made 11 page hearts better and none worse on five strips (311
places the paper may tear → 294) and 14 better, none worse, on seven (888 →
878); a size took 13% longer on average (2.2 s → 2.5 s on five strips), most
no longer, the butterfly at 99% on five 8 s longer (its tears 15 → 11).

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

Off a board, whose circle the generator's own heart tells its picture, a
recipe held on the motif at a size it is `solved` for is drawn before that
heart is made, and where it cuts cleanly the topology's next two beside it,
the best kept (`fromSolve`): `topology.mjs` lists it there only where it beats
the generator's heart, so any that beats it does too. In the rays the
wreath's own heart takes 13–30 s past 54%, its solve a fifth of a second.

## One recipe for each pair, on every board

On the board circle a picture is of two topologies: the outer one, the
board's outline as blobs (`boardOutline` with no corner for a turn): where the
circle stands among the squares, whatever its size; and the inner one, how
the motif's rings nest. Some outer ones are the same on several boards (the
circle past the middle lines' ends on five, seven and nine strips). The
board's recipes are one for each pair of an outer and an inner topology ("We
don't need a separate recipe for each motif x size. Only one for each
topology"), up to three for a pair: `pairs.mjs` chooses them. Every solve on
any board is a candidate for each pair it was solved in, held and made short;
at each motif and size judged it is carried to the outline there
(`transferTopology`: a place keeps its share along its blob's edge between
the corners both outlines have, one gone with the stretch to it) and drawn
beside the generator's own heart, first at one size of each board and motif,
then the best few at every size judged. The one that beats the generator's
heart at the most motif sizes (then: the fewest places the paper may tear,
the fewest hidden turns) is kept, then each next that adds the most motif
sizes where the best of those kept beats it.

Each is stored once, with the outline it was solved on (`frame`: the blobs'
signature, each blob edge's ends, middle and whether it runs along the
paper's edge, the corners along each, and the blob edge each of its own
edges lies along). The page carries it from there to the outline of any
picture of its pair, at any size on any board (`carryTopology`), draws it,
refines it (above) and keeps it where it beats the generator's own heart: no
sizes are listed, and a motif nobody solved draws its pair's recipes on
whatever outline its picture has. A blob edge can run from a vertex round
back to it (two blobs touching at a corner of the squares); a stretch from
that vertex lies at either end of it.

The first 114 recipes shipped (78 pairs; 1.3 MB, where the topologies' 505 listed
recipes took 2.2 MB) were chosen on the 49 featured motifs, every third size
of each board, on a slider tried on a branch (the circle's radius growing
evenly over the settings). On this slider, every sixth size, against the
topologies' recipes (both refined): on 30 motifs nobody solved, as good (five
strips 28 sizes better, 27 worse, 178 places the paper may tear → 184; seven
17 better, 10 worse, 1107 → 1099); on the featured motifs, whose own solves
the topologies' recipes listed, five strips 72 better, 119 worse (621 → 601),
seven 46 better, 62 worse (2381 → 2389), most of those turns and length only;
as fast (2.2 s a size on five strips, 2.0 s on seven). Where no candidate
beat the generator's heart in a pair (203 pairs of 281, 1196 of 3724 motif
sizes judged, most on seven and nine strips), the page draws the generator's
own. `UNSOLVED=file` writes those pairs; one solve for each with five or more
motif sizes, at its most common motif's middle size, kept wherever it draws
cleanly (`recipes.mjs` with `KEEP_ALL` and `OUT_FILE`, into
`<motif>.board-<strips>.pair<size>.json`, from nothing and then from the
generator's own heart), gave 18 of 85 (the 13 pairs more): those solves name
their sizes as that slider had them (`slider: 'even'`), and `pairs.mjs`
converts them on the circle they were made for (`solvedAt`). A second round,
one solve for each pair still without (203, those of one motif size too),
kept 28. `ADD=1` chose only for the pairs without recipes and kept the
shipped ones as they were, so a heart the page drew changes only where a new
pair's recipe beats it: 11 pairs more, 126 recipes (89 pairs, 1.5 MB). Every
sixth size on the page's slider, 34 motif sizes better and none worse (the
featured motifs on five strips 4, seven 10, nine 16; the 30 nobody solved on
nine strips 4). A third, at a motif or size of each pair not tried before
(`pair-queue.mjs`; 159 pairs, the 33 others have only sizes tried), kept 14:
6 pairs more, 133 recipes (95 pairs, 1.7 MB), 13 motif sizes better and none
worse (featured seven strips 5, nine 2; the 30 on seven 5, nine 1).

Most of those solves found no start in time (101 of 159; 120 s instead of 30
found none of 8 either). The generator's own heart is a solve too:
`recipes.mjs` with `OWN` reads its cuts as the solve's, with no search (each
point a hair off a ring put on it, the ring's own points followed between, its
hidden cuts straightened), into `<motif>.board-<strips>.own<size>.json`. For
each pair without a recipe, each motif's best heart and middle size (up to
eight a pair): 159 of 678 draw (most of the others meet themselves wrongly
where the heart's curve runs along a ring), and carried to the other sizes of
their pairs they beat the generator's heart there: 60 pairs more, 202 recipes
(155 pairs; 2.9 MB, 0.38 MB as sent), 118 motif sizes better and none worse
(featured three strips 16, five 27, seven 45, nine 20; the 30 on five 3, seven
2, nine 5); a size draws more recipes, so the page takes longer (median on
seven strips 1.7 → 1.9 s, nine strips' unseen 1.0 → 1.2 s). 126 pairs, 567 of
the 3724 motif sizes, still draw the generator's own heart: 93 with no
candidate that draws, 33 whose candidates beat it nowhere.

Read from its curves, a heart of the generator's met itself wrongly mostly
for four reasons. It is now read from the cuts it was built from
(`constructionOf`: each heart's straight edges and its own copy of the motif,
hard to cut or not), each edge's family the construction's rather than the
picture's colours (a line following the circle through a square of one
colour), split where it passes a ring's point (the corner of the squares a
line runs along), on the picture with the construction's motif (the generator
shrinks a motif a little where nothing finishes at its size, by 2.5% for the
mitten on seven strips at 78%). And a recipe's hidden cut can be one paper's
alone (`one`, see `RecipeChord`): the generator's lines crossing the circle to
the motif where the other paper covers them, which a recipe of shared hidden
cuts could not hold. One that makes a weave but does not finish at its own size
(hard to cut there) is still a candidate. Of 487 hearts, 375 are candidates
(the others: the motif's rings not the picture's, cuts curved to build, or
meeting wrongly still), and 91 of the 119 pairs left have one; 7 pairs more,
210 recipes (162 pairs; 0.39 MB as sent), 13 motif sizes better and none worse
(the snowman at 99% on five, seven and nine strips: 2, 10 and 10 places the
paper may tear to 1, 2 and 3). The 91 pairs' candidates beat the generator's
heart nowhere: most are its own heart at some size, the same there.

Where the generator wins at a size whose pair has recipes, mostly a recipe
carried from another motif does not finish (five and seven strips: 100 and 109
of 241 and 269 such sizes), its paper too narrow there: the editor's crossing
or spacing check, or a severe pinch. Moving one of its places round its ring
rescues almost none (3 of 3360 hearts finished). But the generator itself
finishes such a heart as hard to cut (see `hardToCutResult`), and a recipe's
never did: where the generator's heart is hard to cut and no recipe's
finishes clean, the recipes' cuts are finished its way, and the heart shown
where it is no harder to cut (as wide a spacing kept, no more narrow strips)
and cuts better (`harderStored`): the cow on seven strips at 45% from five
places the paper may tear to none. Every sixth size: the featured motifs 20,
27, 17 and 23 sizes better on three, five, seven and nine strips, none worse,
the 30 others unchanged; 0.3 to 0.5 s more at the sizes it tries. `pairs.mjs`
judges a candidate so too (where the generator's heart is hard to cut and the
candidate does not finish clean, through `fromTopology`): 14 pairs more, 225
recipes (176 of 281 pairs), the featured motifs 10 and 13 sizes better on three
and five strips, none worse. 105 pairs, 423 of the 3724 motif sizes, still draw
the generator's heart: 77 with candidates that beat it nowhere, 28 with none.

    node scripts/generator/pairs.mjs <motif>...      # every board, up to three recipes a pair
    ADD=1 node scripts/generator/pairs.mjs <motif>... # only for the pairs the page has none for
    node scripts/generator/pair-queue.mjs <unsolved.json> <solves>... # the next round's solves

## Making recipes

    node scripts/generator/recipes.mjs <motif> board 5          # solves, every size, 45–100%
    SYMMETRY=1 node scripts/generator/recipes.mjs heart board 5   # a mirror-symmetric motif
    TEMPLATE=1 node scripts/generator/recipes.mjs gi-squirrel rays 0 80 90   # from the generator's hearts
    node scripts/generator/topology.mjs board 5 <motif>...         # the topologies' recipes
    node scripts/generator/topology.mjs rays - <motif>...          # a frame without a board

A frame's solves go to `scripts/generator/solves/<motif>.<style>.json` (the
board's `.board.json`, the rays' `.rays.json`); they are not shipped.
`topology.mjs` writes the frame's `static/generator/recipes/<style>.json` (the
rays'; the board's is `pairs.mjs`'s, above). Beside them, `<motif>.board-<strips>.sym.json` holds tied
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
on its own motif only. For the board it wrote `static/generator/recipes/board.json`
until the pairs' recipes replaced its choice (2026-10-30).
Give it the motifs the page features (`MOTIF_GROUPS` in catalog.ts), so its
choice is not just the solved motifs'. `<motif>.board-<strips>.cover.json` holds
solves made where the motif's topology had no recipe, from the generator's own
heart at a few sizes. `ADD=1` keeps every recipe the shipped file has and adds
the run's only for topologies it has none for on that board, so no heart the
page draws already changes.

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

The rays' solves were first shipped as each motif's own recipes, kept only
over runs of at least three neighbouring sizes so that the slider never met a
lone template (without the rule the nisse kept recipes at 45, 47–48, 56, 69,
71, 75–76, 93 and 99–100%, four templates taking turns with the generator's).
As solves they now keep every size they cut at, and `topology.mjs` chooses
the topologies' recipes every third size, a size between taking the nearest's.
They were renumbered once for the picture with the frame's corners first.
`frameRecipes.test.ts` checks that the page's files are one a frame, its
topologies' recipes, none a motif's own.

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
