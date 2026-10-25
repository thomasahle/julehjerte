# Generator robustness results

## Stored hidden cuts for the board circle

The board circle's hidden cuts step and hook around the motif. Mal's
exact-outline search finds straight hidden cuts for the same picture, from the
motif's corners to the squares' corners, but takes seconds to minutes. Its
templates are now solved offline and stored per picture topology (see
RECIPES.md), drawn by the generator in milliseconds where they are better.

The heart on five strips (45–100%): 5 solves cover 27 sizes. At 71–82% the
stored hearts' hidden cuts turn 24–28 times against 52–64, the cuts are 3–13%
shorter, and no paper is weak at the 80 mm print where the generator's had
two places; at 45–49% and 60–70% the two are alike (the stored ones 1–2%
shorter). At 50–59% the generator's four short symmetric cuts stay (the solved
ones meet the heart's curve at two sharp tips), and from 83% the search found
no template that passes. A stored heart takes 80–120 ms to make.

Then the star, the diamond and the angel on five strips, judged by the places
the paper may tear first (weak necks and needles together: weak paper alone
let in solves with six needles), and every solve drawn and judged by the
generator even where the engine doubts it (its clearance fails the
generator's own clean star hearts at 72–95%). The star (solved on a copy made
exactly mirror-symmetric, checked on its own outline) keeps 45 of 56 sizes:
at 45–70% two sharp tips where there were five; at 71–82% two places that
may tear where there were three to seven and under half the hidden turns;
at 88–96% a third of the hidden turns. The diamond keeps 5 sizes, at 81–85%
no weak paper where there were eight places (elsewhere its own construction
is the one the search finds); the angel 2. The gift's start search runs out
of time (30 s) at every size.

The church keeps 15 sizes, all of 86–100%, where the other motifs' solves
fail: no sharp tip where the generator's had up to four, under half the
hidden turns, and less weak paper at 99–100%. The heart adds 83–84% (a
third of the hidden turns, no weak paper at 83% where there were two
places); from 86% the generator refuses its solves.

On three strips the star keeps 53 of 56 sizes (two sharp tips where there
were five, 4–6 hidden turns where there were 10), the heart 19 (as sharp,
4–6% shorter).

On seven strips the star keeps 30 sizes (at 45–70% two sharp tips where
there were five and half the hidden turns; at 100% no weak paper where
there were thirteen places, for two needles), the heart 25 (as sharp,
shorter). The snowflake keeps 7 sizes on five strips. A stored heart that
does not lower the places the paper may tear must not be much busier than
the generator's (a quarter more hidden turns, a twentieth more length) to
win by a sharp tip: the snowflake's at 72–77% had twice the turns.

Then a stored heart must show the same picture as the generator's own (within
half a percent of a raster): the recipes were solved on the plain picture,
while the generator keeps the diamond whole at 80–85% (the circle in the edge
squares' colour, half the raster apart) and places the star on its enclosing
circle at 88–96% (1–8% apart). The diamond's recipes go, and the star's on
five strips at 88–96% and on seven at 92% and 98–100%: the star keeps 53, 37
and 26 sizes on three, five and seven strips.

## The sunburst's crown narrows where its motif crowds the circle

The sunburst's circle is four fifths of its frame, and the frame stops at the
largest the outer strips have room for (80). Above about 83% a motif with the
space around it asked for no longer fits that circle: the flower's petals met
it at 84–88%, so it was hard to cut. A heart refused, hard to cut or kept
smaller there is made again with the crown narrowed, the circle up to nine
tenths of the frame, at its own size only (the size ladder again cost the
elephant twice the time for a heart no larger); kept where that is larger, or
as large and clean. Made the default the narrower crown was mixed (40 better,
13 worse: the gift at 86–90% clean → hard), so every heart cut cleanly keeps
its frame.

The sunburst's 124 hearts refused or hard to cut among 539 (49 featured motifs
at 70–100% in steps of 2): 28 changed, none to a worse status. Clean instead of
hard (27): the flower at 84–88%, the mitten at 82/84/90%, the bell, hedgehog and
wreath at 90%, the santa hat at 86%, the cow at 84/86%, the pig at 88/90%, the
candy at 82–90%, moon and stars at 82–90%, the church at 82–90%, the candle at
86%, the elephant at 70%; the elephant at 72% hard at its size instead of at
70%. Paper at the 80 mm print (`paperFaults`): the flower, mitten and santa hat
at 84–86%, moon and stars at 84/90% and the elephant now hold at 80 mm where
they held at no width, others at a narrower one; two worse, the church at 84%
and the mitten at 90% (hard with no weak place → clean with two, holding at
100 and 130 mm). Those hearts take 10–50% longer; clean hearts are untouched.

## Islands joined where they come nearest

A motif's separate pieces inside a hidden chain were entered and left at
their extremes along the chain. Parallel stripes entered so are joined by cuts
along their slanted sides, needles at both ends: the candy cane in the checked
tips at 90% had six, in Stråler at 70% five. Entering each where it comes
nearest the way in and the way on (the chain's existing `nearest` mode) joins
them straight across, but made the default it changed hearts both ways (the
santa hat in the wedges clean → refused, the elephant and squirrel sharper).
So it is a second try, like exact outline indices: a clean heart with a needle
and a sharp tip at a port where an island was entered at its extremes is made
again its first way with islands entered where they come nearest, kept where
it cuts cleanly at no smaller size with fewer sharp tips. Tried for any heart
with a needle it cost half again in the small motifs and on the boards, mostly
for nothing; for hearts hard to cut it made three clean but cost a tenth more
time everywhere, so neither is tried.

Hearts refused, hard or with a needle in seven figure frames at 70/80/90/100%:
the candy cane [6,8] → [0,3] in the checked tips at 90%, [5,5] → [0,1] in
Stråler and Tern at 70%; the gift in the silhouette at 80–100% [4,6] → [0,2];
the owl in Stråler and Tern at 80% [2,2] → [0,0]; the sleigh and the mitten
in the checked tips [1,1] → [0,0]; none worse. Equal squares, small motifs and
strips (289): 4 better (the gift's small motifs at 85–100% [4,8] → [0,4]),
none worse. The sunburst (58): the candy cane at 70% [5,5] → [0,1], at 80%
clean at full size instead of 75%. Boards on 5, 7 and 9 strips (166): moon
and stars [2,2] → [0,0] four times, none worse. No more time than before.

## Hairline spurs in motif outlines

Many of the needles left in figure hearts were not points of the motif but
catalogue overshoots: an outline running a fraction of a unit past a corner and
back along itself, or zigzagging back and forth (the horse's back, under the
dove's wing, a star of the moon and stars). They draw nothing anyone sees, but
every cut along them turns back, a needle of paper. A figure's outline now
loses such a vertex, or it and a neighbour, where they lie within a 400th of
the motif of the line that replaces them and that leaves fewer needles nearby;
the motif's own thin points (the butterfly's antennae, a crescent's tip) only
move their needle when trimmed, and keep their vertices. Text keeps its
glyphs. 43 of the 2668 library motifs change. On a board (equal squares, small
motifs) the motif keeps the choice its catalogue outline makes at the default
size: without the spur the horse's three-horse layout builds there, hard to
cut larger.

The horse, dove and moon and stars in every frame at 70/85/100% (108 hearts):
every one changes and none is worse (the horse [3,3] → [1,1] everywhere, the
dove [2,2] → [0,0], in the checked tips at 100% now at full size instead of
88%, the dove's small motifs [6,8] → [0,2], the horse's [4,4] → [0,0]). The
other 40 library motifs with spurs in Stråler, Tern, silhouette, double border
and checked tips at 70% and 100% (400 hearts): 382 better, 18 alike, none
worse, in 36% less time.

## A bridge a hair from an outline's vertex

Placing a bridge along an outline arc, the figure construction counted its
index along the arc's points as `arc` returns them, but `arc` leaves out a
vertex that meets a port: from there each index lay a vertex behind its point,
and the outline cut from such a bridge ran back to that vertex and out again,
a needle in the paper (the fish's eye bridge in the silhouette at 80%, three
needles). Counting the arc's own points fixes it, but made at once it changed
18 of 743 hearts both ways (previously invalid candidates now pass first: the
gift in the checked tips at 100% gained two sharp tips, a woven Jørgen a
needle). So the construction keeps the old count, notes where it slips, and a
heart refused, hard to cut or with a needle after a slip is made again its
first way only (no retries, last resorts or smaller size) with exact indices,
kept where it cuts cleanly at no smaller size with fewer sharp tips.

Seven figure frames at 70/80/90/100% (1344 hearts; only the 392 refused, hard
or needled ones can change): 8 change, all better (the bauble in Stråler and
Tern at 100% hard → clean, the fish [3,3] → [0,0] twice, the owl in Kiler and
Tæt om figuren at 70% [2,2] → [0,0]), for 7% more time on those 392 (one more
construction where a slip shows; the santa hat's refusal in the silhouette at
70% +27 s). Board hearts hard or needled on 5, 7 and 9 strips (173) and text
(330) are unchanged.

## Many gates in a corner: legs straight to the paper's edge

Where a figure needs four or more gates a side (the spread panel layouts and
the component lanes in Stråler and Tern, and the circle frame's text cells),
the legs of the gates in the two corners the heart's middle runs through
stepped round the paper's corner, each nested in the next: boxes in boxes.
The pig at its default 70% in Stråler had 160 corners, the polar star at every
size, the owl at 80%. Each leg now steps a quarter of the margin off the
circle and runs straight to the edge: fanned to the same staggered ends in
the rays, square in the checks (straight out from points past the corner's
diagonal, a step aside first from those before it). Legs of one sheet still
never cross; legs of the two sheets cross however they run there.

Featured motifs in Stråler and Tern at 70/80/90/100% (384 hearts): 24 change,
none in status or sharp tips, all with fewer corners (pig 160 → 128, owl
154 → 122–126, santa hat 94 → 70–74, candy cane 85 → 61–65, polar star
118–120 → 102–104), and paper at 80 mm holds as well or better (owl at 80%
from 8 weak places to 2, candy cane at 100% from 5 to 1). Strålekrans (147)
is unchanged. Text (330 hearts in five fonts and six frames): 18 circle-frame
hearts change, none in status, each with fewer corners and fewer weak places
(Glædelig Jul 54 → 30 in Cinzel, 54 → 28 in Alfa Slab One). In a sample of
150 library motifs in Stråler and Tern at 70% and 100% (600 hearts) 54 change,
none in status or tips, each with 8–40 fewer corners.

## Nine strips at 85%: no specks in hidden cuts

At a completion range's end (nine strips at 35.6, the 85% setting) a hidden
cut stepped straight in from its switch point and then on to the drawn cut's
corner 0.014 behind that step: the fitted cut turned back on itself in a
speck, a needle and a sharp tip in both sheets, eight of each a heart. Points
of a pulled-taut cut a hair apart (0.05) now go. Over the board circle at
every completion and whole-motif size (735 hearts) only nine strips at 85%
change: 30 hearts, none in status, each with 16 fewer corners and eight fewer
needles (the heart [8,16] → [0,0], the star [8,20] → [0,4]).

## Nine strips at 90–91%: no hidden cut hooks round

The completion of the circle on nine strips at 90–91% joins pairs of switch
points whose chord lies just past the 40° a hidden cut may leave its switch
point from straight in, at both ends: pulled taut, such a cut left straight
in, stepped aside and hooked back (a turn of over 135°, a sharp tip of paper
in both sheets), eight a heart. A cut still turning that sharply is now two
straight stretches where they keep clear, each leaving its switch point as
steeply as allowed towards the other and meeting where they cross; and a
cut's slanted exit no longer joins a point back past its switch point (a
zigzag at the radius between 88 and 89%). Over the 49 featured motifs on
the board circle at every completion and whole-motif size (five strips at
86, 90 and 94%, seven at 87–91%, nine at 77–91%; 735 hearts): five and seven
strips and nine below 90% unchanged; on nine at 90–91% 60 hearts change,
none in status, each with 32 fewer corners and 16 fewer sharp tips (the
heart [8,24] → [8,8], the star [8,27] → [8,11]); the eight needles left are
the outer lines meeting the circle at 24°.

## Clean figures bent tip by tip, however they were made

A clean figure's shared cuts bent at its sharp tips of paper all at once or
not at all, and only on the recipes' own path: a heart a retry made (the
candy cane's nested construction in the rays) kept every tip. Every clean
figure is now bent once it is made, all at once or, where that brings cuts
too near, tip by tip, each bend kept where the heart still cuts cleanly. Over
47 featured motifs (the swan and elephant left out), 7 figure frames at 70
and 100% and the board circle on 5, 7 and 9 strips at 72, 88 and 100%:
22 of 658 frame hearts, 14 of 141 on five strips and 6 of 141 on seven and
on nine change, none in status, all to fewer sharp tips (needles, sharp):
the polar star in the rays at 100% [11,12] → [6,6], the pig in the rays at
70% [1,6] → [0,1], the candy cane [7,8] → [5,5]; on five strips at 88% the
star [9,14] → [1,2], the heart [8,14] → [2,2], the bear [7,10] → [1,1].
Time is unchanged (frames 948 → 961 s, boards 652 → 635 s).

## Hard-to-cut figures bent at their sharp tips

A clean figure's shared cuts bend where they meet the motif in a sharp tip of
paper; a figure called hard to cut kept every tip. It now bends the same way,
all at once or else tip by tip, each bend kept only where its narrowest paper
stays (to a 64th of the clearance) and no other cut comes too near. Over the
23 featured motifs that are hard somewhere (the swan left out), in 7 figure
frames at 70, 85 and 100% (483 hearts): 39 change, all hard before and after
and every one with fewer sharp tips (needles, sharp): the hedgehog in rays
and checks at 70–85% [4,7] → [0,2], the elephant in rays at 70% [2,8] →
[0,1], the bauble in the checked tips [2,3] → [0,0], the cat in the double
border [1,3] → [1,1]; none other changes. On the board circle (26 motifs at
72, 80, 88 and 100%) 13 of 104 hearts change on seven strips and 12 of 104
on nine, again only hard ones and all with fewer tips: the cow on seven at
80% [6,12] → [0,0], the nisse on nine at 100% [1,14] → [1,4].

## No alternative made twice where it would fail the same way

A request that cannot be built at its size is made again with each last
resort allowed, and before this the whole size again: a swan refused in the
wedges was made seven times a size, the same request with the same last
resorts twice. An alternative that failed is now not made again at that size
where every last resort newly allowed is one it set nothing aside for. Over
7 figure frames (rays, checks, double border, checked tips, wedges,
silhouette, close-fitting) at 70, 85 and 100% for the 49 featured motifs
(1029 hearts), every heart is unchanged and the sweep takes 6752 s instead
of 8731 s: the swan's refusals in the silhouette 169 → 114 s at 70% and
700 → 406 s at 85%, in the wedges 505 → 435 s at 85%.

## Checked tips: side lanes bent past a large motif

At 92–100% the checked tips' side lanes run a straight leg from beside the
motif to each checked tip, and a large star's lower tips came within 0.37 of
it (the house's eave 0.67): hard to cut. As the last retry before a heart is
called hard, every layout runs again with a leg that passes nearer another cut
than the six-strip clearance bent out past it, a corner the space asked for
from the nearest point, on its side away from the middle, inside the bands'
border and crossing no other cut. Over the 49 featured motifs at 70, 85, 92
and 100% (196 hearts): 188 identical; the house, star and yule goat hard → clean
at 92% and 100%; the owl at 100% hard at 94% → clean at 97%; the penguin, clean
at 100% either way, now has bent legs and its checked tips at the space asked
for, where they stood further out. Hard or refused 36 → 29. Still hard at 100%: the bauble, butterfly,
rabbit and unicorn (94%), gift, holly and church (97%); the swan and elephant
are refused there.

## Paper by the edge for motifs kept whole

Measured as paper (each template cut at the download's 80 mm print, every
piece hanging by a neck of at least 2 mm; `paperNecks` on the design-page
branch), a motif kept whole on five strips at 91–93% tore in eight places:
crescents between the circle and the paper's edge, held by the paper between
the edge and the hidden cut from a switch point halfway along the short line
from the edge to the circle (2.1 units, 1.7 mm). The pulled-taut completion
had already taken the same hearts at 86–90% from 20 weak places (holding from
130–140 mm) to none. A lone switch point on a piece that ends at the paper's
edge now keeps a paper neck (2.5 units) from it where the piece is long enough;
spreading several the same way crowded their own cuts (seven strips at 88%:
weak places 19–24 → 25–48) and is left out.

Over the featured motifs on five strips at 86–94%, seven at 78–90% and nine at
75–90% (686 hearts): on five strips the hearts that tear at 80 mm fall from 145
to 133 and their weak places from 756 to 612; seven and nine strips are
unchanged; no heart tears more or changes status. Still torn: five strips at
94–100%, where the circle (48.1–48.5) runs within 1.5–1.9 of the edge; and most
of seven and nine strips at these sizes (9×9: 236 of 245 tear at 80 mm, 154 at
any width up to 200 mm), mostly through the motif's own connections.

## Fewer sharp tips in every frame

The bend at sharp tips the board circle now makes (below) also runs on every
other frame's clean figures. Over the 49 featured motifs at 70% and 100% (90%
on the sunburst), the swan and elephant left out (both refused or hard where
they are slow):

| Frame | Tips under 30° | under 45° | Hearts changed |
|---|---|---|---|
| rays | 112 → 94 | 266 → 209 | 24 of 98 |
| check | 112 → 94 | 262 → 205 | 24 of 98 |
| layers | 84 → 67 | 197 → 154 | 21 of 98 |
| corners | 77 → 61 | 159 → 139 | 15 of 98 |
| sunburst | 107 → 92 | 228 → 189 | 19 of 94 |
| wedges | 77 → 67 | 146 → 129 | 8 of 98 |
| silhouette | 83 → 71 | 156 → 137 | 9 of 98 |
| fitted | 63 → 57 | 145 → 128 | 7 of 94 |

Small motifs, equal squares and the figure in the checks build their hearts
another way and are unchanged. No heart gets more tips or a different status,
and the time is the same.

## Fewer sharp tips on the board circle

A clean board heart's shared cuts (seams through the motif, spokes to its
gates, hidden cuts round the circle) often met the motif's outline at a sharp
angle, leaving a tip of paper hard to cut with scissors: the star on five
strips at 85% had five tips under 30° and twelve under 45°. The layered frame
already bends such cuts to cross the outline instead, keeping the bend only
where it leaves fewer such tips and the cutting checks still pass
(`improveSharedConnections`); the board circle now does so for every clean
heart. Shared cuts are cut alike in both sheets, so the picture is unchanged.

Over the 49 featured motifs on five strips at 72/85/100%, seven and nine at
80/88/100% and 80/90/100% (441 hearts): tips under 30° fall from 1436 to 709,
under 45° from 3104 to 1678; 234 hearts have new cuts, none more tips, none a
different status, and the time rises 1%.

## Seams crossing the outline square, a finer search

Searching a finer grid (60 steps rather than 40) for up to six such points,
each with only 1% of the motif's paper in every panel round it rather than 2%,
makes six more featured hearts clean: the nisse on seven and nine strips at
88%, the moon and stars on five strips at 72% and 78% and seven at 72%, and the
cow on nine strips at 100%. Hearts that stay hard take 14% longer (79 of them:
287 s → 326 s); the dove, clean since the curved retry, is cut along other
square seams again. A prefix sum over the grid counts the paper round each
point, so the search takes 3–45 ms, not 50–110.

## Seams crossing the outline square

The seams dividing a motif in four cross at a point of its background nearest
its centre. Through the dove's, one meets its wing's lower edge almost along
it, a needle of paper whichever way the seams are guarded or curved; on seven
strips at 88% the heart was hard to cut. `squareJunctions` finds the points of
the background, with paper in every panel round them, where the level and
upright seams cross the outline most nearly square; last of all at the size
itself, the board circle divides through those too.

Over the 49 featured motifs at the same 637 sizes: the dove on seven strips at
88% goes from hard to clean, and at seven other sizes, clean since the curved
retry, is now cut along those seams straight; the other 629 are identical. The
time rises 4%, all of it on hearts that stay hard.

## Spokes across to a point straight in from their switch point

On seven strips at 88% the star's upper right gate lies past the switch point
its spoke leads to (7° against 0°). Round to it at the gate's radius, the
spoke turned back on the motif's own cut to the gate, a 25° needle of paper,
and the heart was hard to cut. A direct line to the switch point would leave
it 57° from straight in, past the 40° allowed. A spoke may now also run
across to a point straight in from its switch point, and out.

Over the featured motifs at eleven completion sizes (539 hearts): the star on
seven strips at 88% and 90% and on nine at 82% go from hard to clean; 179
hearts have new spokes, none changes otherwise, and the time falls 5%.

## Gates kept off a seam through the motif's point

At the largest circles on seven and nine strips the star's seams cross just
beside its centre, one along its axis through its top point. Most divisions
then failed to compile ("Invalid A degree" at the point): the top panels'
gate, the outline's farthest point in its direction, is exactly where that
seam crosses the outline, so two hidden cuts met there. The seam guard that
keeps gates off seams was only on in the divisions that also reach islands.
Last of all at the size itself, every division (and the seams moved beside a
corner) is now tried again with the seams guarded.

Over the 49 featured motifs at the same 637 sizes as below: the star at 100%
on seven and nine strips goes from hard to clean (it was hard at 98–100%);
the nisse on five strips stays hard, keeping a different construction with
the candidates added; the heart (five strips, 84%) and the wreath (seven, 72%),
clean since the curved retry below, are now cut by a guarded division instead.
The other 629 are identical, and the time is the same.

## Curved seams before calling a board heart hard to cut

The board circle kept its best hard-to-cut construction as soon as none cut
cleanly, so the curved-cut retry other frames get after a refusal
(`curveSharedCuts`: shared cuts meeting the motif in a narrow point bend to
cross it instead) never ran for it. Divided in four, the dove's seams meet its
outline at about 40°, a needle of paper at every size. Now, when the
construction kept would be hard to cut, each one tried is curved and finished
again, and the first that cuts cleanly is kept. A heart that cuts cleanly
without them keeps its cuts: the retry comes after the narrowest-spacing check
that finds some rejected constructions clean after all (a first version before
it changed the cuts of 11 clean hearts).

Over the 49 featured motifs at 5 strips 72/78/84/90/100%, 7 and 9 strips
72/80/88/100% (637 hearts), 23 go from hard to clean and the other 614 are
identical: the dove at every size on every board, the candy and the heart on
five strips, the squirrel on seven and nine, the julebuk, the wreath and the
cow. Hearts that stay hard take about 0.7 s more (median 2.1 → 2.8 s). Still
hard: the nisse and the cow on five strips (a seam squeezing past a boot), the
star at 98–100% on seven and nine strips (a seam alongside a point).

## The board circle's completions, pulled taut

Where the board circle keeps every line past the junctions (seven strips at
87–91%, nine at 82–91%, and the motifs kept whole on five strips at 86–94%,
seven at 78–86% and nine at 75–77%), its hidden cuts were drawn along the
stretch of the circle's edge each cuts off. Round every white square outside
the circle they passed they went three sides, boxes within boxes, and the
templates looked "really quite crazy" (the star on nine strips at 90%: 627
corners over 25°, both sheets).

Each hidden cut is now pulled taut once drawn (`tighten` in
`boardCompletion.ts`). It keeps its ends and as few of its points as leave it
as far from everything else as it was. It crosses a white or red square
straight, leaves its switch point no more than 40° from straight in, and comes
no nearer the centre at any angle than the drawn cuts came there, or than a
spacing inside the circle. A spoke with no other spoke's gate or switch point in
its turn runs straight out to its switch point once that keeps clear.

| Pattern (middle of its range) | Hidden cuts | Corners before | after | Length before | after |
|---|---|---|---|---|---|
| 7 strips, 44.3 | 28 | 108 | 12 | 515 | 405 |
| 9 strips, 34.2 | 28 | 124 | 20 | 405 | 319 |
| 9 strips, 36.5 | 20 | 64 | 28 | 343 | 308 |
| 9 strips, 40.6 | 32 | 88 | 40 | 591 | 474 |
| 9 strips, 43.2 | 40 | 192 | 52 | 957 | 678 |
| whole, 5 strips, 45.7 | 12 | 48 | 8 | 349 | 259 |
| whole, 7 strips, 32.7 | 12 | 52 | 8 | 242 | 186 |
| whole, 7 strips, 38.1 | 20 | 76 | 32 | 461 | 380 |
| whole, 9 strips, 25.4 | 12 | 52 | 8 | 187 | 145 |

At each pattern's ends and middle, no two hidden cuts come nearer than before.
Whole hearts, both sheets:

| Heart | Corners before | after |
|---|---|---|
| star, 7 strips, 88% | 484 | 248 |
| star, 9 strips, 82% | 450 | 246 |
| star, 9 strips, 90% | 627 | 401 |
| heart, 9 strips, 90% | 612 | 386 |
| tree (kept whole), 5 strips, 90% | 206 | 110 |

The 40° limit is what keeps the hard-to-cut flags as they were: at 50° the
star and the heart turned hard to cut on nine strips at 88% (one sheet's paper
comes to a 40° tip beside the switch point). Letting a cut turn anywhere along
its first stretch made two more hard and saved nothing. Bounding the depth by
the drawn cuts' at each angle alone (outside the circle where none went in)
kept most corners (7 strips: 68 instead of 12).

The patterns themselves were already the simplest of their kind: a search
over the same exact model for the completion whose hidden cuts enclose the
fewest switch points (`SPAN=1` in `tmp/claude/weave/cpsat.py`) returns the
nine-strip pattern in use at 42.7 unchanged, and another of the same span for
seven strips. With the fewest switch points the crossings allow, what is left
is the number of cuts the circle needs there.

Over the 49 featured motifs at the sizes these patterns draw (five strips at
86–94%, seven at 78–91%, nine at 75–91%; 1127 hearts), 776 have new cuts and
351 are unchanged. One changes status: the candy cane on nine strips at 90%,
hard to cut before, is now clean. No heart turns hard or refused, none keeps a
different size, and the time is the same (2479 s before, 2487 s after).

A cut that could not leave its switch point slanted, and so went straight in
and turned, now leaves it along the steepest way allowed (40°) where that keeps
clear, and turns less. The hidden cuts' corners at the patterns above fall
further (9 strips at 43.2: 52 to 48; the whole patterns on five strips: 8 to
0), the star on nine strips at 90% to 385 corners and the tree to 94. Over the
same featured motifs at eleven of those sizes (539 hearts), 276 have new cuts
and none changes status.

## Every motif file on the rays frame

At 70% the rays frame cuts 2623 of the 2668 motif files cleanly; 20 are hard
to cut and 25 refused (0.9%). Nine motifs are refused by both the rays frame and
the board circle: ph-circuitry, ph-codepen-logo, ph-command,
ph-fallout-shelter, ph-graduation-cap, ph-head-circuit, ph-steam-logo,
tb-blender and tb-brand-signal. They have pieces touching at points, slivers,
or islands in winding holes.

The other refusals of each frame are built by the other. The board's
remaining four include one featured motif, the elephant (hard to cut on the
rays frame). The rays frame's other sixteen (the ph-user-circle badges,
ph-lasso, ph-subway and more) are all built by the board circle, five of them
(ph-clock-countdown, ph-globe-stand, ph-yarn, tb-download, tb-radar) since the
change below.

Every way of reaching a motif's pieces (below), tried as a route of the rays
frame's panels too, builds none of its refusals. Those constructions then fail
to compile ("A path ends on the wrong edge", "Invalid A degree").

## Every motif file on the board circle

The board circle had only been swept over the corpus and the featured motifs.
All 2668 motif files at the default setting, five strips and 70%, gave 2477
clean hearts, 138 hard to cut and 53 refused (2%). Nearly all the refusals were
"No open four-port construction": a motif of several pieces whose pieces the
gates' four spokes could not all reach.

Three ways of reaching them are now tried as the last of the last resorts
(`withEveryWay`). A request that is refused without them tries again with
them, only if the board passed over a motif of several pieces, or with islands
in its holes, on the way. So every heart built without them keeps its cuts.

- **Each piece as the one the spokes meet (`bases`).** Of three pieces in a
  row (ph-columns-plus, ph-rows-plus), the largest is an end piece, and the
  middle one then lies across every route from the far gate. The spokes now
  try each other piece in turn, largest first.
- **Islands in a ring's hole (`nested`).** ph-peace is a ring with four
  sectors in its hole. The hole's islands were chained in a straight row
  across it, which cannot alternate with its attachments. The nested routing
  the double border already uses reaches them round either attachment. The
  cell never passed it on.
- **Spokes round the pieces in their way (`around`, kept whole only).** A
  back card (tb-copy, tb-library) hides the front one from two gates. A spoke
  another piece blocks now takes the shortest way past the corners of the
  pieces' hulls, kept clear of them and inside the circle through the gates.
  Hidden islands are then entered and left where they come nearest the way
  in and the way on, rather than at their extremes, which for a bent back
  card are its ends. An island about as near two gates takes the one next on
  going round the cell: the polar star's four needles lie between the gates,
  and the first gate took two of them, whose chain then crossed the star.

Divided in four, the first two are tried too; spokes round pieces are not,
as they do not know the panel's sides.

Of the 53 refused motifs, 40 now build at five strips and 70%: 19 clean and
21 hard to cut. Most take 1–15 s (ph-columns-plus 1.0 s, tb-copy-plus 1.9 s,
the polar star 1.7 s, ph-peace 15 s, refused before after 4, 8, 3 and 99 s).
The 13 left are odd shapes: pieces touching at a point (ph-codepen-logo),
slivers (ph-graduation-cap's tassel), islands in a winding hole (ph-command),
and the elephant. Their refusals take longer, mostly 1.5–2 times as long
(tb-car-suv 60 → 102 s), ph-command 18 → 88 s. Remembering each nested
contour's construction per pair of attachments (`nestedBlock`) took a quarter
of that off. The double border, which uses the same nested routing, keeps its
hearts bit for bit (ten motifs with islands in holes, at 70 and 85%).

Every heart built without the new ways keeps its cuts by construction. A
check on 22 motifs that take the other last resorts, the curved retries,
the smaller circles and both constructions (264 hearts on five, seven and nine
strips) found all of them bit for bit and as fast. Two placements were
tried first and dropped. With the new ways among the decisions, the gift and
the candy cane on five strips, which take the large circle's smallest size
at 70%, were kept whole there instead (the gift on nine strips turning hard).
As a second pass inside the board circle, they ran before the curved retries
and the other last resorts, and changed the santa hat, ph-coffee and tb-paw.

## The board circle normalises its motif

70 motif files carry rings of zero area or with repeated points. Examples are
star, tree, ph-cat, ph-peace and ph-rabbit. Every frame and the board's picture
already dropped these rings (`normalizeContours`). The board circle took the
raw contours, and it now normalises them too.

All 840 hearts of those motifs (five, seven and nine strips at 70–100%) are
unchanged bit for bit. The sweep took 3352 s instead of 3488 s. ph-peace's
refusals are up to 30 s quicker, and ph-rabbit is 10–20% quicker.

## The featured motifs on the board circle

Most of the 49 featured motifs (`MOTIF_GROUPS`: Jul, Dyr, Former) are not in
the test corpus (`scripts/generator/corpus.json`). Only 10 are, so the board
sweeps above never saw the rest.

They were swept on five, seven and nine strips at 70, 80, 85, 90, 95 and 100%
(882 hearts): 714 clean, 132 hard, 36 refused.

**Refused at every size on every board:**

- **gi-polar-star (Jul).** The motif in four fails every division. Its four
  needle points lie on the seams through its centre ("Invalid A degree"). The
  background between the points and the four pieces beside them keeps no
  point 4% of the motif clear of the outline for the panels to meet at. Kept
  whole, the single cell's four-port routing finds no construction, in any
  frame's cell.
- **pin-elephant (Dyr).** No construction either way ("No open four-port
  construction", 25 s).

Other frames make both: the rays frame cuts the polar star cleanly, with its
nested recipe on six strips.

These did not help:

- Seams moved beside the needle points, both seams at once. They then cross
  the needles' sides.
- Junctions with 1.5% clearance (four in the background between the points).
  Every panel's four-port routing failed.
- Points blunted to 1% of the motif.
- Island routing for the undivided motif.
- Gates moved along the cell's sides (`adaptGates`) for an undivided motif.
  This makes the elephant on three strips (hard to cut), and 10 hard hearts
  clean, but one clean heart hard (gi-santa-hat, three strips, 60%). It is
  also three times slower over the corpus (hi-pig 4.5 s → 45 s), because the
  nine gate positions are tried in the decisions too. Not shipped.

**Hard at most sizes:** hi-pig, gi-squirrel and pin-butterfly (kept whole; all
18 hearts), nisse (15, from 80%), hi-cow (14), pin-dove (12), gi-swan (8) and
mc-moon-stars (7). The star is now hard at four (see below).

## Seams beside the motif's corners

The star was hard to cut on the board circle at most sizes past 80% (nine
strips at 80–90% and 100%, seven at 83–90%, 96% and 100%, five at 96% and
100%). Its top tip lies 0.0056 of the motif from the seam through its
centre. At the board's scale that is a quarter of a unit, close enough for the
seam to snap onto the tip ("Invalid A degree" at the tip), so every division
through the centre failed. The seams through the star's lower notch run
straight into the same tip and halve it into two 18° slivers of paper, too
thin to cut.

A seam that comes within a fiftieth of the motif of a corner of its outline is
now tried that far beside the corner, either way. These moved seams are a last
resort. They are tried only when building at the size itself, after every
other division. They take no part in deciding whether the motif is divided or
where it sits; when they did, the deer on nine strips was divided from 72%,
hard to cut there, instead of kept whole.

Over the corpus on five, seven and nine strips at ten sizes from 72% to 100%
(1560 hearts):

- 12 hearts went from hard to clean: the star at nine of them, and ph-dog at
  96% on every board.
- 5 hearts of the star stay hard (nine strips at 83% and 100%, seven at 88%,
  90% and 100%).
- Every other heart is unchanged bit for bit.

The star's remaining hard sizes at 83% on nine strips and 90% on seven come
from the completion router. There, a spoke runs along its gate's own circle,
with no room to step out under the deep cuts across the circle. It meets the
gate's connection to the motif at 34°, a wedge too thin to cut. A gate is
placed in the direction of its panel's side, not of the port it serves. That
remains open.

## Motifs kept whole grow on seven and nine strips too

The five-strip completion about the whole motif also fits two finer boards
short of a line: seven strips short of their outer lines, and nine short of
their third. These are the same chains, only smaller. The exact search (CP-SAT,
label A) also found an eleven-point completion for seven strips past the outer
lines' junctions with the middle ones (36.8). Its spoke passes under a cut
across the circle, so the motif keeps 3.5 in.

Motifs kept whole now grow on seven strips from the touching ring's top (28.2,
75%) to 39.3 (87%). On nine they grow from 21.4 (73%) to 26.9 (77%). Before,
they stopped at the top on both. The motif grows with the radii the
completions cover. It waits between them rather than jumping
(`boardWholeFill`, now also on five strips: at 90% its motif reaches 44.1, so
it no longer jumps at 86%).

| Board | Sizes swept | Clean | Hard | Hard motifs |
|---|---|---|---|---|
| Seven strips | 85–100% | 19 of 22 | 3 of 22 | ph-coffee, ph-sun, ph-bicycle (as before) |
| Nine strips | 78–100% | 19 of 22 | 3 of 22 | ph-coffee, ph-sun, ph-bicycle (as before) |

Nine strips at 76% also have snow hard. Nothing is refused. Divided hearts are
unchanged bit for bit.

Limits found:

- **Seven strips stop at 39.3.** The eleven-point completion puts two switch
  points on the second line's short side, between its junction with the outer
  line (41.65) and the circle. At 39.5 they are under 0.9 apart, and every
  motif is hard. The search finds completions that keep the sides free up to
  41.2, but only with their cuts across the circle nested three deep. The
  motif would then keep further in than the circle gains. None nests two deep
  there (spacing 1.0 or 1.2: infeasible).
- **Further out, every motif is hard.** This covers seven strips past 42.05
  (15 points a quarter) and nine past 28.7 (11). Both are left out.
- **A size kept inside a slider step.** On seven strips, 39.3 lies in the step
  between 39.0 and 42.05. Its setting used to map back below the step (to
  37.4), so the page's picture missed the heart by 4–7% of pixels.
  `boardSetting` now gives the setting just past a step. The picture caps a
  whole motif's circle as the heart does (`boardWholeRadius`), and now misses by
  at most 0.4%.
- **The bicycle is slow.** ph-bicycle takes 50 s at nine strips, 100%, as
  before. That time goes to failing attempts before it keeps a smaller circle.

## Motifs kept whole grow on, every line kept

Product prompt (2026-10-22): "Remember that you can also change the color of
the grid at certain zoom levels".

The circle's colour goes with how the motif is divided, by parity. In the edge
squares' colour, an odd number of the circle's chains switch sheets each
quarter. So the motif must bring an odd number of switch points a quarter:
one gate, the motif whole. The motif in four brings four (two gates, the
seam, the centre).

A flip near nine strips' remaining steps would therefore need the motif
whole, which meets only four lines. The search finds weaves there (radius 38
to 47.5), but at 45 they need 41 switch points a quarter with room for each,
against 22 in the centre's colour: more crowded, not less.

The motifs that cannot be divided in four already use the edge squares'
colour. On every finer board they stopped growing at the touching ring's top
(82.5% on five strips, 75% on seven, 73% on nine). 22 of the 52 corpus motifs
are such.

On five strips, a completion about the whole motif (7 switch points a quarter;
`WHOLE_PATTERNS`) now carries their circle from 42.8 to 48.5 (86–95%), every
line kept, and they keep 48.5 above. At 49.5 the paper left between the circle
and the paper's edge is too thin. Over the corpus at 86–95%, two motifs are
kept smaller, as before (ph-coffee, ph-bicycle), against 22. snow and ph-crown
are now clean there. The page's picture matches the hearts (at most 0.4% of
pixels). Divided hearts are unchanged, bit for bit.

## An exact search for the completions, and two more ranges on nine strips

Product prompts (2026-10-22): "continue", and of the fewest-hidden-cuts
bundle: "You can check the algorithms and comprehensive analysis".

The completion model of the board circle is now solved by CP-SAT
(tmp/claude/weave/cpsat.py, OR-Tools 9.14). It uses:
- a boolean per candidate chord;
- one line label per boundary stretch, equal along every chosen chord
  (turned with its quarter);
- planarity conflicts between chords, worked out in numpy;
- a distance per stretch from the paper's edge, which rules out closed loops
  (as the bundle's flows and potentials do);
- the spokes' order round an aligned motif, as conflicts.

Options let the counts per chain be maxima (two neighbouring switch points may
pair up as unused), give each switch point its piece (side, arc, side) with
room for the points on it, limit how deep cuts nest, and keep to cuts between
neighbouring chains. It finds the known seven- and nine-strip completions in
0.3 s, where the depth-first search took minutes or ran out of time. It also
proves cases impossible: on seven strips at 47, cuts between neighbouring
chains alone, with room for each point, have no completion.

At the bound the meetings give (each A cut meets each B cut once, visibly or
along one hidden cut), the bundle's Proposition T says the completion is a
partial smoothing of the grid. The search reaches that bound on nine strips:
12 switch points a quarter at 36.5, 22 at 45.

Drawing them needed three things:
- the motif's outer gates just outside the motif (a pattern's `gates`), not
  midway to the circle;
- spokes whose gate lies within another's turn round the motif running a level
  deeper (the router now sees every gate first);
- for the 12-point pattern, the motif 2.7 inside the circle (a pattern's
  `band`, which the motif's even growth respects).

For the same circle and motif the router still draws the deployed patterns
bit for bit as before. On nine strips the new ranges move the slider and the
motif's growth.

Two new ranges:
- 35.6 to 37.3: over the corpus, star, tb-star, ph-moon-stars and tb-paw are
  hard, as around it.
- 42.7 to 43.6: star and tb-paw are hard, and ph-puzzle-piece at 43.6.

None is refused. The ranges that meet now share their percent, and the
percents go one by one to the range that grows most per percent. The
nine-strip slider steps 30.4 to 32.8 (81–82%), 37.3 to 40.2 (87–88%), 41 to
42.7 (89–90%) and 43.6 to 48.2 (91–92%). The cat's largest change from one
percent to the next on nine strips falls from 14.2% to 9.2%.

With the 12-point pattern on nine strips but the gates midway, 13 more corpus
motifs were hard: the gates stood in the way of its cuts. The 22-point
pattern, at 44.3 and above, is hard for all.

## Nine strips past the outer lines' junctions with the middle ones

Past radius 39.3 the nine-strip circle encloses the outer lines' junctions
with the middle ones and the third lines' with each other. Each A cut must meet
each B cut, and at 40.5 only 20 of the 64 meetings are visible, so a quarter
needs at least 11 hidden cuts and 18 switch points.

The search now takes the motif's panels as aligned with the circle's quarters
(spokes into a panel's two gates from one quarter, the seam in the third slot).
That pruning makes each count vector about ten times faster. It finds a
completion with counts 2, 0, 0, 6, 1, 9. Two of its hidden cuts reach past a
whole chain. Drawn by offsetting the boundary, they squeezed between the
corners of red squares near the junction at (27.8, 27.8), where the passage
into the white corner square is two units wide. They now cross the mouth of a
white square outside the circle along the circle, wherever the cuts inside it
all start and end there. Their ends go on the arcs.

Other changes for this pattern:
- Spokes route under the hidden cuts they pass.
- Offsets round sharp outer corners follow an arc instead of a shortcut through
  the corner.
- Nested cuts share a narrow passage by height: a cut of height h takes h/(h+1)
  of the room.
- Pockets keep within their red square.
- The cuts' spacing shrinks with the clearance the board needs (1.6 on seven
  strips, 1.24 on nine).

Seven strips are bit-identical (checked on house, cat, reindeer and gift).
Nine strips' first range is redrawn with the smaller spacing. Its corpus
results are the same: none refused, and the same motifs hard.

The new range is 40.2 to 41 (88–89%). Over the corpus none is refused, and
only star and tb-paw are hard, as at every size. The switch points crowd the
middle chains' short arcs below 40.2, and the second lines' sides beside the
junction (42.3) above 41.

The nine-strip slider now steps 35.6 to 40.2 at 87–88% and 41 to 48.2 at
89–90%, instead of 35.6 to 48.2. The cat's largest change from one percent to
the next falls from 21% to 14.2% (6.4% at 87–88%).

The seven-strip search past 46.5, which is also nine strips from 36 to 38.9,
found nothing up to 24 switch points a quarter. The search at 45 on nine
strips, past the outer lines' junction with the second, is still running.

## Every line past the junction, on seven and nine strips

The completion found by the search is now part of the generator
(`boardCompletion`, `boardPatterns`): past the junction of the third line out
with the second, the circle's edge switches between the sheets at points of
its own, chain by chain round the white circle and its white squares. Each
switch point's hidden cut runs across the white circle, hugging its edge
through the white squares outside it, a step further in for each it
encloses; or across the red square beside its chain; or round midway between
motif and circle to one of the motif's gates. The motif keeps its four panels.

On seven strips it carries the circle from 42.1 to 46.5 (87–91%), every line
kept and every square equal, where the heart had left the middle lines out.
Of 52 corpus motifs none is refused. Of those divided, star and tb-paw are
hard there as on either side, ph-moon-stars at 87% as at 86%, and tb-star at
89–91% (clean at 86% and 93%). The 22 motifs that cannot be divided in four
keep their whole circle at 75%, as before.

Nine strips short of their outer lines are seven, scaled by 9/7, with those
lines crossing the paper whole: the white squares the circle cuts end on
them, and their sides there are two more chains, with no switch points. The
search finds the same completion there at once. It carries the circle from
32.8 to 35.6 (85–88%), with the same result over the corpus (none refused;
star, tb-star, ph-moon-stars and tb-paw hard). From 35.9 every motif is hard.
The completion's axis chain holds three switch points on the side between the
outer line and the circle, under a unit apart there. On seven strips that
side is what ends the range at 46.5.

The motif now grows evenly over the ranges' radii, skipping the steps between
them, and never past a circle before the circle steps on. Seven strips are
unchanged. On nine, the fill rises about 1.8 a percent from 84% to 97%
instead of stepping 32.8 to 43.7 with the circle. The cat's picture changes
at most 6.1% from one percent to the next on seven (besides the 70–71% colour
swap). On nine it changes 1.4% at 84–85%, but 21% at 88–89%, where the
circle still steps 35.6 to 48.2.

Past the outer lines on nine strips (radius 38.9 on), no completion with the
motif in four has been found. Each A cut must meet each B cut at a visible
junction or along one hidden cut. At 40.5 only 20 of the 64 meetings are
visible, so each quarter needs at least 11 hidden cuts and 18 switch points.
The few counts of 18 tried give no complete pairing at all. Neither do
smaller counts with a larger ring-shaped motif.

## Gates between neighbouring ends, and every line past the junctions

Product report (2026-10-22), after the step above: "There's still a jump from
88% to 89% on the cat. Please keep going till it's completely smooth all the
way from 0 to 100% at all grid sizes", and of "no heart with equal squares and
every line can be woven between radius 32.4 and 47.8": "Yes it can. Just think
harder on how to do it."

The thin cuts just past the outer lines' junction (43.8 on seven, seven of
eight hard-prone motifs hard) came from the gate between two neighbouring
ends: the cut from a motif's gate facing elsewhere ran along the circle past a
line's end. It now runs round midway between motif and circle, as beside a
following line, and the five-strip constructions start 0.4 past the junction
(42.1 on seven, 48.2 on nine), the slider stepping 39.0 to 42.1 and 30.4 to
48.2 at 86 to 87%. The same routing cleans five strips just past its own
junction: at 73%, 45 of 52 clean, from 34 (11 motifs hard to clean, none the
other way; every other size unchanged). On seven and nine at 86–100%, 43–45
clean and 7–9 hard, as before.

Running on to the junction with every line, the middle lines closing in so
that the squares between them all but vanish, removed the step on seven but
cut thin at 86–87% (17 clean of 52) and left those squares unequal; set aside.

The claim was wrong. `docs/inverse/exact-weave-solvability.tex` gives an exact
test: a picture weaves if and only if its visible edges can be labelled by
sheet and completed with hidden cuts (shared by both sheets) so that each
sheet's cuts are disjoint paths from edge to edge; every pair of an A and a B
cut then crosses at a visible four-way junction or along one hidden cut. A
search over that model, symmetric under a quarter turn, with switch points on
the boundary chains of the white circle and its white squares, on the motif's
outline and round its centre point (scratchpad weave/), reproduces the
three- and five-strip constructions, and finds hearts with every line on seven
strips at radius 45 using today's four-panel motif: 12 switch points a quarter
on the circle's chains, hidden cuts across the white circle between
neighbouring chains, and hidden cuts through the red squares just outside the
circle. Without those last it needs a ring-shaped motif with a large hole;
without a motif nothing works. One such solution, realised as curves, renders
exactly to its target (every pixel). Building it into the board circle is the
next step.

## A smaller step for the circle on seven and nine strips

Product report (2026-10-22), on 7×7: "there's a big jerk now as we go from 93
to 94%. An even bigger jerk at 9x9. Maybe the background colors should swap
again around this level, like 70->71". There the circle stepped from 39.0 to
50.9 (on nine from 30.4 to 52.8), and the motif filling it with it.

The circle steps only where the heart leaves the middle lines out, and those
constructions now start where they can, not where the circle covers the middle
lines whole. Short of that, leaving them out changes only the outer ring's
middle squares, which merge into one in the circle's colour beside it. It
starts where each gate keeps room 2 from the lines beside it (`gateRoom`): just
past the outer lines' junctions with the inner (41.65 on seven), their ends
crowd the gates and cut thin (seven of eight hard-prone motifs hard at 43.8).
On seven the step is now 39.0 to 44.9, at 88 to 89%; on nine 30.4 to 51.0, at
89 to 90%. The motif does not step with the circle: it grows on evenly to fill
the circle again past the outer lines' corner junctions (`boardFill`, 89–95% on
seven, 90–96% on nine). Filling the circle at once, as before, gave half the
corpus hard at 87–91% (24–25 clean of 52), the gates midway between the
circle and a motif nearly filling it; three units more room made most clean.

Swapping the colours does not help on its own: with every line, a motif kept
whole in the circle's other colour (as below 71%) fits only to radius 30.3 on
seven, as every check the circle covers whole must lie in it. With the middle
lines left out it fits from 35.3 to about 50.5, but there the merged middle
squares show as bars three squares long, and past it the motif must be divided
again, a second swap. On nine, leaving out only the innermost line a
side would fill 32.4–45.3, but leaves such bars in the outer ring, so the step
there stays large; the motif's not stepping is the gain.

A motif is divided where the middle lines are left out only if it is in every
range further out, so it does not shrink back (the tulip divided at 89–94% and
fell back to its small circle at 100%). The bicycle, hard at every size and
15–25 s a heart, still divides at 89–92% and from 93% falls back to its small
circle, where the build at its size fails. The other ranges on seven now share
the slider with the new one: steps of up to 1.1 units a percent (were 0.8).

Over the corpus and the deer, 0 refused throughout:

| Board | Sizes | Clean | Hard |
| --- | --- | --- | --- |
| 7×7, deployed | 86 / 93 / 94% | 46 / 44 / 45 | 6 / 8 / 7 |
| 7×7, now | 88 / 89 / 91 / 94 / 100% | 44 / 44 / 45 / 45 / 45 | 8 / 8 / 7 / 7 / 7 |
| 9×9, now | 89 / 90 / 93 / 97% | 43 / 44 / 45 / 44 | 9 / 8 / 7 / 8 |

Pictures before the cuts colour the merged middle strips as one and match their
hearts within 0.5%. Five and three strips are unchanged (cuts and pictures
identical for eight motifs at five sizes each).

## No refusals in any figure frame

Three changes, each tried only where a request would otherwise be refused or
shown smaller, so that every heart built before keeps its cuts (cut hashes
compared over every frame for the motifs concerned, and over text hearts):

- **Islands along visible spokes.** A motif's islands (a paw's toes, a sun's
  rays, a cup's steam) are chained along hidden cuts; entered along visible
  spokes they route where those cannot, but that construction was kept only
  when clean. A refused request that set one aside tries again keeping it for
  the final check. The board circle's paw, sun, coffee cup and bicycle and the
  paw on equal squares are hard to cut rather than refused, the sunburst's sun
  clean, its paw at 95% hard. Made global instead, it turned 9 clean hearts
  hard (the earlier construction standing where a later one was clean), hence
  the second pass.
- **Hidden cuts that only crowd.** In the checks, two hidden cuts across one
  square that would come too close, without crossing, were never both cut, and
  Cinzel's ANNA, anna and Anna found no sheets that keep every strip whole on
  any board (the solver proved it at once). The same second pass lets them be
  cut, counted as crowded: those texts are hard to cut.
- **The double border to 100%.** Its medallion is at most 80 across and holds
  the whole motif, so 15 motifs could not be built above 85–97% and the slider
  stood still there. A motif that would reach past the largest circle now grows
  over the sizes above the default to the largest it holds, the cutting
  clearance inside it. The 17 motifs concerned build at every size from 75% to
  100%, all clean but the bicycle at 85% (hard), the butterfly stopping at 88%
  (its outline finds no four attachments larger); several hard ones became
  clean, as the space asked for is now kept.

After all three, over the corpus and the deer (refused / kept smaller):

| Frame | 70% | 85% | 100% |
| --- | --- | --- | --- |
| Equal squares, small motifs | 0 / 0 | 0 / 0 | 0 / 0 |
| Board circle | 0 / 4 | 0 / 22 | 0 / 23 |
| Rays, checks, wedges, silhouette, fitted | 0 / 0 | 0 / 0 | 0 / 1 (fitted) |
| Double border | 0 / 0 | 0 / 1 | 0 / 15 → 1 |
| Checked tips | 0 / 0 | 0 / 0 | 0 / 4 |
| Sunburst | 0 / 0 | 0 / 0 | — (85% cap) |

The same second pass now comes before the last resorts that change what was
asked (other strips, more space, cells fitted to the motif), as the strips
and space are kept hard to cut if need be. At the default size this changes
six hearts and no text (275 compared): on equal squares the sun and Tabler
stars were clean only on fitted 4×4 cells and the Tabler gift on fitted 5×5,
now on true 3×3 squares (the gift clean, the others hard); in the sunburst
the coffee cup, sun and Tabler paw were built with more space than asked, now
with the space asked (the paw hard). Their pictures, which differed from the
hearts by 5–45%, now differ by under 1%.

The figure in the checks on 3–6 strips, at 70% and 100%, refused only the
snowflake on three strips below 80% (no sheets keep every strip whole, even
without the crowding, loop or vertex rules). A board frame that cannot weave a
motif on the strips asked for at any size now shows it on the nearest strips
that can (the finer of two), as the page already says for the other board
frames ("Med 3 strimler kan figuren ikke væves …; den vises med 4"), and the
picture draws the strips its heart was made on.

Text in the checks and the medallion lays its letters out as one outline,
each letter its advance and a little tracking after the last. Cinzel's serifs
reach into the next letter there (E–M, M–A, A–N, l–l), and outlines that cross
cannot be woven: in a sweep of its 216 text cases it refused 12, among them
JULEMAND, juleman, William and EMMA in the medallion ("the converted cuts fail
the editor's crossing check") and in the checks. A letter that reaches into
the one before now moves on until they are half the tracking apart; letters
that do not cross keep their places, so every other bundled font lays out
exactly as before (and joined script fonts from Google can now be woven).
The medallion builds all of Cinzel's (hard to cut), the checks EMMA and ANNA.

Longer words in the checks were still refused in most fonts (juleman,
JULEMAND, William, GLÆDELIG/JUL, ANNA/BO): their letters share squares, and
the hidden cuts that join each letter to the board came within the cutting
room of the next letter, so they were left out and some letter had fewer than
the two it needs. The crowded-hidden-cuts pass now also keeps those, as long
as they keep a tenth of the room and cross nothing. All nine refused cases in
Cinzel, Kalam and Oswald build, hard to cut, in 20–54 s (each board fails
first). Hearts that built before keep their cuts (52 figures, 12 texts), but
where the text chooses its strips it may now take one that refused before, if
that keeps more of the clearance (Oswald's Søren and God jul, hard either way,
now on 4 strips rather than 5 and 6). ABCDEFGHIJ still finds no sheets.

The board circle's kept sizes are motifs that cannot be divided in four: they
stay whole up to the largest circle that holds them whole (about 83%, see
below), the coffee cup at the touching circle. Still refused in text: Nunito
ABCDEFGHIJ in the checks (ten letters across are too small for any board; the
solver finds nothing even without crowding, loops or vertex rules) and the
five-line J/UL/JUL/UL/J in the medallion.

The first build of the sunburst rabbit at 90% took 73 s this morning and 28 s
now (each counter's box centre found once per outline rather than per port and
comparison, and the speed-ups below): the sunburst's slowest at 85% fell from
19.5 s to 8.5 s. At 90% the sunburst builds every corpus motif at its size (36
clean, 16 hard, the rabbit slowest at 28.5 s, all others within 16 s), so its
slider now goes to 90%. Above, of the ten slowest, six at 95% and nine at 100%
came out at 91–97% after up to 3.5 minutes.

## Faster first builds, the same hearts

The small motifs' first heart tries every pattern before a hard-to-cut one, and
most of that time went to work done again: the search's clearance check on
routes it had already judged (of the deer's 140,904 route checks only 28,444
were new routes; its 55,288 route sets held 26,715 distinct ones), ports and
splits projected onto every edge of a ring, and rays, box centres and point
comparisons building temporary arrays at every candidate bridge. The verdicts
are now kept by the route's points and margin, alone and per pair in a lobe;
edges are passed over by a box test first; and rays, centres and nearness take
one pass each, points apart in either coordinate skipping the hypotenuse. All
of it gives the same numbers, so the same hearts: identical cut hashes for ten
frames over a range of motifs and for 40 text hearts (two fonts, five frames).

| Small motifs, first heart | Before | After |
| --- | ---: | ---: |
| Phosphor crown | 58 s | 43 s |
| Phosphor rabbit | 54 s | 32 s |
| Tabler cookie | 32 s | 21 s |
| The deer | 24 s | 15.5 s |
| Ten frames, one motif each | 48.5 s | 28.5 s |

The crown is still slow because each of its four patterns fails after 4–13 s
before the hard-to-cut one is finished: that is the search itself.

## Small motifs: one alone rather than refusing

At the default size the small motifs refused 7 of the 52 corpus motifs (the
butterfly, rabbit, coffee cup, bicycle, crown, sun and Tabler gift: "No clear
mixed letter connections"), even after three copies on 3×3 and two on 2×2. Their
last resort is now one copy alone in the centre square of 3×3, built as equal
squares build it (its choices in turn, cells fitted to the motif last), and the
picture draws it as equal squares do. At the default size over the corpus and
the deer: 46 clean, 6 hard, none refused (the six hard: snow, bicycle, crown,
Tabler paw and butterfly, the deer). The first heart still tries every pattern
before the single copy: the rabbit takes 49 s (refused after 54 s before), the
Tabler gift 18 s; later sizes keep the default size's choice and are quick.

## The double border and the checked tips to 100%

Six figure frames stopped the size slider at 85%. Swept over the corpus and the
deer at 85, 90, 95 and 100% (with the fallback below): the checked tips build
51 clean at 85–90%, 48 at 95%, 41 clean and 11 hard at 100% (4 shown at 97%),
no refusals, slowest 9 s; the double border 49 / 48 / 44 clean at 90 / 95 /
100%, the rest hard, none refused, 15 motifs shown smaller at 100% (the gift
85%, the butterfly 80%), slowest 14 s. Both now go to 100%. The silhouette,
small motifs and equal squares build the same heart at 85% and 100% (their
squares are full), and the sunburst gets slow and hard above 85% (43 clean at
85%, 22 at 100%; the rabbit 73 s at 90%, 6 minutes at 100%), so they keep 85%.
The frames that already went to 100% build there for all but the fitted fish
(97%): rays and checks 50 clean, 2 hard, wedges 52, close-fitting 48 and 4.
(The earlier fallback had returned smaller hearts without saying so: the
double border's gift was built at 85% when asked for 100%.)

## Above the default size, a motif nothing can be built for keeps a smaller one

Sweeping the frames that stop at 85% at 85–100% showed refusals inside the
slider's range: the circle with a double border refused the butterfly even at
85%, and the fish at 90%, though it builds at 85%. Above 85% a motif that could
not be built at its size tried 3% less, and 3% less again, but never below 85%,
and from 90% never 85% itself (87%, then 84% was below the floor). A motif that
cannot be built at its size above the default now keeps the largest of a fixed
few sizes below that can be (97, 94, 91, 88, 85, 80, 75, 70%), the same for
neighbouring sizes, rather than refusing, and the result says which (the page
then says the motif is shown at that size). The double border: the butterfly
keeps 80% at 85–100%, the fish and the coffee cup 85% at 90–100%. The fitted
fish at 100% still keeps 97%.

## Motifs that cannot be divided grow past the touching circle

Found while sweeping the circle on equal squares (goal set 2026-10-21: "Keep
improving the frames, making them more robust and able to handle a wider range
of parameters"): 19 of the 52 corpus motifs (the tree, bell, circle, moon,
diamond, heart and other solid shapes, the rabbit, butterfly and anchor) kept
the touching circle, 70%, whatever the size, on every board, as four panels need
a point of background to meet at. A motif kept whole weaves past the touching
circle too: there the circle covers the middle square and the four around it, the
four of its own colour, and the next line out follows the circle while the other
sheet's middle lines cross it to the motif's four gates, as on seven strips past
the third line (an exhaustive search of the rim finds it at every radius up to the
corner junctions). It keeps the circle's colour, so nothing flips at 70%. Such a
motif now grows until its gate would come within 1.5 of the lines beside it
(`boardWholeTop`: radius 40.4, 82.5%, on 5×5; 28.2, 77.6%, on 7×7; 21.5, 76.2%,
on 9×9) and keeps that circle above (`GeneratorResult.whole`, which the picture
follows). Out past the paper's edges, where the middle lines are left out,
whether a motif can be divided is decided at sizes of that range: on nine strips
the deer, too small to divide in the touching ring, now goes out past the edges.

Over the corpus and the deer no motif keeps 70% any more: 5×5 at 80% 45 clean, 3
hard, 4 refused, at 100% 46, 2, 4 (the crown, kept whole, now cuts cleanly); 7×7
at 78% and 100% 45, 3, 4; 9×9 at 76% 46, 2, 4 and at 100% 45, 3, 4. Every picture
matches its heart.

## Equal bands around the circle with a double border

Product report (2026-10-21): "'Cirkel med dobbelt bort' is unnecessarily thin in
the border". The outer pair of lines lay 8 units outside the medallion, so at
the default size (70) the inner band was 4 wide beside an outer band of 7, and
in the text frame's larger medallion (80) the outer band was 2. Both pairs now
share the room equally: the outer lines lie midway between the fitted frame's
lines and the paper's edge (`layerInset`), bands of 5.5 at 70 and 3 at 80. Over
the corpus the figure frame is unchanged, 49 clean, the paw hard and the flower
invalid as before; the text frame too (105 clean, 62 hard, 36 invalid, 13
refused of 216, as before).

## The circle on seven and nine strips out past the paper's edges

Product reports (2026-10-21), on 7×7 and 9×9: "I still see this: at 100% the
circle is far from intersecting the sides", "I think you can find an
algorithm/weave that works if you think hard" and, of a mock-up with a thin
ring of the motif's colour inside the circle, "You don't need the extra ring".

No plain circle between the largest so far (39.0 on 7×7, 30.4 on 9×9) and
one that covers the middle lines whole can be woven with the motif divided in
four. Every strip of one half crosses every strip of the other, so every check
of the board exists somewhere in the woven heart, in its own colour. A check
the circle covers whole can only lie inside it: in the circle's colour it
merges with it, in the other it must be a piece of the motif. Past radius 41.7
on 7×7 (32.4 on 9×9) the circle covers 21 checks, 9 of one colour and 12 of
the other, so the motif would need at least nine hidden pieces. Hiding those
checks as pockets just outside the circle, in squares of their own colour,
does not help: every line must still pass through the motif, and each of the
32 pairs of lines whose junction the circle covers must cross on a hidden seam
of its own, where four pieces, the circle's edge and pockets give at most
about 24 (an exhaustive search of rims found none with the motif in four, nor
in five without pockets, nor in five around a middle piece with them). The
ring of the mock-up worked because it gave those checks a place.

Once the circle covers the middle lines from edge to edge of the paper, though,
they show nothing, and leaving them out (both sheets, both sides) merges the
checks between them and changes no square outside it. The outer two lines a
side remain, and the five-strip constructions take the circle out past the
paper's edges, the motif in four (`boardRanges`, `boardRangeLines`): on 7×7
from just past the outer lines' corner junctions (50.9) to a unit past covering
the inner of the two whole (55.4), on 9×9 from where the second lines are
covered (52.8) to 58.2. The heart then has five strips, three squares wide in
the middle; the page still shows the board chosen (`GeneratorResult.board`).
The slider steps once to there: 7×7 39.0 at 93%, 50.9 at 94%; 9×9 30.4 at 90%,
52.8 at 91%.

At first such hearts cut thin where the motif's outer gates, moved in to
midway between the motif and the circle, came to lie on the paper's edge, the
circle being beyond it. Where the paper's edges cut a circle off, a gate now
moves to three fifths of the way out from the motif to the edge, or to the
circle where that is nearer (midway inside the paper, as before), which cut
cleanly most often; the cut that runs round between motif and circle keeps
inside the paper likewise. Over the corpus and the deer: 7×7 at 94%, 97% and
100% 45 / 44 / 45 clean, 3 / 4 / 3 hard, 9×9 at 91%, 95% and 100% 45 clean, 3
hard, 4 refused throughout (the usual four); the hard ones are the star,
snowflake and crown, hard on every board, and the dog at 97%, as on five
strips. The boards that already went past the edges keep their counts: 5×5 at
97% and 100% 44 / 45 clean, 3×3 at 86% and 100% 47 clean, 1 hard (snow), 3×3's
slowest heart at 100% 3.2 s (was 7). Pictures match their hearts except where a
motif is shrunk to fit (tb-star, 9.6%) and on three strips as before. Slowest
7 s.

## Larger board circles on seven and nine strips

Product report (2026-10-21), on 9×9 at 92%: "it looks like we still can't make
the circle big for 7x7 and 9x9". Past the second ring's corners the circle there
reached the third line a side, whose ends would need a third gate a side, and
the motif nine panels. Of the 52 corpus motifs, 12 can be divided into nine
panels whose seams cross only in their background (each panel keeping some of
the motif: an empty one would need visible cuts or a pinched strip), none into
sixteen, so finer division was dropped. Instead the third line follows the
circle, crossed by the middle lines of the other sheet, which reach their gates
along it (cut in both sheets where the two run together, over squares of the
circle's colour); the motif stays divided in four and the circle keeps its
colour. `overlapGates` now pairs any number of lines a side, with following
lines' arcs bounding a quarter's gates; on five strips it reproduces the old
two-line overlap exactly (5×5 bit-identical at 60–100%). The circle grows so
until a gate would come within 1.5 of the lines beside it (`gateRoom`): radius
39.0 on 7×7 (from 36.0) and 30.4 on 9×9 (from 27.9). Measured along the circle,
a gate 1.5 from the follower's end was only 0.7 from its line, which meets the
circle at 28°, and cut thin; the cut from the motif's gate, which there faces
another part of the circle, runs round midway between motif and circle to its
gate, rather than along the circle past the follower's end. The slider gives each
range past the touching circle a share of 70–100% in proportion to its radii
(`boardSteps`; 5×5 unchanged), steps never larger than 0.8 on any board.

Over the corpus and the deer: 7×7 at 100% 44 clean, 4 hard (star, ph-moon-stars,
snow, ph-crown), 4 refused (the usual four), at 97% the same; 9×9 at 100% and
97% 43, 5 (and ph-dog), 4. Before, at the old 100%: 45, 3, 4 on both. Pictures match
the hearts except where a motif is shrunk to fit (tb-star on 7×7 at 100%,
5.6%). Slowest 7 s.

The same day, a Reddit report said "Tekst i ternene" refused SØREN and ÆBLE and
the circle frame set SØREN as "S ØREN". Neither reproduces: in all nine fonts and
on every strip count, both make hearts (mostly with the hard-to-cut warning,
naming Ø or Æ, whose split counter or ring make thin paper), in Chrome and WebKit,
on the site and on the version of 10-20 11:18; Ø has O's width in every font.
Characters outside the fonts' set (~, ?, …) are refused by name: the set is
fixed when the shipped fonts are built, and for Google fonts in `FONT_CHARACTERS`.

## The circle on equal squares meeting the paper's edges in points

Product report (2026-10-20), on 3×3 at 100%: "I want a nice sharp cut here at the
edge, not this little bump. Also, the circle can clearly get bigger than this".
At radius 52, then the largest on three strips, the line between a corner square
and the square beside it met the circle 0.74 units short of the paper's edge, so
the red corner square ended in a 0.74 stub of line instead of a point. Now, once
the circle reaches an edge, a line it meets closer to that edge than the cutting
clearance (1.5, `BOARD_STUB`) ends where the circle meets the edge: the square
beyond the line comes to a point along the circle, in the cuts and in the picture
alike (tested both ways). The circle still grows smoothly, and at the slider's 1%
steps no stub shorter than 1.5 is left on three or five strips (3×3: 2.5 at 83%,
1.9 at 84%, points from 85%; 5×5: 1.6 at 96%, points from 97%). On three strips
the circle now grows on over the corner squares until it meets the edges halfway
along them (radius 60.1 at 100%, up from 52), in steps of 0.57; the motif keeps
the paper's room, as on five. Three strips also skip checking whether the motif
could be divided, which it never is there.

Over the corpus and the deer, 3×3 at 100% and at 86% (where a stub would have
been 0.7): 47 clean, 1 hard (snow), 4 refused, as at 70%. 5×5 at 97% and 98%,
where the middle lines now end at points: the same result for every motif as
without the rule (44, 4, 4). 5×5 is bit-identical at 60, 70, 80 and 85%. The
picture matches the heart except where the motif is shrunk to fit, which it
cannot predict yet: the Tabler flower (18%) and the gift (13%, as at the old
100%), and tb-stars and tb-gift, which are shown on 5×5. The cat's search on
5×5 at 97–98% tries candidates whose cuts leave the paper (validation warnings),
with or without this change; its finished hearts stay inside.

## Strips for the circle on equal squares

Product request (2026-10-20): "you should be able to choose the number of
squares for this frame too". The circle on equal squares now takes 3×3, 5×5
(its own), 7×7 or 9×9 (`BOARD_STRIPS.board`). Its constructions hold on any odd
board, scaled to its squares (`boardRanges`): the undivided motif while it meets
one line of each sheet a side, four panels while it meets two, the corner
squares overlapped past the junctions of the second; the circle takes the middle
squares' colour while the motif is whole and the other once it is divided, on
every odd board. On three, one line a side, the motif stays whole all the way
out past the paper's edges (radius 28.6 to 52); on seven and nine the circle
stops where a third line would need panels of its own (36.0, 27.9). Over the
corpus and the deer, at 70% / 100%: 3×3 47 clean, 1 hard, 4 refused (at 70%,
tb-stars and tb-gift, which must be divided, shown on 5×5); 7×7 45, 3, 4 at both;
9×9 44, 4, 4 / 45, 3, 4. The radius grows without a step larger than 0.8 on
every board (tested; just past the touching circle it now steps up to the first
radius clear of the corners there rather than back to the touching circle, as
on 7×7 and 9×9 71% fell between). Not matched yet: the picture of a motif that
fits nowhere at its size and is shrunk to fit (the Tabler flower on 3×3, 19% of
the square off until its heart is shown). 5×5 is unchanged, bit for bit (the
corpus and the deer at 60, 70, 80 and 85%).

## The circle on equal squares growing smoothly to the edges

Product reports (2026-10-20): "From 85% to 86% there's a little jerk as the deer
moves off center to the right. Is that really necessary?" and "There's also a
jerk in the circle size from 99% to 100% that seems unnecessary". A motif that
sits on its smallest enclosing circle over the corner squares jumped there at
86% (the deer 2.7 units); it now moves there over 85–100% (`enclosedAlong`), the
deer 0.2 units a step, its reach shrinking all the way so it still only grows.
The circle held radius 49.5 over 96–99% and jumped to 52 at 100%; it now grows
steadily from 42.8 at 86% to 52, in steps of 0.65 (0.8 over the junctions).
Squaring off the red tips at 1.5 units where the circle comes near the edges
was tried and dropped ("you don't need to make the squares wider to create this
little inset … just increase the circle size smoothly"): the tips now thin out
until the circle reaches the edge (at 97% a unit wide). Over the corpus and the
deer: 45 clean, 3 hard, 4 refused at 86%, 95% and 100%; 44, 4 (the dog), 4 at
97%; every picture matching its heart. Hearts at 85% and below are unchanged.

## The circle meeting the paper's edges at 100%

Product request (2026-10-20), of a picture of the circle drawn past the paper's
edges: "it looks good in your touch-look.png, but I don't see it when I open
localhost?" At 100% the circle on equal squares now has radius 52: the paper's
edges cut it off, so it meets them 14.3 units either side of their middles, the
red squares beside the middles ending in points there. The ring is the circle
clipped to the paper (`boardRing`); the middle lines lie inside it all the way
and end where it meets the edges (`boardLegs`); a line end on the edge has no
run out to it (`overlapGates`). The motif keeps the paper's room (radius 50
less the space), so it is no larger than at 49.5. (96–99% then kept 49.5, the
red tips no thinner than 1.5 units; see above.) At 100% over the corpus and the
deer: 45 clean, 3 hard (star,
snow, crown), the same 4 refused, every picture matching its heart, 26 motifs
on their enclosing circle; median 0.6 s, max 10.2 s (the cat).

## More space around the motif keeps the circle's size

Product report (2026-10-20): with "Luft om figuren" at 14% and the size at
100%, the circle on equal squares fell back to 70% ("Ved 100 % kan figuren ikke
væves …"). Whether a motif can be divided in four is decided once, at reference
circles (radius 34 and 39), and that check used the space asked for: at 10% and
more the reference deer was too small to divide, so it kept the touching circle
at every size above 70%. The check now uses at most the usual 3%, its shape
deciding; the space then only sets how much of the circle the motif fills. The
deer at 100% with 10% or 14% is clean in the full circle (both kept 70% before).
A motif divided in four that fits nowhere in its circle with more space than
usual (the deer at 85% with 14%) keeps the touching circle, as before; at the
usual space and less nothing changes.

## The circle on equal squares touching the edges, and motifs on their enclosing circle

Product requests (2026-10-20), of the circle over the corner squares at 100%:
"I think we can make it even bigger - until the circle touches the outer
rectangle", then "you can make the deer even bigger! in fact, it can even be
> 100%". The circle now reaches radius 49.5 at 100%: half a unit from the
paper's edges in the middle squares, which are its own colour, the red squares
beside them keeping 1.5 units of paper at their tips, the least space the
generator allows between a motif and its frame (radius 50 leaves 1 unit; the
clearance rule does not measure paper against the paper's edge, so this limit is
set here). Over the corner squares a motif sits on the centre of its smallest
enclosing circle, decided once per motif by whether it cuts cleanly so in the
largest circle: 20 of the 28 motifs that grow do, the fish, the cat and the
house a tenth or more larger than on their box's centre. At 100% over the corpus and the deer: 45 clean,
3 hard (the star, whose tips all come close to the circle's connections on its
enclosing circle and, on its box's, past radius 48.3; and snow and crown, which
keep the touching circle), the same 4 refused; median 0.6 s, max 4.7 s; every
picture matches its heart once the page knows which centre the motif took
(`Known.enclosed`). The deer keeps its box's centre (on its enclosing circle it
cuts cleanly only made smaller), so it grows with the circle alone: about 6%
over radius 47. Centring every size on the enclosing circle was tried and not
kept: more clean results overall (the coffee cup no longer refused at 60–70%,
the crown clean), but the deer hard at 70% and the heart at 80%. Hearts at 85%
and below are unchanged.

## The circle on equal squares up to 100%, over the corner squares

Product request (2026-10-20): "why can I still not take the size of the deer to
100%?" in "Cirkel · Lige store tern", then, of a version that narrowed the outer
squares, "It changes the size of the squares. Why can't we overlap the circle with
the corner squares?" At 85% the circle (radius 42) almost reaches the junctions at
the outer ring's corners. Past them, each quarter of the circle meets one sheet's
two lines before the other's (B B A A), and the gates only paired neighbouring
ends. The same lines now pair at the same red squares, each gate midway along its
red square's arc, the inner legs of both pairs running along the circle across the
corner square, which is the circle's colour, both sheets cut there. Above 85% the
circle grows over the corner squares from radius 42.8 to 47 at 100%, every line in
place. At 100% over the corpus and the deer: 46 clean, 2 hard, 4 refused (at 85%:
45, 3, 4; the heart is clean at 100%). The 28 motifs that take the large circle
grow, the 20 solid ones keep the touching circle, the same four are refused (sun,
coffee, paw, bicycle; the slowest in 9 s), and every picture matches its heart.
Median 0.4 s, max 6.6 s. Hearts at 85% and below are unchanged, bit for bit
(design and picture hashes of the corpus and the deer at 60, 70, 80 and 85%).

## Any Google font for the text

Product request (2026-10-20): "a search box for any google font", fetched when
chosen. Below the nine tested fonts, the text panel searches 1,962 Google
families: Fontsource's list of those with Latin letters, most popular first by
Google Fonts' ranking (`static/generator/google-fonts.json`, 70 KB, 22 KB
gzipped, loaded only when searching; rebuilt by
`scripts/generator/google-fonts.mjs`). Each result shows its name in its own
letters. A chosen family's boldest weight up to 800 is fetched as WOFF from
Fontsource's copy on jsDelivr, not from Google, and outlined in the browser
(`fontFile.ts`): TrueType outlines flattened within .0005 em, overlapping
contours merged under the non-zero rule with Clipper, as `build-outlines.py`
does for the shipped fonts. Links name it as `gf:<id>:<weight>`. Searching a
shipped family (Nunito, Cinzel, …) chooses our tested copy.

Fidelity, against the JSON Python built from the same TTF files: every glyph of
Alfa Slab One, Bree Serif, Bungee and Righteous has the same rings and advance,
with areas within 0.2%. On Cinzel's variable master, whose letters are
overlapping stems, bars and serifs, the ring counts match Python's for every
glyph, with areas within 0.5%. A font reads in 3–30 ms.

The 200 most popular families and Mountains of Christmas, "JUL" and "Anna" as
the page asks for them by default (equal squares, square cells): 172 cut cleanly
in both, 29 are hard in one or both, none is refused. The hard ones are serifs
with fine hairlines (Playfair Display, Bodoni Moda, Garamonds, Libre
Baskerville, Crimson Text, Noto Serif in four scripts, DM Serif Display, Abril
Fatface), slab serifs on "Anna" (Zilla Slab, and Alfa Slab One, which the
shipped "Plakat" is too), and scripts (Lobster, Lobster Two, Dancing Script,
Satisfy, Great Vibes, Zeyada, Shadows Into Light, Mountains of Christmas).
Median time 0.1 s, 90th percentile 3.9 s, slowest 33 s (Great Vibes; the picture
shows at once). Four families lack some of ÆØÅ, ÄÖÜ or É and say so when those
are typed. (A first sweep that let the generator choose letter-sized cells
counted 187 clean, with scripts taking up to 140 s.)

Not done: thickening thin families as Cinzel and Kalam are, which would need a
measure of each font's thinnest strokes.

## Larger circles on equal squares for animals

Product request (2026-10-20): the deer in "Cirkel · Lige store tern" stopped at
70% ("Ved 85 % kan figuren ikke væves…"). Above the touching circle the motif is
divided into four panels; the deer's panels held separate pieces (its legs), so
every division failed. The letter grid's routing for dots and islands now joins
them, tried after every other division. At 85% over the corpus: 44 clean, 3 hard,
4 refused (was 42, 5, 4); 20 solid motifs (the bell, the tree, simple stars) still
keep the touching circle, against 24 before: the heart, the Phosphor bird and fish
and the Tabler butterfly now take the large circle, and so does the deer. Motifs
that divided before keep their cuts. The corpus run took 42 s instead of 28 s,
the extra time spent on motifs that end at the touching circle anyway.

## Text in the checks and in the medallion

Product request (2026-10-20): two new text frames, one of them swapping the
checks like the figure in the checks. Two figure frames now take the text's
outline as their motif (`textFigure.ts`): each line centred under the one
before, its letters at their advances 0.08 em apart, 1.1 em between baselines,
every glyph exact, so the hard letters are still named. Considered and left:
the checked tips with the text (clean for short words, but a white field much
like the circle's, and refused for long words), rays, wedges and the sunburst
around text (hard or refused for lowercase, up to 27 s), letters made of whole
squares (every line inside a letter would have to be hidden), and initials in
the two lobes (the lobes are one sheet each).

**Text in the checks** (Tekst i ternene) is the figure in the checks at its
default size: the letters swap the board's squares, light on dark, dark on
light. Most texts were refused at first: a counter (the A's triangle, the ø's
halves) or a whole small letter alone in one square had no hidden cut, until
islands got the shortest ones (see the figure in the checks). The visitor's
strips are kept, hard to cut if need be; until then the first of four, five,
six and three that cuts cleanly, else the one keeping the most clearance.

**The circle with a double border** (Cirkel med dobbelt bort) sets the text in
the medallion in the other colour, in the figure frame's largest medallion
(80) at 75%: letters a fifth larger than at a figure's 70/70, and cut more
cleanly there (the Josefin Sans GOD JUL and anna hard at 70/70). At 80% the
Nunito anna is hard to cut, so the text keeps 75%.

Seven texts in Nunito, Josefin Sans and Bree Serif (GOD JUL on one line and
on two): clean or hard, the letters the warning names, the checks' strips per
side, and seconds on a heavily loaded machine (load 12–19), given only for the
medallion and where the checks' first board was clean:

| Text | Nunito checks | Josefin checks | Bree checks | Nunito medallion | Josefin medallion | Bree medallion |
|---|---|---|---|---|---|---|
| JUL | clean, 6 | clean, 4, 0.2 s | clean, 4, 0.2 s | clean, 0.3 s | clean, 0.2 s | clean, 0.8 s |
| GOD JUL | clean, 6 | hard G, 4 | clean, 6 | clean, 0.3 s | clean, 0.2 s | clean, 0.2 s |
| GOD / JUL | clean, 5 | hard GDU, 5 | hard GDL, 4 | clean, 1.7 s | clean, 0.5 s | clean, 0.3 s |
| NOEL | hard OL, 4 | clean, 5 | hard OE, 4 | clean, 0.3 s | clean, 0.2 s | clean, 0.2 s |
| ANNA | clean, 3 | hard A, 6 | hard N, 5 | clean, 0.2 s | clean, 0.1 s | hard A, 0.7 s |
| Søren | hard ør, 4 | hard Sør, 6 | hard Søren, 5 | hard ørn, 2.6 s | clean, 2.5 s | hard ren, 2.0 s |
| KÆRLIGHED | refused | refused | refused | hard KÆI, 1.3 s | hard Æ, 0.9 s | refused |

Text in the checks: 8 clean, 10 hard, 3 refused; 0.2 s where four strips cut
cleanly, else 0.8–7.6 s in an earlier, less loaded run, and 8–11 s to refuse
(each board tried is a whole heart). The medallion: 15 clean, 5 hard, 1
refused, 0.1–2.7 s; lowercase anna is clean in Nunito and Josefin Sans. The
pictures differ from the hearts in at most 0.4% of the square in the medallion
on seven strips (on eight there is none yet), and in the checks in at most
0.3%, but by 0.8–3% where the checks kept a smaller size than asked, which
the picture does not know (Søren in Nunito at 60%). A word of nine
letters on one line has letters too small for any board, and the page says
the frame cannot take that text; two lines (KÆRLIG / HED) are hard to cut on
five or six strips.

## The figure in the checks

Product decision (2026-10-18): the twelfth figure frame is the most common real
heart style the generator lacked, the figure formed by the strips themselves
(68 of 435 real figure hearts: notched stars, clovers, hearts). A regular board
of four strips per side swaps colour inside the motif; the board's lines and the
outline are all the visible cuts, and a search chooses each cut's sheet so that
every strip runs from edge to edge (`stripFigure.ts`). Without hidden cuts most
motifs have no such choice (an exhaustive check: the circle on three strips has
14 locally consistent choices and no whole strips), so a hidden cut shared by
both sheets may cross one of the motif's pieces of board, where the visible cut
beside each end changes sheet; by hand the circle on three strips needs one.
The search is conflict learning over the vertices' rules, with each strip edge
carrying its line's number through every vertex so it cannot turn back (that
alone took the alarm clock on three strips from 42,000 learned strips and no
answer in 10 s to a proof of none in 3 ms), and a closed loop learned when
found. It then asks for fewest crowded pairs of cuts, then fewest hidden cuts.

Over the 1,100 authored and Tabler motifs on 3–6 strips, before the clearance
work, 4,086 of 4,400 builds succeeded, median 14 ms; on four strips 1,083 of
1,100 (median 11 ms). The corpus at the default size, through the converter and
the editor's spacing check: at first 38 of 51 were hard to cut, from cuts
turning sharply where the outline crosses a line at a shallow angle, the outline
passing close to a junction, and short hidden cuts beside other cuts. Pieces
leaving a vertex at under 60°, or coming closer than the clearance after running
apart along one cut for twice it (the editor's measure), now go in different
sheets where possible; hidden cuts leave their sides at 60–120° and keep the
clearance from other cuts; the motif moves up to ten units down or up the
heart's middle (keeping a symmetric motif symmetric) to keep its outline off
the lines and junctions, judged on the clearest six places with both kinds of
hidden cuts. Outlines that touch (34 of 2,625 motifs) are separated, or
uncrossed and then separated, by a thousandth of the motif's size. Now **37**
clean and **14** hard to cut, none refused (the star, tree, heart, angel, bell,
gift, moon, house and flower clean), median 0.45 s, at most 2.5 s (the cookie).
The fixture has **1,706** entries.

Islands (2026-10-20). An outline crossing no line, such as a counter alone in
its square, needs two hidden cuts, between which it changes sheet; the
candidates from its face's sides, aimed at its centre, often leave it at a
sharp angle or too close to the outline around it, and with none the search
ends at once ("exhausted", nothing learned). Where they leave an island fewer
than two, it also gets the shortest hidden cuts from each side and island of
its face, once where they come nearest and once at least a quarter of the way
round from there. Over the corpus on four strips at the default size, 46
hearts are unchanged, the rabbit and the bicycle are now clean, and the coffee,
crown and apple are cut differently: **39** clean, **12** hard, none refused,
24 s in all instead of 25.

Sizes (2026-10-19). Up to the default size the motif keeps its place, so it
only grows with the slider. The fit to the paper measured the motif's reach
from its box's centre the same way up as down, so a heart's point never got
below 35 units down the middle (the lowest check starts at 35.4), and the star,
tree and angel did not grow at all from 85% to 100%. The fit now takes the
outline as it is, and above the default size the motif slides from its place to
where it fits largest, which 100% reaches: the heart's point reaches 66.5. At
some sizes no sheets keep every strip whole at the motif's place (both
snowflakes at 74–76%, the crown below 70%, the rabbit at 45%), and those were
refused; the motif now keeps the nearest size its place allows, a little
smaller, else in steps towards the default size, and only then moves. Over the
corpus at eleven sizes from 45% to 100% (561 hearts): none refused, 221 clean
and 340 hard to cut, ten moves of more than six units between neighbouring
sizes (there were dozens) and five shrinks (the sailboat from 90% to 95%; the
cat, crown, anchor and Tabler gift a little), at most 3.1 s. Separating touching
outlines measured the length along a ring afresh for every pair of points; with
running totals the butterfly at 45% takes 0.7 s instead of 10.5 s. The board has
three to six strips per side, four unless the visitor moves the Strimler
slider.

## The picture before the cuts

Product decision (2026-10-19): the visitor sees the heart at once and the cuts
follow. A woven heart's picture flips colour across every visible cut, so a
frame's picture is its board, its frame and its motif laid over each other,
even-odd (`picture.ts`); the slow part, choosing each cut's sheet and the
hidden cuts, does not change it. The page draws the picture while the worker
finds the cuts, and the finished heart replaces it. For the figure in the
checks the picture is exact: over the star, tree and heart on boards of 3–6
strips at 50–100%, the finished heart differs from its picture in under 1.5% of
the square, along the fitted curves, once the generator reports the size it
kept where the strips could not all be whole at the size asked for. The other
frames' outer patterns (rays, checks, sunburst, layers, corners, fitted grids,
wedges) come from their constructions and get pictures next. With an instant
picture the motif can be dragged: up and down the middle, as far as it keeps its
size.

## Strips for the small motifs and equal squares

Product decision (2026-10-19): the Strimler slider of the figure in the checks
also chooses the board of the small motifs (two to eight strips) and the equal
squares (three to nine, odd: the motif in the centre square, the middle one of
a row of empty cells). Over the corpus, the pattern that tops the small motifs'
four strips, the colour with the top and bottom squares, cannot hold the bell
or the angel, while the other colour's eight squares can; it is now tried
before fewer copies. Kept at four strips whatever the motif, the small motifs
were 24 clean, 20 hard to cut and 7 refused (51 motifs), against 41, 3 and 7
when a clean smaller board comes before a hard-to-cut larger one, so the frame
keeps choosing until the visitor does: 41 clean, 3 hard, 7 refused, as before,
27 on four strips, 6 on three, 11 on two, median 3.4 s. Strips the visitor
chooses are kept, hard to cut if need be: the star, tree, heart, angel and bell
are clean on every board from two to eight (at most 6 s), the gift and the
horse hard from three on (up to 14 s). Equal squares: 49 clean, 1 hard, 1
refused (the Tabler paw), as before, 62 s for all; on five, seven and nine
strips the star, tree, heart, angel, bell, horse and snowflake are clean in
under 0.1 s, while the gift, whose sides cannot meet the cells beside it,
keeps three strips and the page says so. Five-strip attempts before the cells
fitted to the motif never helped a motif that three could not hold (84 s
instead of 51 s), and the former finer board, whose checks came in two sizes,
is gone.

## Sizes that move one way with the sliders

Product decision (2026-10-18): dragging a slider must never make the motif or
its circle jump back. Sweeps of every figure frame (sizes 45–85%, space 0–15%)
over twelve motifs found hidden fallbacks that changed sizes: a circle moved 4%
further out when the space asked for was hard to cut (the cookie's rays: larger
at space 0 than at 3), small motifs changed their number of copies with the size
(the cookie's 2 copies became 3 smaller ones at 75%), and equal squares drew the
motif at the default size in their fallback recipes, a little larger in its cell,
or over a finer board (the rabbit 45.7 → 34.7 at 75 → 80%). Now a frame keeps
the space and size asked for, hard to cut if need be, and fallbacks that change
them run only when nothing at all can be finished; the board frames keep their
default size's choice of board at every size. At the defaults: rays and checks
50 clean and 1 hard (snow, whose circle had moved out), sunburst 49 and 2 hard
(snow, coffee), double border 50 and 1 hard (paw), the other open frames 51
clean each; equal squares 49 clean, 1 hard, 1 refused (paw), 51 s (the bicycle
28 s); small motifs 41 clean, 3 hard, 7 refused as before. Still jumping: the
gift on equal squares at 55–65% (none of our constructions builds its centre
square there; the photo solver does not settle whether any cuts could),
and a sunburst motif outgrowing the largest circle at 85%. The fixture has
**1,669** entries.


Full size (2026-10-19). The size slider stopped at 85% for every frame but the
figure in the checks. Swept over twelve motifs at 85–100%, the rays, checks,
wedges and fitted frames built every one, so they now go to 100%; over the
corpus at 100% that is 196 clean, 7 hard to cut and one refusal, the fitted
fish, which now keeps 97%, the largest a few percent below that can be built
(above 85% only). The sunburst, layers and corner checks refused twelve of the
48 builds above 85% (the gift, cat, candle, bicycle, flower and angel) and took
up to 21 s, so they keep 85% until their constructions can take larger motifs;
the silhouette and the circle on a board are as large as the square and the
board allow at 85%, and a motif on squares fills its square before that.
## Size and space around the figure in every frame

Product decision (2026-10-18): the two figure sliders often did the same thing
(the frame size scaled the motif a second time), and every frame should take a
size and a spacing. The frame-size slider is gone; "Luft om figuren" (0–15% of
the square, 3% by default) sets how far the circle, the wedges' tips, the corner
checks and the close-fitting frame's outer strips keep from the motif, and the
size slider scales the motif in every frame, including within the squares of the
board frames. At the page's defaults the figure corpus (51 motifs × 11 frames)
is 539 clean, 10 hard, 12 refused: the circle frames,
the corners and the close-fitting frame stay 51 / 51 (the sunburst 50 / 51).
Small motifs no longer try larger sizes than the visitor's (those retries made
them twice as slow, 349 → 774 s for the corpus); without them they take 299 s.
The circle on equal squares grows smoothly with the size, from radius 19 through
the circle touching the outer ring of squares (31.6, the default 70%) to 42, and
changes construction once, there. Its circle and motif only grow with the slider
(the star, the cookie and the cat measured at nine sizes): a size that cannot be
cut cleanly stays that size as hard to cut (the star at 72–76%, the cat beyond
the touching circle) instead of the motif jumping smaller. Outer gates the circle
passes inside of move in, so the cookie, whose cell reaches outside the circle,
is clean at every size. At the default: 45 clean (the rabbit joins, 0.3 s instead
of 21 s hard to cut), 2 hard (snow, the crown), 4 refused (the coffee cup, the
bicycle, the sun and the paw, in separate parts); the 51 hearts take 20 s. The
fixture has **1,673** entries.

## Letters of one size on the checkerboard; equal squares for figures

Product decisions (2026-10-18): checkerboard (Tern) letters were each scaled to
fill their own square, so PHILIP's I stood 55% taller than the H beside it and
MIA's I 66% taller than the M ("looks wrong"). Every letter of a text now has
the size of its widest. Figures get equal squares too: the motif in the centre
square of a regular 3×3 board (Lige store tern), and, with an extra layer and a
circle like the gallery's santa heart (whose lines are not evenly spaced), the
circle in the middle three strips of a regular 5×5 board (Cirkel · Lige store
tern). "Cirkel · Enkel" is removed: it joined a simple solid motif at two points
instead of four (a 2×2 heart), and for motifs with holes or several parts, which
every circle frame already joins at two points, it differed from Stråler or Tern
only by thinner spokes. Old links open with Stråler; its 51 fixture entries go.

**Text, checkerboard (216).** 179 clean / 37 hard, no refusals (176 clean
before). Nunito and Oswald William become hard to cut: the W sets the size, and
the other letters are about half of what they had alone. Five texts become clean
(Åse in Nunito, Oswald and Righteous, Kalam William, Cinzel B). When no layout
weaves cleanly, the first is tried with all letters 5% and 10% larger: without
that retry, eight fixture entries were lost. A result whose exported cuts keep
narrow paper tips is compared with the first layout 5% larger (Nunito ANNA stays
tip-free); triggering that comparison on raw rather than exported cuts had
doubled every text's time. Clean texts: median 0.65 s (0.77 s before), p90 4.2 s.
Hard results average 10.4 s, against 4.9 s for the same texts before, since the
larger sizes are tried first; only the standard size's rejected cuts go on to
the hard-to-cut fallback.

**Figures, equal squares (51 motifs).** 48 clean, 2 hard (snow, bicycle), 1
refused (Tabler's paw: five separate pads in one cell). Median 0.07 s, slowest
3.2 s. **Circle on equal squares (51).** 44 clean, 3 hard (snow, rabbit, crown;
the rabbit takes 29 s), 4 refused (coffee, bicycle, sun, paw: parts that neither
one cell nor four panels connect); small motifs, the other board frame, refuses
7. 23 motifs get the santa-sized circle reaching into the outer squares (the
cat, horse, house, flowers, smiley, gift); the convex ones, with no point of
background where four panels can meet, the smaller circle (star, heart, tree,
bell). Every straight cut of both frames lies on the board (tested).
**Space around the figure.** With the page's default 3% gap the silhouette and
the wedges stay 51 / 51 clean. The fixture now has **1,672** entries: the plain circle's 51 and the
two Williams leave it; 5 checkerboard texts and 92 equal-squares figures join.

## Equal squares on a regular board, as in Brodal's hearts

Product decision (2026-10-18): "Lige store tern" must mean what Gerth Stølting
Brodal's hearts show, one size of square across the whole heart. Square cells
had square checks, but not equal ones: each letter's cell moved up or down with
its accent or descender, the text was scaled to fit a circle so the outer strips
had another width, and the fallback recipes split letters into uneven panels.
Square cells without a frame now lie on a regular board: each cell is one
square's diagonal wide, a line of k characters on the middle row of k + 2
strips (JUL and amy on 5×5, like Brodal's JUL) and a block on columns + rows + 1.
Every straight grid cut lies on the board (checked numerically). Only recipes
that keep cells whole or split into square panels run; when those fail, the
letters may be 5% or 10% larger inside their unchanged cells. One-line words are
24–58% larger than with the old square cells. Letter-sized cells without a frame
now fill the heart like the board instead of a circle, so they stay at least as
large as the square ones (a single letter equally large).

**Text, square cells (432 configurations).** Close 185 clean / 31 hard,
spacious 170 / 46, no refusals. Compared with the uneven square cells this is
10 and 22 fewer clean results: mostly the handwriting font (Kalam) and accented
words, whose letters needed their outer connections moved (or panels split
unevenly), which the regular board does not allow. They remain hard-to-cut
results with the usual warning, and their letter-sized pair is clean. Those 32
square-cell entries leave the acceptance fixture, since square cells now mean
the regular board. **Letter-sized cells (432).** Close 200 / 16, spacious 198 /
18: no acceptance lost, and Cinzel JULEMAND newly clean. Times: median 0.1 s,
p90 5 s, slowest 24 s. The fixture now has **1,628** entries.

## Square or larger letters by choice; packed checkerboards on smaller boards

Product decisions (2026-10-18): which cells look better depends on the word
(square ones for J / UL / L, whose fitted checks become slanted rectangles;
fitted ones for lowercase jul, which square cells shrink to 61%), so the
close and spacious frames each come as a pair in the picker, square cells by
default. The circle keeps the automatic choice. Checkerboard lines first fill
their rows, so a triangle such as JUL / ul / b packs into a tip; and a 3×3
board may now use neighbouring junctions, so a full 3×3 diamond and the
3-2-1 triangle no longer need 4×4.

**Neighbouring junctions.** A junction's group switches only the pieces of its
four grid edges between the junction and its connections; from outside it
passes one cut of each sheet straight through, like a plain crossing. Two
junctions on one edge therefore compose when each keeps its connections in its
own half (connections up to a quarter square stay, farther ones are pulled in).
On 3×3 the four junctions are the corners of the centre square and each tip
square touches only one, so the tips needed this. It is used only when a board
connects no other way; the next board, without it, follows as the fallback, and
letter cells are now cached per board size (one text's layouts can now differ
in size; without that, a failed 3×3 attempt fed 3×3 letters to the 4×4 one).

**Text (1,296 configurations: 36 texts × 6 fonts × 6 frames).** Close, square
cells 183 clean / 21 hard; close, letter-sized 187 / 17; spacious, square 180 /
24; spacious, letter-sized 186 / 18. No refusals. The letter-sized results equal
the earlier automatic ones; every earlier clean close or spacious entry is clean
in at least one of its pair. No corpus text changes its checkerboard placement
or board. The two added texts, J / UL / JUL / UL / J and JUL / JU / L, are clean
in all 72 of their configurations, on 3×3 in the checkerboard (under a second
each). A comparison of 30 further 3×3-shaped texts (five texts × six fonts)
against the earlier rule: 19 now use 3×3 cleanly (three of them were hard on
4×4), two fall back to a clean 4×4, nine stay hard as before; none got worse.
Hard texts of this shape take longer, because the 3×3 layouts are tried in
full first (Cinzel S / OS / SOS 3.4 s → 14 s).

The acceptance fixture renames the close and spacious entries to their pairs
and adds the new texts: **1,659** entries.

## Frames from real hearts, square checks and up to six lines

Product decisions (2026-10-17): a photo study of 435 real figure hearts found
no diamond, hexagon, oval, soft-diamond or scalloped centre panel, so those five
shapes are gone from both figure and text frames (old links open with the
circle). Three frames real hearts do use were added: **wedges** (a quarter of
them), a **large silhouette** and **small repeated motifs**. Background checks
should be squares, symmetric motifs should get symmetric frames, the text box
takes six lines, and the checkerboard keeps lines centred before the block.

**Figures (510 configurations, 51 motifs × 10 frames).** Rays, checks, plain,
checked tips and the double border: 51 clean each. Sunburst: 50 clean, the
coffee cup hard (as before). Close-fitting: **51 clean**, up from 48: tied
extremes (a star's two lower tips) first share a symmetric gate, kept only when
it leaves no needle-sharp paper; the butterfly now gets a 5×5 grid, and the
two multi-part motifs no cell grid connects (bicycle, coffee cup) fall back to
three lanes ending above and below the motif (4×4), with the frame's legs from
there, after the close-fitting retries.
Wedges: 51 clean (wedge tips 3, then 1.5, then 0 units from the motif).
Large silhouette: 51 clean. Small motifs: 41 clean, 3 hard (snow, Tabler paw
and butterfly) and 7 refused (Phosphor butterfly, rabbit, coffee, bicycle,
crown, sun, Tabler gift: too detailed for a checker square even on 2×2). Boards
used: 4×4 for 19 motifs, 3×3 for 14, 2×2 for 11. Times, on a shared machine at
load 25–35: median 0.17 s for the other frames, 3.1 s for small motifs (p90
15 s; the slowest, 58 s, is the refused rabbit). No earlier acceptance was lost.

**Text (816 configurations).** Woven 187 clean / 17 hard, spacious 186 / 18,
circle 188 / 16, checkerboard 164 / 40. No refusals (Cinzel Hej! in the
spacious frame was refused by fitted cells and is now a hard result through
the square-cell last resort) and no lost acceptances. Square cells are as wide
as the widest letter, so narrow letters leave gaps: William keeps only 54% of
its letter size, JUL 79%. Square cells are therefore the first, quick attempt
only when they keep at least 85% of the letter size (ANNA, J / UL / L); other
words start with the established fitted cells and try square ones before a
hard result. Either way a word's earlier clean result is kept. Woven, spacious
and circle text take a median of 0.1 s (p90 5.5 s, slowest 35 s for a hard
Cinzel word) on the loaded machine. The checkerboard's new placement order changed no
acceptance; its one regression (Bree Serif Å alone) is fixed by trying the next
placement before a hard result. Cinzel 2026 is newly clean in the woven and
spacious frames. The acceptance fixture keeps the 1,076 entries of the remaining
frames and adds 148 (51 wedges, 51 silhouettes, 41 small motifs, three
close-fitting figures, two texts): **1,224** entries.

**Validation.** Type check: zero errors (the seven existing Svelte warnings).
Lint and the production build pass. The full unit run (one worker) passes all
**1,049** tests in 72 files, and the inverse suite all 177. On the way, forced
symmetric gates had changed two close-fitting results (Tabler butterfly tips,
sailboat grid); keeping symmetric gates only when they add no needle-sharp
paper, and trying lanes after the close-fitting retries, restored both. The
figure picker was checked in the browser at 1,400 and 390 px, in Danish and
English. Six lines work in every text frame: six lines of ten letters make a
clean 17-strip woven, spacious or circle heart in under a second, and a clean
13×13 checkerboard in 27 s.

## Never refuse a weavable heart; one checkerboard without repetition

Product decisions (2026-10-17): keep exact glyph outlines and do not refuse a
heart whose weave and picture can be made. Instead show a warning that names
the letters making it hard to cut, so the visitor can change them. Remove the
repeating letter frame ("Gentag som mønster"); the checkerboard frame ("Tern",
formerly "Gentag med tern") places the typed text once.

**Why the refusals happened.** Cinzel caused 179 of the 262 corpus refusals.
Its serif terminals are narrower than the paper clearance at the sizes these
words need. Each such terminal needs its own gate connection at its tip (an
invisible chord from the tip would leave a sliver), and a four-port letter cell
has four gates. At the failing sizes Cinzel E, e, F and R have five thin
terminals and f has six; 120 of the 256 text refusals contained a letter cell
with more than four. No connection choice can make those cuts clear.

**Hard-to-cut results.** When every clean construction fails, the generator
finishes the rejected constructions with cuts at least 10%, 3% or 1% of the
clearance apart, keeping exact outlines, frame, topology and fidelity checks,
and returns the one keeping the widest spacing, then the fewest strips with
narrow paper, then the fewest sharp tips. The editor's check gained an optional
resolution: bends and loops shorter than the full clearance stay part of one
cut at every spacing; without it, tiny glyph edges were flagged at 1%. The
result names the letters beside its narrow paper, found by matching placed
outlines to glyph contours. Examples: Cinzel circle OSCAR (S, R), Sofie (S, f,
e), JULEMAND (E), 2026 (6), A-B (B), ÆØÅ (Æ); the coffee cup in hexagon-rays
(no letters). Clean results never take this path.

**Checkerboard.** The heart shows the board turned 45°, so each typed line now
sits on one horizontal row of the diamond, on the smallest board that fits:
JUL and abc are 3×3, ANNA 4×4, OSCAR 5×5, GOD JUL 7×7; abc / def needs 4×4 with
abc half a square left. Odd sides needed the 2×2 letter groups to move: each
letter joins a grid junction at one of its corners, junctions never share a grid
edge, and a letter between two junctions at opposite corners keeps a short
coincident cut across its other corner. The three best junction choices are
tried in turn when a letter leaves narrow paper; that fixed Kalam EMMA. All
**204** corpus configurations produce a design: **164 clean, 40 hard to cut,
none refused or invalid** (median 0.76 s, slowest 9.2 s, one process), against
154 / 50 for the previous rows. Two earlier clean results are now hard: Oswald
GLÆDELIG / JUL (both G's are forced to their side corners at the ends of the
widest row) and Kalam JULE / MAND (M at its top corner in every choice). The
acceptance fixture follows the new checkerboard set: **2,766** entries.

**Audit.** Regenerating all 2,231 accepted framed text and figure designs found
no visibly cropped letter or motif. 22 hexagon figure motifs cross the hexagon
line by up to 2.3 units, but that line is an invisible guide inside the rays;
every ink pixel outside it renders correctly.

**Validation.** Type check: zero errors (the seven existing Svelte warnings).
Lint and production build pass. The full unit run (one worker, 631 s) passed
1,186 of 1,187 tests; the failure was the old expectation that an extremely
thin figure ring is refused, which now returns a hard-to-cut result, and its
updated test passes. The inverse suite passes all 177 tests.

Not yet done: a full retest of the remaining baseline refusals (paused to keep
the shared machine responsive), and constructions for the few cases with no
valid topology at any spacing, such as some figures in the close-fitting circle.

## Fit difficult branched text within the selected frame

Four additional configurations now pass: Cinzel **ME** and **EM** in the
hexagon and scalloped frames. Each uses **8×8 strips**, with the original glyph
proportions, counters and frame. All four have zero detected needle tips below
30 degrees. The narrow-tip counts below 45 degrees are one (ME/scalloped),
three (EM/scalloped), four (ME/hexagon) and six (EM/hexagon).

The earlier guarded layouts could extend beyond the frame. The new final
fallback measures containment of the complete letter outlines, finds the largest
fit no wider than the established 84% layout, and keeps 94% of that scale to
leave space for the outside joins. It tries the two existing guarded row
profiles, retaining the full topology, export and 10% extra spacing checks.
This scales the letter group uniformly; it neither clips the serifs nor changes
the frame. Earlier successful layouts return first. Already-contained layouts
skip the extra construction. No inverse solver constructs these cuts.

The targeted audit covers **95 configurations: 45 accepted, 50 refused and zero
invalid accepted outputs**. All **41 earlier successes are exactly unchanged**;
the four recoveries are supplementary cases. Complete production generation
matches every inspected preview. All four pass JSON/SVG handoffs, raster
agreement and independent material connectivity checks, with zero certain or
possible detached core islands. Final material resolutions are 1,400–4,200;
some lower-resolution checks were uncertain. Each finished heart and both
cutting sheets were visually inspected. These checks do not establish physical
cutting ease, weaving ease or tear strength.

The merged corpus remains **2,888 accepted / 262 refused / zero invalid**.
This refreshes 54 overlapping-branch cases and retains 3,096 previous records;
the 41 supplementary cases are outside that corpus. The expected-ID fixture is
unchanged and matches all 2,888 successes. This is not a new full-matrix audit,
and support for all combinations remains unfinished.

Final type checking, lint and build pass, with seven existing Svelte warnings.
The full unit run reports **1,222 passes and one existing Oswald juleman timing
failure**: 5.497 seconds against its unchanged five-second limit. It took
706.03 seconds across 70 files. The same test passes alone in **3.82 seconds**.
All 1,223 unit cases pass across those runs, including five new regressions;
this is not a single fully green full-suite run. No test timeout was increased.
The separate inverse suite passes all **177 tests** in **90.04 seconds**.
Evidence in ignored `tmp/generator/`: `branch-fit-production-{audit,current}.json`,
`branch-fit-preview-{selected,metrics,material}.json`,
`branch-fit-preview-gallery-*.png` and `branch-fit-full-test.log`.

## Guarded text connections: avoid slivers beside panel seams

Fifteen additional text configurations now pass. All retain the original
font outlines and counters, with no detached cutouts. None has a detected
needle tip below 30 degrees; the narrow-tip count below 45 degrees is zero
to three.

| Font and text | Newly accepted frames | Strips per sheet |
|---|---|---:|
| Bree Serif ÆØÅ | scalloped | 6 |
| Cinzel LOVE | circle, diamond, hexagon, rounded, scalloped | 11 |
| Cinzel MEME | circle, oval | 12 |
| Cinzel MILLE | circle, hexagon, rounded, scalloped | 11 |
| Cinzel EVA | oval | 9 |
| Cinzel EM, ME | rounded | 8 |

The new fallback keeps extra attachments away from the actual clipped seams
and their endpoints, while retaining each seam's agreed contact. If ordinary
attachment choices are blocked, it uses allowed points along unchanged outline
edges. It replaces choices within the existing eight-choice fan and routing
budget. Neighbouring branch cells can use higher row divisions and a vertical
divider inside their common gap, avoiding a sliver shaved off a serif or a join
inside the narrowing bottom of a V. Earlier successful layouts return first.

Other nonrepeated text gets a final guarded two-panel fallback, including
multiline layouts. It retains the 20-strip cap. Both new recipes compare the
complete cutting sheets, require 10% spacing reserve and prefer fewer sharp
tips. The contour topology constructs the cuts; no inverse solver constructs
these patterns. The extra attempts are bounded, but failed inputs can still be
slow, and this work does not establish an overall latency improvement.

The independent boundary inspection caught a false success: Cinzel ME extended
outside the scalloped frame. New guarded layouts now check every complete
outline segment, including intervals between frame intersections, and reject
that crop. LOVE's oversized hexagon layout is rejected too; its selected 84%
layout remains exactly unchanged. Of 31 inspected size variants, those two
inputs had outside outline portions. Every selected final output is contained.
The new check applies to the new guarded constructions; it is not a fresh
containment audit of every established construction.

All fifteen final designs pass JSON/SVG handoffs, raster agreement, full-sheet
spacing and independent material connectivity checks. Final material resolutions
range from 1,400 to 6,000, with zero certain or possible detached core islands
on either sheet. Lower-resolution checks were sometimes uncertain. Every full
heart and both cutting sheets were visually reviewed. These digital checks do
not establish physical cutting ease, weaving ease or tear strength.

The targeted audit covers 195 configurations: all 152 previously refused
nonrepeated corpus configurations, ten established overlapping-branch successes and
33 supplementary cases. Its final result is **40 accepted / 155 refused / zero
invalid accepted outputs**, including fifteen recoveries. All 25 established
successful designs are exactly unchanged. The initial audit had sixteen nominal
recoveries; after finding the cropped ME, complete generation was rerun for all
sixteen on the final source. Fifteen match the inspected previews exactly and
ME is refused. The other refusals are retained where the additive recipes fail;
the final containment guard cannot turn those failures into successes.

The merged corpus is **2,888 accepted / 262 refused / zero invalid**: text is
**1,772 / 256**, and figures remain **1,116 / six**. The expected-ID fixture
matches all 2,888 accepted IDs. This refreshes 162 records and retains 2,988 from
`joined-branches-current.json`; supplementary cases are excluded. This is not a
fresh full-matrix run. The larger catalogue and nondefault sizes remain
incompletely audited, and supporting all combinations remains unfinished.

Final type checking, lint and production build pass, with seven existing Svelte
warnings. The focused tests pass all 32 cases. The final frozen-source unit run
reports **1,217 passes and one existing Oswald juleman timing failure**: 5.604
seconds against its unchanged five-second limit. The run took 679.19 seconds
across 70 files. That same test passes alone in **4.44 seconds**. All 1,218 unit
cases pass across those runs; this is not a single fully green full-suite run.
No existing test timeout was increased. The separate inverse suite passes all
**177 tests** in 101.90 seconds.
Evidence in ignored `tmp/generator/`: `guarded-production-{audit,final-audit,current}.json`,
`guarded-production-final-previews.json`, `guarded-production-preview-{metrics,material}.json`,
`guarded-production-preview-gallery-*.png`, `guarded-containment.json` and
`guarded-hexagon-match.json`. Gallery 15 is the rejected cropped prototype;
galleries 0–14 are the fifteen unchanged final designs.

## Framed text: keep neighbouring branches connected

Cinzel **EMMA** now works in the circle, diamond, hexagon, rounded and scalloped
frames, using **11×11 strips**. The circle, diamond, rounded and scalloped
versions have **two detected tips below 45 degrees**; the hexagon has four.
None has a detected needle tip below 30 degrees. Cinzel **EM** and **ME** also
work in the circle, diamond and oval at **8×8**. **EMA**, **EMME** and **EMIL**
work in the circle at 9×9, 12×12 and 10×10 respectively. These retain the
original glyph outlines and counters.

The previous irregular row layout could place two neighbours against a piece
where the assembly expected only one. A regular division could instead put an
invisible-cut junction inside the filled bottom of an M, or leave a tiny fragment
beside it. The new fallback keeps at most two centred columns aligned between
rows and tries higher horizontal divisions, at 20%/40% and 25%/45% of each
unbranched glyph's height. Existing stem-and-branch cells remain intact.
Components owning fixed seam contacts take priority as the main contour. The
seam guard applies to the actual clipped segment, allowing external approaches
on its extension without admitting extra attachments on the segment itself.

The fallback compares 90% and 84% frame widths and straight, 20% or 40% shared
curve handles. It retains 10% spacing reserve, prefers fewer sharp tips and
stops at zero. Only the existing contour-based overlapping-branch detector
enables these four layouts; there are no font-name or word-specific exceptions.
Established successful branch layouts return first. The 20-strip cap and all
conversion, topology and artwork checks remain in force.

The fourteen production designs above pass JSON/SVG handoffs and independent material
connectivity checks. Final material resolutions range from **1,400 to 6,000**;
some lower-resolution checks were uncertain. The final checks find zero certain
or possible detached core islands on either sheet. Every complete heart and
both cutting sheets were visually reviewed. A separate frame-containment check
found no outside outline samples in all 20 tested size/layout variants. Physical
cutting, weaving ease and tear strength remain untested.

The audit covers **69 cases**: all 54 corpus cases selected by the existing
overlapping-branch detector across every corpus font and decorative text frame,
plus 15 supplementary cases. It gives **19 accepted / 50 refused / zero invalid**,
including **14 recoveries**. Five established successes remain exactly unchanged;
all 19 accepted designs pass both handoffs. Every newly accepted final design
exactly matches its inspected and independently audited production preview.
The initial paired audit covered 66 cases with the 84% layout. The final audit
checks the complete 90%/84% recipe for all 69 cases, reruns complete generation
for successes, and retains 50 paired refusals where the final early recipe still
fails and the remaining constructions are unchanged.

The merged corpus is **2,882 accepted / 268 refused / zero invalid**: text is
**1,766 / 262**, and figures remain **1,116 / six**. The expected-ID fixture matches
all 2,882 accepted IDs. This refreshes 54 records and retains 3,096 from
`corner-lanes-current.json`; the 15 supplementary cases are excluded. It is not
a fresh full-matrix run. The larger catalogue and nondefault sizes remain
incompletely audited, and supporting all combinations remains unfinished.

Final type checking, lint, build and 18 focused tests pass, with seven existing
Svelte warnings. The full unit run reports **1,206 passes and one existing
Oswald juleman timing failure**: 5.534 seconds against its unchanged five-second
limit. The run took 655.35 seconds across 69 files. The same test passes alone
on the final source in **3.95 seconds**. All 1,207 unit cases pass across those
runs; this is not a single fully green full-suite run. No existing timeout was
increased. The separate inverse suite passes all **177 tests** in 94.76 seconds.
Evidence in ignored `tmp/generator/`: `joined-branches-preview-{selected,metrics,material}.json`,
`joined-branches-preview-gallery-*.png`, `joined-branches-frame-containment.json`,
`joined-branches-{audit,final-audit,current}.json`.

## Checked corners: divide a connected figure among the existing lanes

The Phosphor **crown** now works with checked corners, using **6×6 strips** and
**zero detected tips below 45 degrees**. Its three counters remain connected
through coincident cuts. Dividing the silhouette vertically lets the three
existing lanes carry different parts of the figure, instead of sending the
whole crown through the central lane while the other two pass around it.
The original artwork, checked tips and outer bands are retained.

The bounded fallback first tries quarter-width side pieces and approaches each
piece at its own height, then equal thirds with the ordinary contour chain.
Artificial clipping seams are stitched after routing. The full topology,
conversion and artwork checks remain mandatory, followed by a 10% spacing
reserve. Failed straight connections may use 20% or 40% shared-curve handles;
the algorithm prefers fewer sharp tips and stops at zero. The crown succeeds
with the first partition and no extra curve retry.

A contour-based detector recognizes one root with three unnested counters,
one wholly inside each quarter/half/quarter lane. That arrangement tries the
new construction first. Three paired runs produce **exactly identical designs**
while reducing generation from **2,225–2,679 ms to 249–309 ms** on this machine.
The detector was run over all 51 corpus motifs and matches only the crown;
there is no icon-name special case. A failed early attempt continues through
the existing constructions and is not repeated at the end.

The paired audit covers **78 cases**: all 51 checked-corner motifs, all 22 crown
frames, and the other outstanding figure failures. It gives **72 accepted / six
refused / zero invalid**. The crown is the only changed result; the other **77
complete outputs or refusals are identical**. All accepted designs pass both
JSON and SVG handoffs. The paired run preceded the priority detector; the final
crown was rerun three times, and the detector excludes all 77 unchanged records.
The final production crown exactly matches the inspected prototype. It passes
the independent material audit at resolution **1,400**, with zero certain or
possible detached core islands. The full heart and both cutting sheets were
visually inspected. Physical weaving ease and tear strength remain untested.

The merged corpus is **2,877 accepted / 273 refused / zero invalid**: text is
unchanged at **1,761 / 267**, and figures are **1,116 / 6**. The expected-ID fixture
matches all 2,877 accepted IDs. This refreshes 78 records and retains 3,072 from
`padded-support-current.json`; it is not a fresh full-matrix run. The larger
catalogue and nondefault sizes remain incompletely audited, and the goal of
supporting all combinations is not yet achieved.

Type checking, lint, build and all **43 focused frame tests** pass, with the
same seven existing Svelte warnings. The full unit run reports **1,198 passes
and one existing Oswald juleman timing failure**: 5.163 seconds against its
unchanged five-second limit. The same test passes on the final source when
run alone in **3.73 seconds**. All 1,199 unit cases pass across those runs;
this is not a single fully green full-suite run. No existing test timeout was
increased. The separate inverse suite passes all **177 tests** in 87.49 seconds.
Evidence in ignored `tmp/generator/`: `corner-lanes-{final-audit,current,priority,detector,material,metrics}.json`,
`corner-lanes-final-design.json`, and `corner-lanes-gallery-0.png`.

## Fitted figures: room for shared connections to separate parts

The Phosphor **sailboat** now works in the close-fitting frame, with **5×5 strips**
and **zero detected tips below 45 degrees**. Both original sailboat components
are unchanged. The shared connections start slightly outside the silhouette,
so a detached part can join a different point on the main outline instead of
forcing a return to the same support point. No visible enclosing shape is added.

This is a final fitted-only fallback for two to eight components. It tries two
or three local clearance units of outward offset, retaining all earlier valid
layouts. The complete conversion, topology and artwork checks still apply,
followed by a 10% spacing reserve and sharp-tip comparison. The first tip-free
result ends the retry; there are only two added construction attempts.

A paired audit of **76 cases** covers all **51 fitted motifs**, all **22 sailboat
frames**, and the other outstanding figure failures. It yields **69 accepted /
seven refused / zero invalid**. The sailboat is the only changed result; the
other **75 complete outputs or refusal codes/messages are identical**. Every
accepted result passed both JSON and SVG handoff checks. The final sailboat
exactly matches the audited prototype, which passed the independent material
check at resolution **1,400** with zero certain or possible detached core
islands. The full heart and both cutting sheets were visually inspected.
These digital checks do not establish physical weaving ease or tear strength.

The merged corpus is now **2,876 accepted / 274 refused / zero invalid**:
text remains **1,761 / 267**, and figures are **1,115 / 7**. The expected-ID
fixture exactly matches the 2,876 accepted cases. This refreshes 76 records
and retains 3,074 from `contour-approach-current.json`; it is not a fresh full
matrix run, nor a complete audit of the larger motif catalogue or nondefault
sizes. The broader goal of supporting all combinations remains incomplete.

Type checking, lint, build and all seven focused fitted tests pass, with the
same seven existing Svelte warnings. The full unit run reports **1,196 passes
and one existing Oswald juleman timing failure**: 5.530 seconds against its
unchanged five-second limit. The same test passes on the final source when run
alone in **3.76 seconds**. All 1,197 unit cases pass across those runs; this is
not a single fully green full-suite run. No existing test timeout was increased.
The separate inverse suite passes all **177 tests** in 93.22 seconds.
Evidence in ignored `tmp/generator/`: `padded-support-{audit,current,material,metrics}.json`,
`padded-support-production-39.json`, and `padded-support-gallery-0.png`.

The same research pass tested mean-outline attachment directions on the eleven
remaining non-Cinzel decorative-text failures and all eight previous figure
failures. Neither sweep recovered a combination. Moving direct silhouette gates
outward, rather than changing only their direction, produced the sailboat fix.
The text-direction, figure-direction and other padding experiments remain private.

## Text cutting quality: alternative approaches to divided letters

Cinzel **B** now has **zero tips below 45 degrees**, down from three, in the
circle, rounded and scalloped frames. Its diamond frame has **one**, down from
four. All four retain **6×6 strips** and the existing visible composition.
This is a quality improvement to already supported combinations; it does not
increase the acceptance count.

The generator tries one optional 2-column, 3-row layout per glyph, aiming its
attachment fans towards the clipped outline points. It changes the coincident
connections without deforming the letters. It runs only when a successful
ordinary recipe or panel retry has sharp tips and already has at least the
required number of strips. The alternative must improve the tip count, add no
strips, pass the complete conversion and fidelity checks, retain 10% spacing
reserve, and differ from the existing woven image by at most 0.2% at 240 samples.
Otherwise the original result is returned. The candidate for B in the air frame
would change the composition, so its existing cuts and two sharp tips are kept.

A paired comparison of **39 cases** covers B, ANNA, juleman and ÆØÅ in all six
fonts' circle frames, plus Cinzel B and BO in all eight nonrepeating frames.
It retains **37 accepted / two refused / zero invalid**. The four improvements
above are the only changed outputs; the other 35 complete outputs or refusals
are identical. After adding the appearance guard, all five initially changed
cases were rerun; the other 34 records are carried from the paired run because
the guard only discards changed alternatives. The four retained improvements
differ from the earlier woven images by less than 0.063% at 500 samples.

All four final production designs pass JSON and SVG handoffs and the independent
material audit at resolution **1,400**, with zero certain or possible detached
core islands. The finished hearts and both full cutting sheets were visually
reviewed. No physical weaving or tear-strength trial was performed. Evidence in
ignored `tmp/generator/`: `contour-approach-final-audit.json`,
`contour-approach-{material,metrics}.json`, and `contour-approach-gallery-*.png`.

The merged corpus remains **2,875 accepted / 275 refused / zero invalid**, with
39 audited records and 3,111 retained from `panel-reserve-current.json`.
`contour-approach-current.json` exactly matches the unchanged expected-ID fixture.
This is not a new full-matrix run. A separate 29-case experiment on remaining
framed-text refusals found no recoveries. Deeper relief beams, extra counter
attachments and reversible warped partitions were also investigated; none of
those experiments is part of production. Ablation showed that the useful B
improvement needs only the changed attachment direction.

Check, lint and build pass with seven existing Svelte warnings. The focused
selection passes all 15 matching tests, including the two new regressions.
The full single-worker unit run passes **1,194 tests**, with the existing Oswald
juleman repeat timing test taking **5.121 seconds** against its unchanged
five-second limit. That same test passes on the final source in isolation in
**3.95 seconds**. Thus all 1,195 unit cases pass across runs, but the full run is
not entirely green. The full run takes 630.11 seconds across 68 files, with no
source changes during or after it. The separate inverse suite passes all
**177 tests** in 87.42 seconds.

## Current coverage: clearance reserve and repeated-text checks

Oswald **ÆØÅ** now works in the hexagon frame with **6×6 strips**. Its original
construction passed nominal spacing but missed the extra clearance reserve.
A final repair reuses completed panels and curves only their coincident
connections, trying normal-approach handles of 20% and 40% of connection length.
It preserves the original outlines, attachment points, frame and sheet assignments,
and still requires the full topology, fidelity and 10% extra spacing checks.
Earlier successful layouts return before this repair.

The new result has **two tips below 30 degrees and five below 45 degrees**;
it is not a tip-free construction. The final production design is exactly equal
to the direct, unchanged-assignment prototype. It passes JSON/SVG handoffs and
the independent material audit at resolution **2,800**, with zero certain or
possible detached core islands. The 1,400-resolution audit was uncertain and
was not treated as a pass. The finished heart and both full cutting sheets were
visually reviewed. These checks do not establish physical weaving ease or tear
strength. Evidence in ignored `tmp/generator/`: `panel-reserve-production-7.json`,
`reserve-direct-{material,metrics}.json`, and `reserve-direct-gallery-0.png`.

Repeated-text generation now caches exact local spacing checks within a request:
a route's self-check separately from each ordered pair of neighbouring cuts.
The keys retain every coordinate, boundary extension, margin and scale, and each
cache is limited to 2,048 entries. The original validation order and acceptance
rules stay intact. A paired run of **48 repeated texts across all six fonts**
produces exactly the same **23 successes and 25 refusals**, including complete
accepted outputs and rejection codes/messages. Oswald juleman took 3,333 ms versus
3,781 ms in that comparison; total time across those 48 cases was 194,085 ms versus
211,535 ms. These paired measurements shared the machine with another audit and
are not isolated latency benchmarks.

The separate paired framed-text run covers **21 cases**, including all twelve
previously refused non-Cinzel decorative-frame cases, ÆØÅ in each font's hexagon,
and every Oswald ÆØÅ decorative frame. It yields **nine accepted / twelve refused /
zero invalid**; all **eight earlier accepted complete outputs are unchanged**.
The broader 34-group curve/assignment experiment and twelve-case wider-curve sweep
found no further recoveries. Assignment changes and the larger 60%/80% handles are
not part of production. Evidence: `panel-reserve-audit.json`,
`spacing-production-results.json`, `cycle-curves-results.json`, and
`reserve-wide-results.json`.

The merged corpus is **2,875 accepted / 275 refused / zero invalid**: text is
1,761 / 267; figures remain 1,114 / 8. `panel-reserve-current.json` refreshes 69
records and retains 3,081 from `horizontal-contact-current.json`. This is not a
fresh full-matrix run. The expected-ID fixture exactly matches these 2,875 cases;
the broader catalogue and nondefault sizes remain incompletely verified.

Check, lint and build pass, with seven existing Svelte warnings. All four new
focused tests pass. The existing Oswald juleman case timed out at 5.95 seconds
in the concurrent focused run and passed alone in 3.89 seconds under its unchanged
five-second limit. The initial cache integration missed two call sites; focused
tests caught the error, both calls were corrected, and the final paired run above
uses the corrected source. The full unit run completed **1,192 passing / one
existing timing failure** across 68 files in 630.32 seconds. Oswald juleman took
5.40 seconds against the unchanged five-second limit; its isolated 3.89-second
pass above uses the same final source. All 1,193 unit cases have a passing result
across these runs, but this was not one entirely green full run. All **177
inverse-engine tests pass**, in 86.69 seconds.
Logs: `panel-reserve-{focused,check,lint,build,oswald-isolated,tests,inverse}.log`.

## Previous coverage: stacked parts in a plain oval

The coffee motif now works in the plain oval with **4×4 strips**, no tips below
30 degrees and two below 45 degrees. Horizontal lanes keep the separate steam
marks above the wider cup instead of forcing both into vertical cells. The
nearest-contact construction assigns nearby facing arcs to opposite sheets;
the handle opens through coincident cuts. All original contours and the oval
boundary remain intact, with no cutouts.

The generator recognizes this arrangement from contour nesting and bounds,
without testing an icon ID, and tries it before the unsuitable vertical layouts.
A fresh paired run of all **51 default plain-oval motifs** accepts all 51; all
**50 previously accepted complete results are exactly unchanged**. Coffee took
407 ms, versus 2,580 ms before refusing, in this paired run. These figures are
observations from that run, not an isolated latency benchmark.

The production output is exactly equal to prototype 40 in
`contact-lanes-design-40.json`. It passes the 10% extra clearance check,
JSON/SVG handoffs and the independent material audit at resolution **1,400**,
with zero certain or possible detached core islands. The finished heart and
both complete cutting sheets were visually reviewed. These digital checks do
not establish physical weaving ease or tear strength. Evidence under ignored
`tmp/generator/`: `horizontal-contact-audit.json`,
`horizontal-contact-production-ph-coffee.json`, `contact-lanes-material.json`,
`contact-lanes-metrics.json`, and `contact-lanes-gallery-0.png`.

The merged corpus is **2,874 accepted / 276 refused / zero invalid**: text remains
1,760 / 268; figures are 1,114 / 8. `horizontal-contact-current.json` refreshes
51 plain-oval records and retains 3,099 from `chain-contacts-current.json`.
This is not a fresh full-matrix run. The broader catalogue and nondefault sizes
remain incompletely verified. The expected-ID fixture exactly matches these
2,874 accepted cases.

The three focused tests pass under unchanged time limits. Check, lint and build
pass, with seven existing Svelte warnings. The full unit run completed **1,188
passing / one timing failure** across 68 files in 641.97 seconds. The existing
Oswald juleman repeat case took 6.20 seconds against its unchanged five-second
limit; it passed alone in 4.33 seconds. All 1,189 unit cases have a passing result
across these runs, but this was not one entirely green full run. All **177
inverse-engine tests pass**, in 101.66 seconds.
Logs: `horizontal-contact-{focused,check,lint,build,tests,oswald-isolated,inverse}.log`.

## Previous coverage: nearly touching components in the checked-tip frame

The Tabler paw now works with the checked-tip frame, using **6×6 strips and no
tips below 45 degrees**. Its original vertical connections grazed the upper
toes, leaving a narrow return. A final fallback joins whole components at their
nearest boundary points and assigns nearby facing outlines to opposite paper
sheets. The assignment follows a contact forest, prioritizing the closest
pairs. All motif outlines, counters, frame geometry and strip counts remain
intact; the construction uses coincident bridges and no cutouts.

The final production output is exactly equal to the audited prototype. It
passes the 10% extra clearance check, JSON/SVG handoffs and the independent
material audit at resolution **1,400**, with zero certain or possible detached
core islands. The finished heart and both full cutting sheets were visually
reviewed. These are digital connectivity checks, not physical weaving or tear
tests. Evidence: `chain-contacts-production-tb-paw.json`,
`chain-contacts-{material,metrics}.json`, and `chain-contacts-gallery-0.png` under
the ignored `tmp/generator/` directory.

A fresh paired run of all **51 default checked-tip motifs** gives **50 accepted /
one refused / zero invalid**. All **49 previously accepted complete outputs are
exactly unchanged**. The crown still refuses. Paw generation took 1.85 seconds
in this audit, not an isolated latency benchmark. `chain-contacts-audit.json`
records both versions and the exact prototype comparison.

The merged corpus is **2,873 accepted / 277 refused / zero invalid**: text is
unchanged at 1,760 / 268; figures are 1,113 / 9. `chain-contacts-current.json`
refreshes those 51 records and retains 3,099 from `branched-current.json`.
This is not a fresh full-matrix run. The broader catalogue and nondefault sizes
remain incompletely verified.

The four new focused tests pass with unchanged time limits. Check, lint and build
pass with seven existing Svelte warnings. The full unit run completed **1,185
passing / one timing failure** across 68 files in 648.58 seconds. The existing
Oswald juleman repeat regression took 5.99 seconds against its unchanged
five-second limit; it passed alone in 4.47 seconds without source or timeout
changes. All 1,186 unit cases have a passing result across these runs, but this
was not one entirely green full run. All **177 inverse-engine tests pass** in
88.62 seconds.
Logs: `chain-contacts-{focused,check,lint,build,tests,oswald-isolated,inverse}.log`.

## Previous coverage: overlapping serif branches

An E's middle and lower serif ends can overlap vertically. Rectangular panels
clip those ends into tiny fragments, even when the main strokes have room.
The new construction separates a connected stem from its three branches,
clips only the stem between their actual attachment heights, and gives each
complete branch its own cell. Neighbouring letters use ordinary panels with
extra columns for separate parts. Inter-letter joins stay within their common
vertical interval, avoiding nearest-corner attachments at another row's seam.
All original contours and the selected frame remain intact; there are no cutouts.

Cinzel **Hej!** now works with the **circle, diamond, hexagon, rounded and
scalloped** frames, using ten actual strips per sheet. Four frames have no tips
below 45 degrees; the hexagon has four, none below 30 degrees. A standalone
Cinzel **E** also works in all six decorative frames with six strips per sheet:
its hexagon has one tip below 45 degrees, and the other five have none. E is
additional coverage outside the fixed 3,150-case corpus.

A cached detector recognizes overlapping branch extents in the original glyph
and selects this construction before trying generic rectangular layouts. The
first late-fallback draft passed geometric checks but timed out in all eleven
new regression tests. Moving the topology-specific construction first fixed
that delay without changing any timeout. Other topologies retain the earlier
recipe order. The detector matches none of the corpus's 1,098 previously
accepted decorative-frame text cases, and the final implementation regenerated
47 earlier results exactly, including all six fonts' ANNA checkerboards, their
six decorative frames, and the five preceding ordinary-repeat recoveries.

All eleven final production captures pass the 10% extra clearance check,
JSON/SVG round trips and independent material audits at resolution 1,400, with
zero certain or possible detached core islands. The finished hearts and both
complete cutting sheets were visually reviewed. These are digital checks, not
physical weaving or tear tests. Final generation took 0.115–0.843 seconds in
this audit; this is not an isolated benchmark or a speed fix for every input.
Evidence: `branched-final-production.json`, `branched-final-{material,metrics}.json`,
`branched-final-gallery-0..10.png`, `branched-final-preservation.json`, and
`branched-detector-audit.json`, all under the ignored `tmp/generator/` directory.

The merged corpus is **2,872 accepted / 278 refused / zero invalid**: text is
1,760 / 268, figures 1,112 / 10. `branched-current.json` retains 3,048 older
records and refreshes 102 previously refused framed, single-line text cases.
Five successes are from final production; 97 refusals are retained from the
late-fallback draft, before the construction-order change. That draft's full
108-case run also included the six standalone E cases. This is not a fresh
full-matrix run. The broader catalogue and nondefault sizes remain incompletely
verified.

The focused final run passes all 30 selected tests, including the eleven new
regressions, with the original timeouts. Final check, lint and build pass with
seven existing Svelte warnings. The full unit run completed **1,181 passing /
one timing failure** across 67 files in 626.68 seconds. The existing Oswald
juleman repeat regression took 5.65 seconds against its unchanged five-second
limit while the broader audit was running. It passed alone in 4.12 seconds
without source or timeout changes. All 1,182 unit cases therefore have a passing
result, but this was not one entirely green full run. All **177 inverse-engine
tests pass** in 89.60 seconds. Logs: `branched-tests.log`,
`branched-oswald-isolated.log`, `branched-inverse.log`, and
`branched-final-{focused,check,lint,build}.log`.

## Previous coverage: detached dots in repeated text

A detached dot or accent previously kept a fixed assignment of its outline arcs
to the two paper sheets. Reversing that assignment can separate the dot from a
nearby stem on the same sheet. A final repeat-only fallback now tries that
alternative, choosing the active gate separately for each cell. It first
reuses completed cells, then compares a fresh alternative layout if needed to
avoid retaining narrow tips. Earlier successful whole hearts return first.
The exact glyph outlines and cyclic letter field stay intact; there are no
cutouts or additional visible squares.

Five previously refused ordinary-repeat combinations now pass:

| Font | Text | Physical strips | Tips below 30° / 45° |
| --- | --- | --- | --- |
| Bree Serif | Hej! | 8×4 | 0 / 0 |
| Righteous | Hej! | 8×4 | 0 / 0 |
| Righteous | juleman | 14×7 | 0 / 0 |
| Oswald | Hej! | 8×4 | 0 / 2 |
| Oswald | juleman | 14×7 | 1 / 5 |

All five production captures pass the 10% extra clearance check, JSON/SVG
handoffs, and the independent material audit with zero certain or possible
detached core islands. Righteous Hej! passes at resolution 1,400; Bree Serif
Hej! and Oswald Hej! at 2,800; both juleman designs at 6,000. Lower-resolution
uncertain results were retained and were not counted as passes. The finished
heart and both full cutting sheets were visually reviewed for all five. These
are digital checks, not physical weaving or tear-strength tests. Evidence:
`dotted-phase-final-production.json`, `dotted-phase-{metrics,material}.json`,
and `dotted-phase-gallery-0..4.png`.

The final implementation freshly reran all **51 previously refused ordinary
repeat cases**: **five accepted / 46 refused / zero invalid**. It regenerated
and compared 15 selected earlier successes exactly, including the ANNA
checkerboard and previous dotted-letter recoveries. A broader comparison of an
earlier draft left all 147 existing ordinary-repeat successes and six ANNA
checkerboards exactly unchanged; the final per-cell refinement was added after
that broader run. The draft comparison resumed from seven saved comparisons
after a temporary disk-space error; all 153 comparisons were completed.

The merged corpus is **2,867 accepted / 283 refused / zero invalid**: text is
1,755 / 273; figures remain 1,112 / 10. `dotted-phase-current.json` refreshes
those 51 records and retains 3,099 from `offset-fitted-current.json`. This is not
a fresh full-matrix run. Other sizes and the broader catalogue remain
incompletely verified. The new successful cases took 0.23–3.73 seconds during
the audit; this is not an isolated latency benchmark or a general speed fix.

The first phase prototype inadvertently reversed the island arcs in both of
its nominal modes because it compared an undefined flag directly with a
boolean. Its outputs are exploratory only. The production code uses explicit
booleans, has separate preservation comparisons, and received the material and
export audits above. The final per-cell routing reduced Oswald Hej! from seven
narrow tips in the first production candidate to two, and Oswald juleman from
six to five.

All **1,171 unit tests across 67 files** pass in one full run with unchanged time
limits (630.56 seconds), followed by **177 passing inverse tests** (97.09
seconds). This includes all five new generator regressions. Check, lint and the production build pass with the seven existing Svelte
warnings. Final logs: `dotted-phase-{tests,check,lint,build}.log`.

## Previous coverage: paw with a fitted grid

The fitted paw's convex-envelope attachment lay too close to a neighbouring toe.
Moving the invisible attachment outward clears that collision. A final fallback
offsets the envelope's supporting lines by two or three local clearance units
and gives shared cuts shorter normal approaches. The motif never moves, no
surrounding outline is added, and the entire expanded envelope still undergoes
the artwork check. Completed cuts require the same 10% extra clearance.

This recovers the Tabler paw with **7×7 strips and no tips below 45°**. JSON/SVG
handoffs pass. The production design passes the independent material audit at
resolution **4,200**, with zero certain or possible detached core islands; the
1,400 and 2,800 results were uncertain and were not counted as passes. Its
finished heart and both cutting sheets were visually reviewed. Evidence:
`offset-fitted-{metrics,material}.json`, `offset-fitted-production-tb-paw.json`
and `offset-fitted-gallery-0.png`. This is digital connectivity validation, not
physical weaving or tear-strength testing.

The direct prototype and production output differ by at most 5.69e-14 internal
coordinate units and eight smooth/corner editor tags, caused by the different
order of floating-point operations when shortening handles. Consequently the
production output received its own handoff and material audits; it is not
reported as an exact prototype match (`offset-fitted-prototype-diff.json`).

All **51 default fitted motifs** were freshly compared with the previous
generator: **47 accepted / four refused / zero invalid**. All **46 previously
accepted complete outputs are exactly unchanged**. Butterfly, coffee, bicycle
and sailboat still refuse. Paw generation took 0.93 seconds during the resumed
audit, not an isolated latency benchmark. The comparison resumed after its
exact-prototype assertion detected the roundoff/tag differences above; already
recorded old/new comparisons were retained, and comparisons for all 51 were completed.

The merged corpus is **2,862 accepted / 288 refused / zero invalid**: text is
unchanged at 1,750 / 278; figures are 1,112 / 10. `offset-fitted-current.json`
refreshes 51 fitted records and retains the other 3,099 from
`frame-route-current.json`. This is not a fresh full-matrix run. Other sizes and
the broader searchable catalogue remain incompletely verified.

The first 120 offset-envelope trials recovered no designs with the extra
clearance reserve. Shorter shared-cut approaches recovered the paw in a further
180 trials across all five remaining fitted motifs. The production fallback
tries the two useful padding distances and handle lengths, preserves earlier
working layouts, and stops once no narrow tips remain.

All **1,166 unit tests across 67 files** pass in one full run with unchanged time
limits (600.71 seconds), followed by **177 passing inverse tests** (87.57 seconds).
Both focused regressions pass. Check, lint and production build pass with the
seven existing Svelte warnings. Logs are
`offset-fitted-{focused,tests,check,lint,build}.log`.

## Previous coverage: paw in the sunburst frame

A wide component grid could send its inner frame leads through the outer
sunburst circle. A final fallback now detours those leads around cuts on their
own sheet. Crossings with the other sheet remain allowed; shared cuts belong to
both. Both circles, the motif and every paper-edge endpoint remain fixed. The
bounded routing uses 20% extra construction clearance; the completed, fitted
heart must retain 10% extra clearance and is ranked by sharp-tip counts.

This recovers the Tabler paw with **9×9 actual strips and no tips below 45°**.
The complete production design exactly matches the audited prototype. JSON/SVG
handoffs pass, and the independent material audit passes at resolution **4,200**
with zero certain or possible detached core islands. At 1,400 and 2,800 the audit
was uncertain on one sheet; those results were not counted as passes. The heart
and both full cutting sheets were visually reviewed. Evidence is in
`frame-route-{audit,metrics,material}.json`, `frame-route-production-tb-paw.json`
and `frame-route-gallery-0.png`. These are digital checks, not physical weaving
or tear-strength measurements.

All **51 default sunburst motifs** were freshly compared with the previous
generator: **50 accepted / one refused / zero invalid**. All **49 previously
accepted complete outputs are exactly unchanged**. Coffee still refuses. Paw
generation took 3.86 seconds during the audit, which was not an isolated latency
benchmark.

The merged corpus is **2,861 accepted / 289 refused / zero invalid**: text is
unchanged at 1,750 / 278; figures are 1,111 / 11. `frame-route-current.json`
refreshes the 51 sunburst records and retains the other 3,099 from
`sunburst-square-current.json`. This is not a fresh full-matrix run. Other sizes
and the broader searchable catalogue remain incompletely verified.

Moving the component dividers to wider coordinate gaps recovered none of 108
trials. Moving fitted-grid ray origins toward their components recovered none
of 60 trials. Those experiments are not included. The new production fallback
runs only after established sunburst layouts fail; the shared-cut routing keeps
its previous obstacle rules and candidate order.

All **1,164 unit tests across 67 files** pass in one full run with unchanged time
limits (603.25 seconds), followed by **177 passing inverse tests** (87.32 seconds).
Both focused regressions pass. Check, lint and production build pass with the
seven existing Svelte warnings. Logs are
`frame-route-{focused,tests,check,lint,build}.log`.

## Previous coverage: stars and snowflake in the sunburst frame

The sunburst's slanted inner projections could pass about 0.2 units from a
corner of its outer circle, even when the motif's own cuts were clear. A final
fallback now tries two panels, horizontally or vertically, with axial frame
projections. Both circles, the motif and its counters remain fixed. Local
routing counts the outer band's two extra strips per sheet, and the complete
fitted cuts must retain 10% extra clearance.

This recovers Tabler stars and the authored snowflake, both with **6×6 grids**.
Stars has no cutting tips below 45°. Snowflake has seven below 45° and none below
30°, so it remains an intricate pattern. Their complete production designs
exactly match the audited prototypes. Both pass JSON/SVG handoffs and the
independent material audit at resolution 1,400 with zero certain or possible
detached core islands. The finished hearts and both cutting sheets were visually
reviewed (`sunburst-square-{audit,metrics,material}.json` and
`sunburst-square-gallery-{0,1}.png`). This does not establish physical tear
strength or ease of weaving in paper.

All **51 default sunburst motifs** were freshly compared with the previous
generator: **49 accepted / two refused / zero invalid**. Every one of the 47
previously accepted complete results is exactly unchanged. Full production
capturing of the two recoveries took 4.77 seconds for stars and 1.96 seconds for
snowflake in that audit; these were not isolated latency benchmarks. The coffee
and Tabler paw sunbursts still refuse.

The merged corpus is **2,860 accepted / 290 refused / zero invalid**: text is
unchanged at 1,750 / 278; figures are 1,110 / 12. `sunburst-square-current.json`
refreshes 51 records and retains the other 3,099 from
`text-envelope-current.json`. This is not a fresh full-matrix run. Non-default
sizes and the broader searchable catalogue remain incompletely verified.

Simply counting the extra strips, with the earlier slanted projections, recovered
none of 672 panel trials. Axial projections recovered the two motifs in a further
336 trials. A separate 54-trial component-layout experiment recovered neither
remaining coffee nor paw case and is not included. The production fallback tries
only the two useful panel layouts; previously working designs return first.

All **1,162 unit tests across 67 files** pass in one full run with unchanged time
limits (585.72 seconds), followed by **177 passing inverse tests** (88.33 seconds).
The two focused regressions also pass. Check, lint and production build pass with
the seven existing Svelte warnings. Logs are
`sunburst-square-{focused,tests,check,lint,build}.log`.

## Previous verification: reuse relief-cut ordering

The relief-cut generator now ranks each chord once for a fixed set of attachment
ports, then reuses that order during compound relief. Every attempt still filters
out endpoints occupied by its current shared cuts. This cache belongs to one
unchanged contour construction and does not survive a design edit. It changes
neither the candidate order nor the acceptance checks.

Four paired complete generations of Oswald `ÆØÅ` in oval/scalloped frames took
**56.74 seconds before / 53.80 seconds after** in total, about 5.2% less time.
The second round reversed the old/new execution order. All four complete outputs
were exactly identical (`relief-order-benchmark.json`). This is a small measured
improvement on two difficult designs, not a general latency guarantee.

A broader replay compared **520,983 yielded candidates in 52,022 relief calls**
across 13 complete requests, including difficult Kalam repeats, Nunito ANNA
checkerboard, coffee and paw figure frames. Every candidate and complete design
remained exactly identical (`relief-order-broad.json`). Time in that stage was
46.13 seconds before / 43.79 seconds after; that excludes the rest of generation.

No additional combinations were recovered. The authoritative merged corpus is
still **2,858 accepted / 292 refused / zero invalid**, from
`text-envelope-current.json`; this is not a fresh full-matrix run. Neither the
empty-panel experiment (229 trials), deeper text partitions (833 trials across
163 remaining framed/unframed text cases), nor component-based whole words
(80 trials) produced a valid new design. Those alternatives are not in production.
Caching complete letter routes was also omitted: only two of 161 calls repeated
exact inputs in each of the measured difficult requests.

All **1,160 unit tests across 67 files** pass in one full run with unchanged time
limits (607.07 seconds), followed by **177 passing inverse tests** (86.23 seconds).
Check, lint and production build pass with the seven existing Svelte warnings.
Logs are `relief-order-{tests,check,lint,build}.log`. The complete test-suite time
is not a paired performance comparison; the speed measurement above applies
only to the four explicitly paired generations.

## Previous coverage: more room inside text frames

Oswald `ÆØÅ` now also works in the oval and scalloped frames. After all existing
layouts fail, the panel fallback may use 94% of the frame's available envelope
instead of 88%. The original glyph proportions, counters and frame boundary
remain unchanged. The completed cuts must still have 10% extra clearance,
including the connections outside the letters. Unframed text and previously
successful layouts keep their original fit.

Both new designs use six strips per sheet and retain two tips below 30°; they
are not tip-free patterns. Their complete production designs exactly match the
audited prototypes, pass JSON/SVG handoffs, and pass the independent material
audit at resolution 2,800 with zero certain or possible detached core islands.
Both finished hearts and both sheets were visually reviewed. See
`text-envelope-production.json`, `text-envelope-material.json`,
`text-envelope-metrics.json` and their captures/galleries. This is a digital
connectivity audit, not physical weaving or tear-strength testing.

The larger-fit fallback was tried against all **128 remaining refused shaped
text cases**: two pass and 126 still refuse. Full production verification covers
both successes and the five cases recovered in the previous change; all five
earlier designs are exactly unchanged. The merged corpus is **2,858 accepted /
292 refused / zero invalid**: text 1,750 / 278; figures 1,108 / 14. Seven records
have fresh full-production results and 3,143 retain their earlier evidence
(`text-envelope-current.json`). This is not a fresh full-matrix run.

Alternative accent roots, extra paired connections between detached components,
and counter-centred text partitions still failed topology or spacing checks and
were not added to production. Difficult-case latency remains unfinished.

Relief-cut generation now reuses notch ray targets and outline-edge positions
within one unchanged contour construction. A separate endpoint lookup checks
each candidate against its current shared cuts. The cache does not survive the
construction or alter candidate ordering. A replay checked **520,983 yielded
candidates in 52,022 calls across 13 complete requests**, including difficult
Kalam repeats and figure frames. Every candidate and complete design stayed
exactly identical (`envelope-relief-broad.json`). Time inside that stage fell
from 85.63 to 45.00 seconds; this is not total generation time.

Before caching, the new scalloped-frame regression timed out at 20.90 seconds.
After caching, both new frame tests pass under their unchanged 20-second limits;
their combined test time fell from **33.16 to 26.46 seconds** in these focused
runs (`text-envelope-focused.log`, `text-envelope-cached-focused.log`). This
single comparison is not a general latency guarantee.

The final production oval/scalloped captures remain exactly identical to the
material-audited designs after caching, taking 11.14 and 15.20 seconds in a
separate run (`text-envelope-final-production.json`). All **1,160 unit tests
pass in one full run**, including the previously timing-out Kalam EMMA repeat,
with unchanged time limits, in 585.97 seconds (`text-envelope-cached-tests.log`).
The same run also passes all **177 inverse tests** in 87.43 seconds. Check,
lint and production build pass with the seven existing Svelte warnings.

## Previous coverage: clipped accents and serifs in text panels

A final framed-text fallback now divides each glyph into two panels and follows
the clipped component that owns the seam gate, retaining the correct alternating
paper phase. Slightly smaller inter-letter padding leaves more space for the
unchanged glyph strokes. Four bounded layouts are tried, after existing valid
constructions have already returned. Repeat and checkerboard text are unchanged.

This recovers **five cases**: Oswald `ÆØÅ` in air, circle, diamond and rounded
frames, and Cinzel `BO` in the hexagon. Each uses six strips per sheet, with the
original letters, counters and frame. Oswald retains two cutting tips below
30°; Cinzel has one below 30° and six below 45°. These are not tip-free patterns.
The additional 10% full-sheet clearance reserve is required after rounding.

All five final production designs exactly match the successful prototypes.
They pass JSON/SVG handoffs and the independent material audit with zero certain
or possible detached core islands: Oswald's circle, diamond and rounded cases
resolve at resolution 2,800; air and Cinzel pass at 1,400. All five finished
hearts and both cutting sheets were visually reviewed. Evidence is in
`panel-islands-production.json`,
`panel-islands-material.json`, `panel-islands-metrics.json` and their associated
captures/galleries. The material audit does not establish physical tear strength
or ease of actual weaving.

The direct fallback was tried against all **170 previously refused non-repeat
text cases**; five pass and 165 still refuse. All five successes were regenerated
through full production. A separate comparison preserves **16 representative
previous successful outputs exactly**, across all original text frames, several
fonts, and both repeated-text styles (`panel-islands-preservation.json`).

The merged corpus is **2,856 accepted / 294 refused / zero invalid**: text
1,748 / 280; figures 1,108 / 14. Only the five newly accepted records have fresh
full-production results in this update; the other 3,145 retain their earlier
evidence (`panel-islands-current.json`). This is not a fresh full-matrix run.
Expected-success IDs match. Complete generation of the new cases took roughly
7–19 seconds while the broader diagnostic probe was running; the direct fallback
alone took 0.6–2.2 seconds. Difficult-case latency still needs work.

Verification: the full single-worker unit run has **1,157 passed / one timed
out** out of 1,158 tests, in 653.33 seconds (`panel-islands-tests.log`). The only
timeout is the existing Kalam EMMA ordinary-repeat test at 36.55 seconds; it
passes alone in **16.68 seconds** under the unchanged 30-second limit
(`panel-islands-kalam.log`). All unit cases are covered by a pass, but this is
not a clean single full-suite run. The focused seven-case run passes, including
all five new regressions. Check, lint and production build pass, with the seven
existing Svelte warnings. All **177 inverse tests pass** in 87.32 seconds
(`panel-islands-inverse.log`). Full-run timing instability remains.

## Faster local crossing checks, with unchanged designs

The local motif validator now prepares outline segment bounds once per
construction and reuses them for the candidate attachments and relief chords.
Disjoint bounds skip the original intersection calculation. The bounds include
its endpoint tolerance, and nearby segments use the unchanged exact rule.
Full-sheet spacing checks still run separately. There is no global contour
cache or change to candidate order.

A replay compared **333,444 local validation calls** across two difficult Kalam
repeats and seven figure requests, including three refused cases. Every answer
matched. Aggregate time in these checks fell from **9.71 to 0.47 seconds**;
this measures only local crossing validation, not complete generation
(`shared-clearance-final-probe.json`, `shared-clearance-figure-replay.json`).
Both paw captures remain identical to their earlier material-audited designs.

A separate paired production run compared eight complete successful outputs:
Kalam ANNA/EMMA repeat, Nunito ANNA checkerboard, Oswald JULEMAND checkerboard,
paw oval/plain and oval/rays, layered crown and coffee circle/check. **All eight
designs are exactly identical.** Their combined generation time was **40.11
seconds before and 36.51 seconds after**, about 9% less in this single run
(`shared-clearance-paired.json`). Individual results vary; this is not a general
latency guarantee.

This optimisation adds no newly accepted cases. The retained corpus remains
**2,851 accepted / 299 refused / zero invalid**, without claiming a fresh full
matrix run. More-lane, horizontal-lane and counter-attachment experiments still
failed topology or spacing checks and were not added to production.

Verification: the full single-worker unit run has **1,152 passed / one timed
out** out of 1,153 tests, in 606.95 seconds (`shared-clearance-tests.log`). The
existing Kalam EMMA ordinary-repeat case exceeds its unchanged 30-second limit
in that run, then passes alone in **17.62 seconds**
(`shared-clearance-kalam.log`). There are no assertion failures; every unit case
is covered by a pass, but this is **not** a clean single full-suite run. The
three new validator regressions pass. Check, lint and production build pass
with the seven existing Svelte warnings. All **177 inverse tests pass** in
95.71 seconds (`shared-clearance-inverse.log`). Full-run timing instability
remains.

## Previous coverage: wider connections between separate components

The Tabler paw now works in all three oval frames: plain, rays and check. The
component-grid fallback previously joined neighbouring pieces at their nearest
points. Some such gaps are pinched; moving the contact perpendicular to that
gap could instead put it on the wrong side of a toe. The new fallback considers
nearby vertex-to-edge midpoints and selects the shortest one with clearance
from both joined outlines and every other component. Contacts on an actual
clipping seam retain the existing shared gate. Existing successful layouts
return before this search.

The paw uses a 7×7 grid with the original five components and requested oval
frame. Plain and check have no tips below 45°; rays has four, with none below
30°. All three final production captures pass the editor check with 10% extra
clearance, both JSON/SVG handoffs, and the independent material audit at
resolution 1,400 with zero certain or possible detached core islands. The
finished hearts and both cutting sheets were reviewed. Evidence is in
`wide-gates-final-{audit,material,metrics}.json` and the three corresponding
design captures and galleries. This remains a digital connectivity audit,
not a physical weaving or tear-strength trial.

A paired run covers all **153 oval combinations**: the **149 previous accepted
designs stay exactly identical**, three are newly accepted, and coffee/plain
still refuses. The fresh rerun of all 17 preceding figure refusals accepts the
same three paw cases and refuses the other 14, with no invalid output.
The merged corpus is **2,851 accepted / 299 refused / zero invalid**: figures
1,108 / 14; text 1,743 / 285. This refreshes 166 distinct records and retains
the other 2,984 (`wide-gates-current.json`). Expected accepted IDs match.

The fallback's direct paw construction takes about 0.15–0.22 seconds in the
prototype. Before the routing optimisation below, complete generation spent
roughly 5–8 seconds exhausting earlier recipes in the paired run; concurrent
diagnostic runs were slower. Hard-case latency, the remaining refusals and
broader catalogue coverage are unfinished.

Shared-cut routing now precomputes each obstacle's bounds padded by the full
clearance distance. Candidate segments whose bounds are disjoint can skip the
exact intersection and distance calculations; nearby obstacles retain all
existing checks. A replay compared **77 routing calls** from ten complete figure
generations against the preceding implementation. Every returned edge list was
exactly identical, including failed routing attempts retained for later
validation. Aggregate time inside those calls fell from **50.84 to 7.54 seconds**
(`shared-bounds-replay.json`), about 85% less. This measures that routing stage,
not total generation time. All ten final generations succeeded, and the three
paw outputs exactly match their material-audited captures. Regressions cover
nearby noncrossing obstacles in three orientations, as well as the existing
coffee/frame checks.

A final production timing run measured 2.72 seconds for paw/plain, 7.00 for
paw/rays, 4.32 for paw/check and 3.92 for coffee/circle-check. All three paw
designs remain byte-for-byte identical to the audited captures
(`shared-bounds-production-bench.json`). The ray case in particular still needs
latency work despite the faster routing stage.

Verification: the final full run, with two test workers and unchanged timeout
limits, has **1,148 passed / two timed out** out of 1,150 unit tests
(`shared-bounds-final-tests.log`). Both are existing Kalam ordinary-repeat
tests on an unchanged text path. The isolated rerun passes all eleven selected
Kalam cases, including EMMA in 17.21 seconds under its 30-second limit and ANNA
in 6.93 seconds under its 20-second limit (`shared-bounds-kalam-tests.log`).
Thus every unit case is covered by a pass, but this is **not** a clean single
full-suite run. No timeout was raised. All **177 inverse tests pass** in 85.92
seconds, and check, lint and production build pass with the seven existing
Svelte warnings. The full-run timing instability remains recorded.

## Previous coverage: crown counters in the layered frame

The layered Phosphor crown now uses a 9×9 grid with all three round counters,
the circular medallion and both outer bands intact. Its final fallback moves
the 2×2 panel junction through the median counter centres. Each small clipped
component gets a seam gate, the component owning the gate starts its chain,
and its outline's A/B phase follows the panel side. This avoids the closed
cutting loops produced by a fixed phase. No outline changes or cutouts are used.

All **51 layered-frame corpus motifs now pass**. A paired run found the other
50 accepted designs exactly identical (`crown-final-audit.json`); existing
successful constructions return before this retry. The crown takes about
0.37 seconds in the isolated production check. This is a single-case timing,
not a broader performance claim.

The final production crown passes JSON/SVG handoffs, the editor's spacing check
with an additional 10% reserve, and the independent material audit at resolution
1,400 with zero certain or possible detached core islands. Its exported paths
have no tips below 45°. The finished heart and both cutting sheets were reviewed
(`crown-final-design-ph-crown.json`, `crown-final-material.json`,
`crown-final-metrics.json`, `crown-final-gallery-0.png`). The audit concerns
geometric connectivity, not measured tear strength or actual weaving trials.

The merged corpus is **2,848 accepted / 302 refused / zero invalid**, with
1,105 accepted / 17 refused figures and 1,743 accepted / 285 refused text cases.
This refreshes all 51 layered cases and retains the preceding 3,099 results
(`crown-component-current.json`). The expected-success list matches the merged
accepted IDs. The remaining refusals and broader catalogue coverage are still
unfinished.

Verification: all **1,144 unit tests** pass in 367.37 seconds, followed by all
**177 inverse tests** in 85.36 seconds (`crown-component-tests.log`). Check,
lint and production build pass; the seven existing Svelte warnings remain.
The two new focused regressions also pass independently.

## Previous quality: fewer narrow checkerboard corners

The remaining eight Nunito ANNA tips were 38° corners in the visible N outline.
Moving or rounding the existing invisible connections could not remove them.
The checkerboard generator now tries one extra coincident chord through a solid
letter, retaining its existing outer connections and exact outline. It reuses
cached letter cells, ranks at most 128 local chords by paper-tip angles, and can
try one additional 20%/80% pair of grid contacts. Both successful and unsuccessful
local attempts are cached. Counters and detached glyph parts continue to use
the established routing.

New complete hearts are compared after shared-join rounding and must retain
**10% extra full-sheet clearance**. Otherwise the earlier complete design stays
in place. This matters: an Oswald JULEMAND candidate reduced its tip count from
24 to 16 but introduced eight uncertain material cores, still unresolved at
resolution 6,000. Its earlier cuts pass that audit. The extra clearance check
rejects that candidate; a dedicated regression preserves the earlier cuts.

Verified improvements use the same font outlines, cyclic text, checkerboard,
physical strip counts and coincident cuts. Counts below show tips narrower than
30° / 45° in the actual exported paths:

| Font and input | Before | After |
|---|---:|---:|
| Nunito ANNA | 0 / 8 | **0 / 0** |
| Nunito JULEMAND, including JULE / MAND | 16 / 24 | 8 / 8 |
| Nunito EMMA | 12 / 12 | 8 / 8 |
| Nunito OSCAR | 0 / 10 | 0 / 5 |
| Nunito SØREN | 0 / 30 | 0 / 20 |
| Nunito ANNA / BO | 0 / 12 | 0 / 6 |
| Bree Serif A / nnn | 8 / 12 | 0 / 12 |
| Righteous JULEMAND, including JULE / MAND | 0 / 8 | **0 / 0** |
| Righteous ABCDEFGHIJ | 40 / 80 | **0 / 0** |
| Kalam SØREN | 0 / 30 | 0 / 10 |
| Kalam ANNA / BO | 0 / 18 | 0 / 6 |

All thirteen changed designs pass the independent guarded material audit with
zero certain or possible detached core islands. Resolution 1,400 suffices for
ANNA and several other patterns; dense patterns needed 2,800 or 4,200, and
Nunito SØREN needed 6,000. Uncertain lower-resolution results were not counted
as passes. Both JSON/SVG handoffs pass, and the finished heart plus both paper
sheets were reviewed (`notch-reserve-material.json`, `notch-reserve-metrics.json`,
`notch-reserve-gallery-{0..12}.png`). These checks do not certify physical tear
strength or remove every small feature from the other fonts.

The exhaustive prototype that first eliminated ANNA's tips took roughly seven
seconds. The final cached construction takes about **1.13 seconds**, versus
0.95 seconds for the earlier eight-tip result in the paired production capture.
It preserves the exact 4×4 ANNA / NNAA / NAAN / AANN pattern. This is a bounded
quality improvement, not a general latency fix for the remaining hard cases.

The paired audit covered **all 198 checkerboard inputs** across six fonts.
After adding the clearance reserve, all sixteen changed candidates were
regenerated through the final production code: thirteen improve and three keep
their earlier cuts exactly. In total, **134 remain accepted, 64 remain refused**;
121 accepted outputs stay exactly identical. No accepted combination was lost.
The thirteen improvements reduce the combined tip counts from **92 / 276 to
24 / 83** (`notch-relief-audit.json`, `notch-reserve-audit.json`).

The merged corpus remains **2,847 accepted / 303 refused / zero invalid**;
text **1,743 / 285**, figures **1,104 / 18**. The other 2,952 records retain prior
results (`notch-reserve-current.json`). This change improves existing cuts;
remaining refusals, wider catalogue/size coverage and difficult-text latency
remain unfinished.

The final production code passes all **1,141 existing unit tests** in 492.71
seconds and all **177 inverse-engine tests** in 105.64 seconds
(`notch-reserve-tests.log`). The additional Oswald clearance regression passes
separately in 1.58 seconds (`notch-reserve-guard-test.log`). The thirteen focused
checkerboard tests pass in 16.95 seconds. Type checking, lint and the production
build pass, with seven existing warnings. No test timeout was increased.

## Previous coverage: alternate connections for detached components

Detached components originally used only the nearest active gate. That approach
can cross a letter's stem or leave no clear path from a separate sail to the
frame. A final retry now assigns each component to the next nearest gate, with
at most three alternative ranks. The existing nearest-gate calculation remains
unchanged when no alternative is requested.

Repeated text retains completed cells and retries only when a missing glyph has
multiple separate components. If all cells exist but the complete heart failed,
it rebuilds their connections. The established compound construction still
returns first when successful. The new alternatives are compared by their sharp
tips after shared-join rounding, with an early return at zero tips. Single-contour
failures do not trigger these extra attempts.

Figures try the same component assignments through their requested frame, using
the existing ordinary and practical local routing. The fitted silhouette and
sunburst border keep their own construction rules. The corner-check and layered
frames are not redirected into a different frame. All new accepted results must
retain **10% extra full-sheet clearance** after fitting and rounding. Existing
successful recipes return before these retries. No font/motif outlines, counters,
visible frame cells or validation thresholds were relaxed.

Seven previously refused combinations now work:

| Input | Frame / strips | Tips below 30° / below 45° |
|---|---|---|
| Oswald jul | Repeat, 6×3 | 0 / 3 |
| Righteous jul | Repeat, 6×3 | 0 / 0 |
| Righteous Sofie | Repeat, 10×5 | 4 / 10 |
| Righteous William | Repeat, 14×7 | 0 / 0 |
| Phosphor sailboat | Oval plain, rays and check, 3×3 each | 0 / 0 |

All seven pass the guarded material audit at resolution **1,400**, with zero
certain or possible detached core islands on either sheet, and both JSON/SVG
handoffs. Their finished hearts and both paper sheets were reviewed in
`island-ports-quality-gallery-0.png` and `island-extra-gallery-{0,1,2,3,4,5}.png`.
Final production captures are exactly identical to the audited candidates
(`island-text-production.json`, `island-figure-production.json`). Remaining sharp
tips in Sofie and Oswald jul are not claimed eliminated; the material check does
not certify physical tear strength or every sub-threshold feature.

All **55 previous ordinary-repeat refusals** were checked: four are recovered,
51 remain refused. All **21 previous figure refusals** were checked through the
production generator: three are recovered, 18 remain refused. Both audits have
zero invalid accepted outputs. The final text implementation was rerun on all
four new text successes after adding tip ranking; all captures remain identical.
The merged report is **2,847 accepted / 303 refused / zero invalid**: text
**1,743 / 285**, figures **1,104 / 18** (`island-current.json`). The other 3,074
records retain previous results; this is not a fresh audit of all 3,150 cases.
The expected corpus exactly matches all 2,847 accepted IDs. Thirteen paired
samples of existing text and figure successes give exactly identical complete
results before and after the change (`island-ports-preservation.json`).

Several broader experiments were rejected: routing spokes around an unchanged
letter failed full-sheet spacing in all 12 ANNA variants; filtering compound
chords before spending the candidate budget recovered none of ten Kalam repeat
failures; alternate component gates recovered none of 32 checkerboard failures
with detached components. These are recorded in `wrapped-spokes-results.json`,
`qualified-chords-production.json` and `island-checks-results.json` and are not
enabled in production.

The annotated ANNA diagnostic (`anna-tip-diagnostic.{json,svg,png}`) confirms that
all eight remaining tips are N corners around **38°**, with two visible outline
segments meeting at each tip. Shared-join rounding cannot remove them; a different
connection topology is still required while preserving the font outline.
Prioritizing the existing two-chord repairs in ten fresh ANNA layouts, then
ranking their complete local cuts in another ten, also failed to reduce the
minimum below eight tips (`compound-first-results.json`,
`compound-quality-results.json`). Neither experiment is enabled.

Seven focused regressions pass in **5.32 seconds**. Type checking, lint and the
production build pass with seven existing warnings
(`island-ports-final-{focused,check,lint,build}.log`). The single-worker
`npm test` run passes **all 1,141 unit tests** in 466.38 seconds and **all 177
inverse-engine tests** in 91.24 seconds (`island-ports-tests.log`). The earlier
Kalam ANNA timeout did not recur in this run; no timeout was changed. This does
not establish a general latency improvement. The new text cases take roughly
0.35–0.82 seconds and the three sailboat cases 1.82–2.07 seconds in the fresh
production captures.
The remaining refusals, larger catalogue/size coverage, difficult-text latency
and ANNA's narrow corners remain unfinished.

## Previous coverage: divided fitted supports and compound repeated letters

The last close-fitting figure retry can divide a concave silhouette into two
horizontal panels, moving only the outer support directions by ±0.15 radians.
The internal seam and its agreed contacts remain fixed. The snowflake now works
on **4×4 strips**, with **zero tips below 30° and seven below 45°**. Its production
capture exactly matches the prototype that passed the guarded material audit at
resolution 1,400, with no detached certain or possible cores on either sheet
(`panel-support-production-20.json`, `snow-support-quality-material.json`).
Both handoffs pass. All 45 previously successful fitted designs remain exactly
identical; the fresh 51-motif fitted audit now gives **46 accepted / five refused
/ zero invalid** (`panel-support-production.json`).

Ordinary repeating text now has one final compound-connection retry. Two
coincident chords can relieve independent concave corners while preserving the
letter outline and its counters. It reuses successful cells from the previous
attempts, and runs after all established whole-heart repairs. It rounds shared
joins and requires **10% extra clearance** in the finished design. Earlier
successful outputs return before this retry; the alternating-background frame
is unchanged. There is no inverse solve or runtime material rasterization.

Four previously refused Kalam inputs now work:

| Text | Strips | Tips below 30° / below 45° |
|---|---|---|
| EMMA | 8×4 | 4 / 4 |
| JULEMAND | 16×8 | 7 / 12 |
| JULE followed by a newline and MAND | 16×8 | 7 / 12 |
| amy | 6×3 | 0 / 2 |

The full generator, JSON/SVG handoffs and guarded material check pass for all
four. Material resolution is 1,400, with zero detached certain or possible core
islands on either sheet (`compound-repeat-{quality,extra}-material.json`). The
finished hearts and both paper patterns were visually reviewed. The new EMMA
regression also checks the additional clearance reserve. These checks do not
certify physical tear strength or eliminate all small tips.

The first compound candidate for M&M passes the editor's ordinary spacing check
but remains **uncertain** in the independent material audit at resolutions 1,400,
2,800 and 4,200. Its two questionable connections also fail the new 10% reserve,
so the final implementation keeps this case refused. It is not added to the
expected-success corpus. Lowering the material requirement was not used to count
it as a success (`compound-repeat-ampersand-material{-4200,}.json`).

The audit of all **59 previously refused ordinary-repeat cases** recovers four
and retains 55 refusals, with zero invalid outputs. The five initial candidates
were regenerated after adding the clearance reserve; all four accepted captures
are exactly identical to the material-audited designs
(`compound-repeat-refusals.json`, `compound-repeat-guarded.json`). Combined with
the 51 fitted motifs, merged coverage is **2,840 accepted / 310 refused / zero
invalid**: text **1,739 / 289**, figures **1,101 / 21**
(`compound-repeat-current.json`). The other 3,040 records retain their previous
results; this is not a fresh run of all 3,150 cases. All five new successes are
included in the expected corpus.

All eight sampled earlier text successes produce exactly identical complete
results before and after this change (`compound-repeat-preservation.json`).
This includes difficult Kalam A/ANNA/LOVE repeats, Bree Serif jul and Oswald
William, plus the Nunito repeated and alternating patterns. Existing generator
latency is not claimed improved. The four new accepted inputs take roughly
12–22 seconds in the fresh audit; fast iteration remains unfinished.

An isolated mixed two/four-port quality experiment still leaves eight narrow
ANNA tips in all four tested routing variants, so it was not enabled
(`mixed-quality-results.json`). A separate local relief-ray caching prototype
is also not part of this change; its equivalence/timing evidence is recorded in
`relief-cache-paired.json` for follow-up.

Type checking, lint and production build pass after the final clearance change,
with seven existing warnings (`compound-repeat-final-{check,lint,build}.log`).
The single-worker full unit run finishes in **783.09 seconds** with **1,133 passed
/ one timeout** (`compound-repeat-tests.log`). All new regressions pass. The
existing Kalam ANNA ordinary-repeat case takes **21.31 seconds** against its
unchanged 20-second limit; the full suite is not green. The focused latest-source
run of that case and the new EMMA clearance regression passes both in 26.53
seconds total (`compound-repeat-final-focused.log`). No timeout was increased.

All **177 inverse-engine tests pass** separately in 90.65 seconds
(`compound-repeat-inverse.log`). The remaining refusal corpus, other sizes/catalogue
entries, difficult-text latency and ANNA's eight visible N-corner tips are still
unfinished.

## Previous coverage: adapt fitted supports and reuse local route graphs

The final close-fitting fallback moves the four support directions by ±0.15 or
±0.3 radians, trying four rotation/reflection patterns. Every attachment remains
on an actual silhouette vertex with clear outward projections in its original
quadrant. The motif, counters and outer strips stay fixed; no extra enclosing
shape or cutout is introduced. Completed duplicate constructions are skipped
before fitting. The selected valid result has the fewest sharp tips after the
existing shared-join rounding pass. Earlier successful recipes still return first.

Three previously refused fitted motifs now work on **5×5 strips**:

| Motif | Tips below 30° / below 45° |
|---|---|
| Phosphor moon and stars | 0 / 1 |
| Phosphor rabbit | 0 / 3 |
| Tabler butterfly | 3 / 6 |

Selecting among the nearby directions improves the rabbit from 0/4 to 0/3 and
the butterfly from 5/6 to 3/6 compared with their first working candidates.
The remaining narrow tips are not claimed fixed. A wider butterfly support fan,
up to ±0.65 radians, found no improvement (`fitted-support-wide-results.json`).
The practical, guarded panel experiment recovered none of ten fitted/layered
refusals, so it was not enabled (`practical-guard-results.json`).

All three selected designs pass both JSON/SVG handoffs and the independent guarded
paper-connectivity audit at resolution **1,400**, with zero detached certain or
possible core islands on either sheet. Their finished hearts and both paper
sheets were inspected in `fitted-support-quality-gallery-{0,1,2}.png`. Production
captures are exactly identical to those audited designs:
`fitted-support-production-{17,29,48}.json`. The material model does not certify
physical tear strength or every sub-threshold tip.

A fresh full-pipeline audit of **all 51 fitted motifs** gives **45 accepted / six
refused / zero invalid**, with no regressions (`fitted-support-production.json`).
Merged coverage is **2,835 accepted / 315 refused / zero invalid**: text **1,735 /
293**, figures **1,100 / 22** (`fitted-support-current.json`). The other 3,099
records retain their previous results; this is not a fresh audit of all 3,150
cases. All three new successes are added to the expected corpus. Other sizes,
the full icon catalogue, the remaining refusals and ANNA's eight N-corner tips
remain unfinished.

Local contour routing also reuses integer point identities and adjacency slots
within one motif's construction. The same six-decimal graph keys, exact output
points, degree checks, endpoint pairings and closed-cycle rejection remain in
force. Storage resets between candidates and sheet families using a generation
stamp, and is released after that motif. This replaces repeated string-keyed
adjacency allocation; it changes neither route order nor validation thresholds.

In the alternating before/after comparison, all **16 runs across eight inputs**
produce exactly identical designs or refusal messages (`numeric-routes-paired.json`).
Mean Kalam ordinary-repeat times improve from **6,720 to 6,148 ms** for A and
**7,616 to 6,983 ms** for ANNA, about 8%. Other sampled fonts and figures range
from about 4% faster to 4% slower, so this is not a general latency improvement.
Cinzel LOVE also varies substantially between trials, on both implementations.
A separate duplicate-attachment pruning experiment offered little benefit and
was not retained. Earlier prototype comparisons are not the authoritative timing
or equivalence evidence.

The 56 local-route/geometry tests and four fitted-frame regressions pass. Type
checking, lint and production build pass, with seven existing warnings
(`numeric-routes-focused.log`, `fitted-support-{focused,check,lint,build}.log`).
The single-worker full unit run reports **1,131 passed / one timed out** in
754.11 seconds (`fitted-support-tests.log`). All new tests pass, and Kalam A
ordinary-repeat now passes within its existing limit. Kalam ANNA ordinary-repeat
still takes 20.85 seconds against its unchanged 20-second limit in the full run;
it passes alone in 7.28 seconds (`fitted-support-kalam.log`). The full suite is
still not green, and difficult-text latency remains unfinished. All **177
inverse-engine tests pass** separately in 87.77 seconds
(`fitted-support-inverse.log`).

## Previous coverage: separate component lanes with a clearance reserve

A final figure fallback now groups disconnected components into three vertical
lanes. Each lane has one open cutting path on each paper; counters stay with their
parent and open through coincident A/B connections. The construction uses the
chosen frame's existing attachment arcs. It tries direct connections and an
aligned approach above and below the artwork, routes around neighbouring lanes,
then rounds the shared joins. All visible motif outlines remain unchanged.

The selected cuts must retain **10% more spacing than the standard grid-based
minimum**, after fitting and rounding. This reserve matters: an initially clear
curve can otherwise skim the coffee handle closely enough to leave an uncertain
paper connection. It also selects the aligned scalloped-frame layout over a
same-tip-count direct layout. The ordinary recipes and their successful outputs
return before this bounded two-layout fallback. No solver, font changes, cutouts
or runtime material rasterization were added.

Twelve previously refused combinations now pass the full application generator:

| Input / frame styles | Paper strips | Tips below 30° / below 45° |
|---|---|---|
| Coffee / circle rays, checks, plain | 4×4 | 0 / 2 |
| Coffee / scalloped rays, checks, plain | 4×4 | 0 / 2 |
| Coffee / hexagon plain | 4×4 | 0 / 6 |
| Coffee / oval rays, checks | 4×4 | 0 / 0 |
| Bicycle / diamond rays, checks, plain | 4×4 | 0 / 1 |

The twelve captured production designs are **exactly identical** to the checked
prototypes (`component-lanes-final.json`, `component-lanes-final-{0..11}.json`).
Both JSON and SVG handoffs preserve the rendered weave, retain every cut and pass
the editor's geometry checks. The regression tests also check the 10% reserve
through both exports. The finished hearts and both paper sheets were rendered;
representatives of all five frame shapes were inspected in `clear-lane-gallery-*`.

Eleven pass the separate guarded paper-connectivity audit at resolution 1,400.
The bicycle/diamond/plain case is uncertain at 1,400, with a single missing lattice
connection, and **passes at 2,800** (`clear-lane-material.json`,
`lane-bicycle-material-hires.json`). These checks concern a discrete geometric
model and do not certify physical tear strength. Coffee/oval/plain still fails
the new clearance reserve and remains refused. Shorter curve handles did not
repair the initial uncertain candidates; those changes were not retained.

A fresh production run of all **37 previous figure refusals** gives **12 accepted /
25 refused / zero invalid** (`component-lanes-production.json`). Combined coverage
is **2,832 accepted / 318 refused / zero invalid**: text **1,735 / 293**, figures
**1,097 / 25** (`component-lanes-current.json`). The other 3,113 full-pipeline
records retain their previous results; this is not a fresh run of all 3,150 cases.
All twelve recoveries are added to the expected corpus. Remaining combinations,
ANNA's eight N-corner tips, difficult text latency, other sizes and wider catalogue
coverage remain unfinished.

Five new regression tests pass in 21.87 seconds. Type checking, lint and the
production build pass, with seven existing warnings (`component-lanes-focused.log`,
`component-lanes-check.log`, `component-lanes-lint.log`, `component-lanes-build.log`).
The single-worker full unit run reports **1,120 passed / two timed out** in
792.74 seconds (`component-lanes-tests.log`). All new tests pass. The timeouts
are the existing Kalam A and ANNA ordinary-repeat cases, at 20.82 and 23.10
seconds against their unchanged 20-second limits. Both pass together in the
focused rerun in 16.22 seconds (`component-lanes-kalam-isolated.log`); the full
suite is still not green. All **177 inverse-engine tests pass** separately in
93.92 seconds (`component-lanes-inverse.log`).

## Previous coverage: tilted partitions inside layered frames

A final layered-frame fallback tilts the internal panel seams before clipping
and routing the motif, then restores its original coordinates before attaching
the frame. This can avoid grazing a small detail without distorting the visible
motif or its circular border. The existing successful layouts return before this
bounded two-angle fallback. Shared connections in the selected new construction
receive the same checked corner rounding used by the text checkerboard.

The Tabler paw now works in the layered frame with nine strips per sheet. Its
straight prototype had **three tips below 30° / four below 45°**; the selected
rounded construction has **one / one**. It retains the paw outline, medallion and
both complete outer bands, with coincident cuts and no cutouts. JSON and SVG
handoffs preserve the rendered weave and pass the editor's spacing checks.
The production output exactly matches the inspected prototype and passes the
separate paper-connectivity audit at resolution 1,400; the identical prototype
also passes at 2,800. At frame sizes 60, 70 and 80, the default motif scale
passes the same audit. The six smaller/larger motif-scale combinations in that
nine-case sweep remain refused (`tilted-size-material.json`). These discrete
checks do not certify physical tear strength.
Artifacts: `tilted-production-gallery-0.png`, `tilted-production-material.json`,
`shear-quality-material-hires.json` under `tmp/generator/`.

A fresh full-pipeline run of **all 51 layered-frame cases** gives **50 accepted /
one refused / zero invalid**, with no regressions (`tilted-layers.json`). The
crown remains refused. Combined coverage is **2,820 accepted / 330 refused / zero
invalid**, with **1,085 / 37** figures and the unchanged **1,735 / 293** text cases
(`tilted-current.json`). The other 3,099 records retain their previous results;
this is not a fresh run of all 3,150 cases. The paw is added to the expected corpus.

Tilted coffee-cup prototypes passed the geometry checks but remained uncertain
in the material audit, including at higher resolution, so that fallback was not
added to the oval frames. Additional ANNA checkerboard experiments have not yet
improved its eight narrow N-corner tips. The broader goal remains unfinished,
including the remaining refused combinations, other sizes and icon-catalog coverage.

Type checking, lint and the production build pass, with seven existing warnings
(`tilted-check.log`, `tilted-lint.log`, `tilted-build.log`). The single-worker full
unit run reports **1,116 passed / one timed out** in 756 seconds
(`tilted-tests.log`). All new tests pass. The remaining timeout is the existing
Kalam ANNA ordinary-repeat case: 21.99 seconds against its unchanged 20-second
limit. It passes alone in 8.05 seconds (`tilted-kalam-focused.log`); the full suite
is still not green. All **177 inverse-engine tests pass** separately in 86.74
seconds (`tilted-inverse.log`).

## Previous coverage: align shared contacts across clipped panels

The last-resort text layout now reserves each internal panel seam for its agreed
shared-cut contact. Previously an extra invisible cut could attach at another
clipped outline vertex: each cell was valid alone, but stitching them produced
a branching cut. The restriction applies during route selection, counter
connections and notch relief. An optional division through wider gaps in the
letter's coordinates keeps the clipping and stitching lines aligned across
rows. Letter outlines and counters remain unchanged; counters use coincident
cuts, never cutouts.

The figure fallbacks add a vertical two-panel layout and move a two-panel seam
away from small outline details in fitted and layered frames. They run after
all established straight and curved constructions. Existing successful layouts
therefore return before these new choices are attempted.

Seven previously refused combinations now pass through the application generator:

| Input / frame | Paper strips | Tips below 30° / below 45° |
|---|---|---|
| Cinzel BO / air | 8×8 | 0 / 0 |
| Cinzel BO / oval | 8×8 | 1 / 3 |
| Tabler bow / fitted | 4×4 | 0 / 2 |
| Snowflake / oval plain | 4×4 | 0 / 6 |
| Snowflake / oval rays | 4×4 | 0 / 10 |
| Snowflake / oval checks | 4×4 | 0 / 6 |
| Phosphor butterfly / layered | 8×8 | 1 / 2 |

Both JSON and SVG handoffs pass for all seven, including the editor's geometry
checks, no-cutout assertion and rendered-weave comparison. The heart and both
cutting sheets were rendered and inspected (`seam-production-gallery-{0..6}`;
the final cached outputs in `seam-final-gallery-{0..6}` are identical).
All seven pass the separate guarded rolling-disk connectivity audit at
resolution 1,400 (`seam-production-material.json`). This discrete model does
not certify physical tear resistance or the remaining fine tips.

The prototype produced a curved butterfly with fewer tips, but its material
check failed. The chosen straight construction passes at both 1,400 and 2,800.
Three oval coffee-cup prototypes remain uncertain at both resolutions and were
not added. Those are not accepted recoveries (`seam-prototype-material.json`,
`seam-refined-material.json`).

The final bounded fallback was scanned against all **338 previous refusals**;
it recovered these seven and refused the remaining 331 (`seam-fallback-audit.json`).
Seven full production generations and their handoffs were then checked. Combined
coverage is **2,819 accepted / 331 refused / zero invalid**: text **1,735 / 293**,
figures **1,084 / 38** (`seam-current.json`). The other 3,143 full-pipeline records
retain `nested-current.json` results; this was not a fresh run of all 3,150 cases.
All seven recoveries are pinned in the expected corpus. The broader goal is
unfinished, including other sizes and the rest of the icon catalog.

Curve fitting also reuses the same Bernstein coefficients within each fitting
pass, preserving arithmetic order. A bounded cache scoped to a generation request
reuses exactly identical outline fits across candidate layouts. Tolerance is
part of the key, returned controls are isolated from later edits, and no artwork
is retained between requests. All **132 paired fits are identical**; the final
comparison took 855 ms before and 597 ms after the coefficient change
(`seam-fit-comparison-final.log`). All seven final production designs also match
their pre-cache versions exactly. These are local measurements, not a browser
latency guarantee.

The full Cinzel BO/oval path remains slow: the focused end-to-end test measured
about 28 seconds before caching and 22 seconds with the retained changes, over
its 20-second limit. Its new unit regression therefore isolates the adaptive
panel construction and validates both exports; full-generation coverage is in
the offline production audit above. No existing test timeout was raised. The
latency problem remains open; the new fallback itself takes roughly one second,
with most time spent on preceding unsuccessful constructions.

Type checking, lint and the production build pass, with seven existing warnings
(`seam-check-final.log`, `seam-lint-final.log`, `seam-build-final.log`). The full
single-worker `npm test` run reports **1,113 passed / two timed out** in 750
seconds (`seam-tests.log`). All new regressions pass. The only failures are the
existing Kalam `A` and `ANNA` ordinary-repeat tests, at 20.04 and 21.89 seconds
against their unchanged 20-second limits. Both pass together in the focused
rerun (15.25 seconds of tests; `seam-kalam-focused.log`). The full suite is not
green, and its timing issue remains unresolved. All **177 inverse-engine tests
pass** separately (`seam-inverse.log`).

The old Cinzel curved retry has completed all 199 cases. Its sole recovery is
BO/diamond, which was already supported; it adds no new coverage. Its durations
include earlier process suspensions and are not latency measurements.

## Previous coverage: reconnect nested counters in the layered frame

The layered frame has one additional fallback for nested contours. When a
straight chain cannot alternate with a contour's two external attachments, the
fallback opens its counters around either attachment. It keeps one complete
entry-to-exit path on each sheet, rejects branches and cycles, and checks shared
connections against every descendant outline. It ranks the valid connections
by cutting cost. Every visible contour and both outer bands remain unchanged;
counters still use coincident cuts on the two sheets, never cutouts.

This fallback runs after the existing layered layouts. It retains seven strips
per sheet. If its straight connections fail the final checks, it tries curved
approaches before the global straight-rerouting fallback. That order matters:
the bicycle's straight reroute passed spacing but introduced three tips below
45°, whereas retaining its curved connections gives zero. All accepted paths
still pass the complete converter and artwork-fidelity checks.

Four previously refused figures now pass in the layered frame:

| Figure | Paper strips | Tips below 30° / below 45° |
|---|---|---|
| Tabler cookie | 7×7 | 2 / 2 |
| Phosphor cat | 7×7 | 0 / 0 |
| Phosphor bicycle | 7×7 | 0 / 0 |
| Tabler gift | 7×7 | 0 / 0 |

Their production heart and both paper sheets were rendered and inspected in
`nested-production-gallery-{0,1,2,3}.png`, with matching SVGs. Both JSON and SVG
handoffs pass (`nested-production-metrics.json`). All four also pass the separate
guarded rolling-disk connectivity audit at resolution 1,400
(`nested-production-material.json`). That discrete model does not certify
physical tear resistance or small tips; the cookie's two narrow tips remain.

The fresh 51-case layered audit reports **48 accepted / three refused / zero
invalid**, with four recoveries and no acceptance regressions
(`nested-production-layers-final.json`). The remaining layered refusals are the
Phosphor butterfly, Phosphor crown and Tabler paw.

A direct comparison with the preceding generator confirms that **43 of the 44
previously accepted layered designs are byte-for-byte identical**
(`nested-existing-comparison.json`). The remaining palette uses the new nested
fallback before the old global retry. It stays on 7×7 strips and improves from
**4/6 to 2/2** tips below 30° / below 45°. Both versions pass the separate
1,400-resolution material audit (`nested-palette-material.json`), and their
heart and cutting sheets were inspected in `nested-palette-gallery-{0,1}.png`.

All four recoveries are pinned. Combined coverage is now **2,812 accepted / 338
refused / zero invalid**: text is unchanged at **1,733 / 295**, figures are
**1,079 / 43** (`nested-current.json`). Only the 51 layered cases were freshly
rerun; the rest retain `curve-export-current.json` results. The broader goal
remains unfinished, including other sizes and the rest of the icon catalog.

Type checking, lint and the production build pass, with seven existing type-check
warnings (`nested-check-final.log`, `nested-lint-final.log`, `nested-build.log`).
The full single-worker `npm test` run reports **1,104 passed / one timed out**
in 848 seconds (`nested-tests.log`). All four new frame regressions pass. The
only failure is the existing Kalam `ANNA` ordinary-repeat test at 21.58 seconds
against its unchanged 20-second limit. It passes alone in 7.96 seconds
(`nested-kalam-focused.log`). The full run is not green; its timing issue remains
unresolved, and no timeout was raised. All **177 inverse-engine tests pass**
separately in 92 seconds (`nested-inverse.log`). The old Cinzel diagnostic was
suspended during testing and has been resumed; its elapsed times include those
pauses and must not be interpreted as generation latency.

The earlier experiment that only counted the extra outer strips in local
clearance recovered none of the seven layered failures, even with curved
retries (`layer-width-curved-probe.json`). That change was not shipped. The
nested-contour fallback retains the existing clearance thresholds.

## Previous quality: round only sharp shared joints in the finished cuts

The checkerboard quality pass now works on the already fitted paper paths.
It identifies a cubic shared by the two sheets, including reversed references,
and curves only an end that currently forms a tip below 45°. Both sheets receive
the same handle. All endpoints, visible curves, other handles, strip counts and
segment counts remain unchanged. There is no second outline fit or additional
layout search. The result must reduce the exported tip counts, remain inside the
overlap and pass the editor's full crossing/spacing check; otherwise the original
design is retained. This optional pass runs once on a selected checkerboard.

For Nunito `amy`, tips below 30° / below 45° improve from **3/12 to 3/3** on
the same 6×6 strips. For lowercase `anna`, they improve from **2/3 to 2/2**
on the same 4×4 strips. The pass moves nine and one shared connection ends,
respectively, on both sheets. Uppercase `ANNA` stays exactly unchanged at 0/8:
those remaining tips belong to visible letter outlines. The three comparisons
have zero weave differences at 600 pixels (`curve-export-paired.json`). Their
production heart and both cutting sheets were rendered and inspected in
`curve-export-final-gallery-{0,1,2}.png`, with matching SVGs, and both JSON/SVG
handoffs pass (`curve-export-final-metrics.json`).

All **134 previously accepted checkerboards** pass the production audit again,
with **zero refusals, invalid output or regressions** (`curve-export-accepted.json`).
No new input is claimed as supported by this quality pass. Combined coverage
remains **2,808 accepted / 342 refused / zero invalid** from
`symmetric-frame-current.json`; the broader goal is still unfinished.

The production `amy` and unchanged `ANNA` pass the separate guarded rolling-disk
audit at resolution 1,400. For lowercase `anna`, the exact original and final
production output both remain uncertain at 1,400 (the same four conservative
core islands and zero possible-core islands on one sheet). **Both pass at
2,100 and 2,800**, with no detached core islands on either sheet. The reports
are `curve-export-final-material.json` and
`curve-export-lower-material-{1400,2100,2800}.json`. This discrete connectivity
model does not certify physical strength or tear resistance.

An earlier version curved all shared connections and refitted the whole
construction. Lowercase `anna` remained uncertain even at 2,800, whereas its
original passed, so that broader version was discarded. Early probes also used
case-only filenames (`anna` and `ANNA`) on a case-insensitive filesystem; the
uppercase files overwrote the lowercase witnesses. Those early lowercase
material-pass claims are invalid. The authoritative comparisons above use
distinct numeric or `lower` filenames, and the same resolution for both sides.

The nine focused geometry tests and the two end-to-end `amy`/`anna` regressions
pass. Type checking, lint and the production build pass, with seven existing
type-check warnings (`curve-export-{unit,focused,check,lint,build}.log`). The full
single-worker `npm test` run reports **1,099 passed / two timed out** in 865
seconds (`curve-export-tests.log`). The failures are the existing Kalam A/ANNA
ordinary-repeat tests, at 20.63 and 26.36 seconds against their unchanged
20-second limit. Both pass in the focused rerun (15.09 seconds combined;
`curve-export-kalam-focused.log`), and all **177 inverse-engine tests pass**
separately (`curve-export-inverse.log`). The full run is not green, and its
timing problem remains unresolved. No timeout was raised. The new checkerboard
regressions pass.

## Previous coverage: separate cuts around every flat frame side

The diamond's outer routing now separates cuts on all four sides when several
cells connect to that side. Previously the two sides used by tall layouts
projected cuts directly along the frame, where they could overlap neighbouring
frame sections. Each quadrant now reflects into the same corner construction;
single-axis reflections reverse the angular order. A lone gate keeps its
existing direct projection. Letter outlines, counter connections, frame shape
and requested text remain unchanged.

The three-line `A\nB\nO` construction now passes with Nunito, Bree Serif,
Oswald, Kalam and Righteous, all on 5×5 paper strips. Both JSON/SVG handoffs pass,
and the heart plus both cutting sheets have been rendered and inspected in
`symmetric-frame-gallery-{0,1,2,3,4}.png` and the matching SVGs. Tip counts below
30° / below 45° are respectively 0/10, 0/5, 3/11, 2/5 and 0/9. This is a routing
repair, not a claim that all fine letter features have become easy to cut.
The same correction also recovers Cinzel B and BO in diamond, with 6×6 and
8×8 strips. Their JSON/SVG handoffs pass, and both cutting sheets have been
rendered and inspected in `symmetric-cinzel-gallery-{0,1}.png`. They have
respectively 0/4 and 0/8 tips below 30° / below 45°. All seven new designs pass
the separate guarded rolling-disk connectivity audit at resolution 1,400
(`symmetric-frame-material.json`). This discrete model is not a physical
strength or tear-resistance test and does not certify small tips.

The completed **204-case diamond text audit** reports **184 accepted / 20
refused / zero invalid**, with seven recoveries and no regressions
(`symmetric-frame-diamond-text.json`). Its Cinzel A-B duration includes the
audit's suspension during testing and must not be used as generation latency.

All **153 diamond figure combinations** were rerun: **150 accepted / three
refused / zero invalid**, with no status changes or regressions. Reports are
`symmetric-frame-diamond-{rays,check,plain}.json`. An additional **48 multiline
diamond cases** cover blank lines, accents, uneven line lengths and up to six
rows: **44 accepted / four refused / zero invalid**
(`symmetric-tall-extra.json`). The remaining four are Oswald's vertical Å/Ø/Æ,
and Cinzel's ANNA/BO/IDA, Å/Ø/Æ and six-row A/B/O/A/B/O. These extra cases are
outside the existing corpus and are not added to its coverage totals.

All seven recoveries are pinned, retaining every preceding success. The combined
3,150-case record is now **2,808 accepted / 342 refused / zero invalid**: text
is **1,733 / 295**, figures **1,075 / 47** (`symmetric-frame-current.json`).
This retains earlier results outside the 357 freshly audited diamond cases;
it is not a complete fresh rerun. The full goal remains unfinished, including
the remaining refusals, other sizes and the rest of the icon catalog.

### Topology-check runtime

Profiling Kalam A in ordinary repeat found 16% of samples directly in the local
graph walker, plus allocation and key-lookup costs (`kalam-runtime.cpuprofile`).
The walker now computes endpoint keys once for both sheets, builds adjacency
arrays in place, and records visited edges by index. It retains the same
rounded keys, endpoint proximity test, gate pairings, degree checks, edge order
and requirement to visit every selected edge.

A differential prototype compares every returned point by object identity,
including rejected graphs: **325,092 text candidates** and **68,458 figure
candidates** match exactly. The reports are `compact-route-differential.json`
and `compact-route-figure-differential.json.comparisons.json`. The latter covers
all 51 circle-rays figures with their complete handoffs: 50 accepted and one
unchanged refusal, with zero invalid output.

Two paired runs in alternating order give the following average generation
times, with identical final cuts and colour phase in each pair
(`compact-route-compare.json`):

| Case | Before | After |
|---|---:|---:|
| Kalam A, ordinary repeat | 8,478 ms | 7,847 ms |
| Kalam ANNA, ordinary repeat | 9,847 ms | 8,639 ms |
| Nunito amy, checkerboard | 9,074 ms | 8,621 ms |

These measurements ran alongside audits, so they do not establish browser
latency. Type checking, lint and the production build pass; the type check
retains seven existing warnings (`symmetric-frame-{check,lint,build}-final.log`).
The full unit run reports **1,098 passed / one timed out** in 768 seconds
(`symmetric-frame-tests.log`). Kalam A in ordinary repeat now passes in the
full run; Kalam ANNA still exceeds its unchanged 20-second limit at 22.14
seconds. The latter passes alone in 7.93 seconds
(`symmetric-frame-kalam-focused.log`). The full-suite timing issue is not
resolved, and that run must not be reported as green. All **177 inverse-engine
tests pass** separately (`symmetric-frame-inverse.log`). Both long text audits
were suspended during testing and resumed afterward; the diamond audit has
since finished. No timeout was raised.

Extending the mirrored routing to the nonflat frames' optional spread pass
recovered none of 47 previous figure refusals (`spread-sides-figures.json`).
That broader change remains a prototype.

## Previous coverage: curved shared connections after straight layouts fail

Completed constructions can now retry with curved coincident cuts after all
established recipes fail. The handles approach the visible outline across its
tangent, using 20% of the connection's chord length. The original endpoints,
visible controls, paper paths, font and frame remain unchanged. Both papers
reference the same curve. Existing successful constructions return before this
pass, and duplicate rejected geometries are tried only once. A severe gap
between two unchanged visible outlines rejects the retry before curve fitting:
moving a shared cut cannot widen that gap. This keeps the existing excessively
thin-ring refusal fast without relaxing its acceptance criteria.

The original polygon intersection and severe-pinch prechecks describe straight
segments. Curved retries instead run the complete converter's checks on the
actual cubic paths, followed by the unchanged artwork-fidelity check. They do
not bypass final spacing, crossing or topology validation. No inverse solver is
involved.

Seven recoveries of `ABCDEFGHIJ` have been verified in the production generator:

| Font | Frame | Paper strips | Tips below 30° / below 45° |
|---|---|---|---|
| Nunito | Diamond | 12×12 | 0 / 3 |
| Nunito | Hexagon | 12×12 | 0 / 7 |
| Bree Serif | Diamond | 12×12 | 0 / 1 |
| Bree Serif | Hexagon | 12×12 | 0 / 6 |
| Oswald | Hexagon | 12×12 | 1 / 7 |
| Righteous | Diamond | 12×12 | 0 / 1 |
| Righteous | Hexagon | 12×12 | 0 / 6 |

The production audit covers all 60 long-text combinations across six fonts and
ten frames: **49 accepted / 11 refused / zero invalid**, including both JSON/SVG
handoffs. It finds seven recoveries and no regressions
(`curved-cuts-ten-letters.json` and `curved-cuts-ten-letters-rest.json`).
The heart and both paper sheets are rendered in `curved-cuts-gallery-{0,1}.png`
and `curved-cuts-other-gallery-{0,1,2}.png`, plus
`curved-cuts-righteous-gallery-{0,1}.png`, with matching SVGs. All seven have
been visually inspected.

After adding the fixed-outline pinch precheck, all seven recoveries were run
again. Their cutting controls are identical to the inspected outputs, and both
handoffs still pass (`curved-cuts-final-verify.json`). All seven IDs are now
pinned without removing any of the existing 2,794 success IDs. The combined
matrix retains the other preceding results: **2,801 accepted / 349 refused /
zero invalid** (`curved-cuts-current.json`). Text is **1,726 accepted / 302
refused**; figures remain **1,075 accepted / 47 refused**. This is a combined
record, not a fresh rerun of all 3,150 cases after the precheck change. The full
goal remains unfinished, including other sizes and the remaining icon catalog.

The two Nunito production outputs have exactly the same controls as their
prototype witnesses. A separate guarded rolling-disk audit at the grid's
assumed minimum width passes the diamond at resolution 1,400. The hexagon
remains uncertain at resolutions 1,400 and 2,100: the possible paper core stays
connected, but the conservative core has small separated regions. This is not
a physical strength certificate. The reports are `curved-material-hires.json`
and `curved-material-hexagon-2100.json`. An earlier diagnostic had the editor's
reversed left paths unfolded in the wrong direction; its failure report must
not be used. The corrected probe orients both families toward the fold first.

Type checking, lint and the production build pass; type checking retains the
seven existing warnings. The full unit run reports **1,090 passed / two timed
out** (`curved-cuts-tests-recheck.log`, 780 seconds). Both failures are the
existing Kalam A/ANNA ordinary-repeat regressions. A focused single-worker run
passes both in 8.08 and 8.78 seconds, within their unchanged 20-second limits
(`curved-cuts-kalam-focused.log`). Four paired runs against the preceding commit
produce identical cuts and similar times: A takes 7.83–8.12 seconds before and
7.92–7.94 after; ANNA takes 8.83–9.04 before and 9.05–9.29 after
(`curved-kalam-compare.json`). This does not establish the cause of the
full-suite timing difference, and the full run must not be reported as green.
All **177 inverse-engine tests pass** in the separate run
(`curved-cuts-inverse.log`). The check/lint/build logs are
`curved-cuts-{check,lint,build}-final.log`.

### Additional investigations

- Curving the connections during local route selection recovered single Cinzel
  R in a circle, on a 5×5 grid. Its successful construction uses one column and
  three filled rows. The eight-case trial is `curved-local-probe.json`, with the
  selected construction saved in `curved-r-construction.json`. This variant is
  not in production: replaying all recipes this way was substantially slower.
  Directly trying one/two columns and three filled rows recovered none of 156
  existing nonrepeating Cinzel corpus refusals (`curved-grid-cinzel.json`). R is
  outside that corpus, so its improvement does not change those totals.
- The global curved retry recovered none of the 47 previous figure refusals
  (`curved-retry-figures.json`). It recovered seven of 110 refused non-Cinzel
  text configurations (`curved-retry-text-other.json`), all included above.
  The 199-case Cinzel audit is still running in
  `curved-retry-text-cinzel.json`; its first 51 cases found no recoveries.
- A request-wide fitting-cache prototype is not enabled. In the paired probe
  it made Nunito's ten-letter hexagon slower (8.99 to 17.04 seconds), while
  Cinzel LOVE remained refused (44.80 to 40.75 seconds). The accepted output's
  maximum coordinate difference was 2.28e-13, with zero raster difference at
  600 pixels (`request-cache-compare.log`). These results do not establish a
  performance improvement.
- ANNA's remaining eight tips below 45° are joins between two visible outline
  edges (approximately 38°), rather than shared-cut junctions. Seven handle
  lengths from 5% to 35% preserve its 600-pixel weave exactly but leave all
  eight tips unchanged (`curve-angle-probe.json`). A separate local-routing
  prototype that prioritizes tip counts ahead of the existing cutting cost
  also finds no reduction (`tip-ranked-probe.json`). Neither experiment changes
  production's ANNA output or its exact 4×4 cyclic checkerboard. Forcing four
  connections on every letter also leaves at least eight tips, both with
  straight and curved shared connections (`four-port-checker-probe.json` and
  `four-port-curved-probe.json`); that extra construction is not enabled.
- The earlier Bree Serif M&M warning comes from discarded self-intersecting
  curved candidates, not out-of-range coordinates in the returned design.
  The final result is exactly the original design, with all controls in 0–100
  and zero raster difference (`smooth-bounds-report.json`).

## Previous performance: reuse translated outline fits

The two repeating-text frames now reuse fitted outline sections within a single
geometry conversion. Matching includes the fitting tolerance and every control
point relative to the section's origin. A rounded lookup key only finds a
candidate; reuse requires every relative coordinate to agree within 1e-10 in
the 0–100 frame. The translated fit retains the original endpoints exactly.
Stored controls are independent copies, and the cache holds at most 256 entries
before the conversion ends. Other generator frames and paint conversions keep
the existing path.

The full topology, spacing and artwork checks still run. No construction order,
outline, shared-cut rule or fitting tolerance has changed. Profiling the previous
amy checkerboard found 7.11 seconds in 1,696 curve-fitting calls out of 12.63
seconds overall (`conversion-profile.json`), mainly in rejected conversions.

Paired runs of the production implementation and a copy with reuse disabled:

| Nunito checkerboard text | Before | After |
|---|---:|---:|
| ANNA | 1,597 ms | 1,048 ms |
| amy | 13,823 ms | 7,921 ms |
| William | 20,710 ms | 7,082 ms |

The broader comparison includes all six fonts, both repeating frames, a
multiline input, accents and counters: ten accepted outputs and two unchanged
refusals. Every accepted pair has identical finger/segment counts, zero raster
difference at 600 pixels, and maximum control-coordinate difference below
1.35e-10 editor pixels. These observations ran alongside audits; they are not
browser latency guarantees. The report is `fit-cache-compare.json`. Sofie's
strict 45-degree tip counter changed from five to four at floating-point
rounding scale; this is not a physical cutting improvement.

The current ANNA heart and both cutting sheets were rendered and inspected in
`fit-cache-gallery-0.png` with its corresponding SVG. Its exact 4×4 cyclic field,
eight tips below 45° and zero tips below 30° remain. Browser inventory returned
no browsers and the native-pipe startup failure. No physical weaving trial has
been performed.

All **396 repeating-text configurations** were freshly audited, including
JSON/SVG handoffs, artwork fidelity and the editor's spacing check. There are
**273 accepted / 123 refused / zero invalid**, with no status changes or
regressions. The reports are `fit-cache-repeat.json` and `fit-cache-checker.json`.
The combined matrix, retaining the unchanged nonrepeating and figure results,
is `fit-cache-current.json`: **2,794 accepted / 356 refused / zero invalid**.
The pinned success set is unchanged. The full goal remains unfinished.

All **1,087 unit tests and 177 inverse tests** pass, together with type checking,
lint and the production build. Type checking reports seven existing warnings.
The final suite used `VITEST_MAX_WORKERS=2 npm test`; its log is
`fit-cache-tests-bounded.log`, alongside `fit-cache-{check-final,lint-final,build}.log`.
An earlier unrestricted rerun hit the existing handwritten-letter test's
20-second timeout during concurrent startup and was stopped. No test limit was
raised; the complete bounded run passes on the final source.

### Curved shared connections, not shipped

A prototype makes the shared cubic's endpoint tangent bisect the two outline
directions, with a handle length of 20% of the original connection's chord.
Both sheets use exactly the same curve. It keeps a change only after complete
conversion, spacing and fidelity checks and an improved tip count. The initial
per-construction trial adds work and can alter the later layout comparison;
it is not enabled in production. The comparison is `smooth-shared-probe.json`.
For amy it reduced tips below 45° from 12 to three, while the three tips below
30° remained and the 600-pixel woven preview was unchanged. The before/after
paper templates are `smooth-gallery-0.png`. Further work must check width and
cutting practicality, not merely the endpoint-angle score.

A second prototype applies this pass only to the final chosen construction,
retaining every earlier layout decision. Five paired probes preserve all their
visible pixels at 600 pixels. It reduces anna from three to two tips below 45°
and amy from 12 to three; ANNA, SØREN and Kalam ANNA remain unchanged. Needle-tip
counts do not improve. This is `smooth-final-probe.json`. A separate audit of
the 134 accepted checkerboards passes all 134, including both handoffs, with
zero regressions or invalid output (`smooth-final-checker.json`). The Bree Serif
M&M roundtrip logs a coordinate-range warning that needs investigation before
enabling the prototype. This experiment is not included in the production code
or its coverage totals.

## Previous coverage: attach to individual stroke tips

The combined default-size matrix now has **2,794 accepted / 356 refused / zero
invalid accepted output**. Text is **1,719 accepted / 309 refused**; figures remain
**1,075 accepted / 47 refused**. The checkerboard is **134 accepted / 64 refused**,
and ordinary repeat is **139 accepted / 59 refused**.

The repeating-text constructors can now attach to local maxima of the outline's
projection toward a gate. The former support point picks only the furthest
stroke in that direction; a letter such as m needs access to its separate legs.
The alternate candidate set uses the same bounded routing budget, exact font
outlines and coincident cuts. It runs only after the established constructions
fail, and reuses clear earlier cells. Successful existing designs retain their
cuts. The complete sheet still passes the unchanged topology, artwork-fidelity
and editor-spacing checks.

Three production recoveries have been rendered with both paper templates:

| Font | Text | Frame | Paper strips | Tips below 30° / below 45° |
|---|---|---|---|---|
| Nunito | amy | Checkerboard | 6×6 | 3 / 12 |
| Bree Serif | jul | Ordinary repeat | 6×3 | 0 / 3 |
| Bree Serif | Sofie | Ordinary repeat | 10×5 | 0 / 5 |

The ordinary repeats retain the intended 3×3 and 5×5 cyclic letter fields;
their paper-strip counts differ from their numbers of letter cells. The renders
are `tmp/generator/stroke-tip-gallery-{0,1,2}.png` with corresponding SVGs. They
remain digital validations, with no physical weaving trial. Browser inventory
returned no browsers and the same native-pipe startup failure. Construction
times in one run alongside audits were 13 seconds for amy, 0.77 seconds for jul
and 0.90 seconds for Sofie. Difficult-case latency remains unresolved.

A separate stage profile of amy took 12.8 seconds: the two rejected two-port
layouts spent **3.30 and 3.17 seconds** in conversion/validation, while the
successful mixed layout's conversion took **0.89 seconds**. Routing accounts for
about 5.4 seconds; the edge audit and artwork checks are small here. The evidence
is `stroke-profile-detail.json`, with two further totals in `stroke-profile.json`.
This identifies rejected conversions as a useful next performance target; none
of their final validation checks has been weakened or skipped in this change.

All **396 repeating-text configurations** were freshly audited on the final
production source, including JSON/SVG handoffs, artwork fidelity and the editor's
spacing check. There are no regressions or invalid outputs. The reports are
`stroke-tip-checker-final.json` and `stroke-tip-repeat-final.json`; the combined
matrix is `stroke-tip-current.json`. Other frames retain their preceding results.
All 2,794 success IDs are pinned in `scripts/generator/expected.json`; none were
removed.

All **1,083 unit tests and 177 inverse tests** pass, together with type checking,
lint and the production build. Type checking reports seven existing warnings.
The new complex amy regression uses the same 30-second allowance as the earlier
mixed-topology cases. The final suite log is `stroke-tip-tests-complete.log`,
alongside `stroke-tip-{check,lint,build}.log`.

The broad prototype audit of 247 other previously refused text cases finished
with 245 refusals and only the two Bree Serif repeat recoveries already included
above (`peak-text-probe.json`). It found no further accepted configurations.
The goal remains unfinished: 356 corpus configurations
still refuse, and most other sizes and the remaining searchable catalog are
unverified. These three recoveries do not imply universal support.

### Additional investigations, not shipped

- Using the actual editor scale for local checkerboard checks recovered none of
  eight difficult cases. Extending local routes along their actual grid
  continuations instead of the spoke tangent also recovered none of eight.
  These are `scaled-checker-probe.json` and `context-checker-probe.json`.
- Compound relief cuts in the mixed two-/four-port construction recovered none
  of eight probes (`compound-mixed-probe.json`).
- Independent exterior visibility routes cached per attachment, a larger
  attachment budget, and tighter visibility vertices did not recover the
  targeted refusals. Local stroke-tip candidates combined with exterior routes
  let amy complete its local construction but left a cut only **2.24 px** from a
  grid cut, below the **4.5 px** margin. Direct stroke-tip connections pass the
  complete checks; the exterior detours are not shipped. The full-sheet witness
  is `peak-full-witness.json`; `local-checker-witness.png` and
  `ranked-m3-witness.png` show the original shoulder bottlenecks.
- A broad prototype applying the new attachment choices to all constructions
  recovered none of the **47** previous figure refusals. The result is
  `peak-figure-probe.json`. Figure routing remains unchanged.
- Deeper component grids tried two/three columns and at least three/four rows,
  splitting the largest island either vertically or along its longer axis.
  The 56 combinations recovered none. Sixteen single-island cases initially
  hit the component-count guard and were rerun with that guard removed; they
  still failed local construction or the joined topology. These are
  `deeper-components-probe.json` and `deeper-single-components-probe.json`.

## Previous coverage: mixed two- and four-connection checkerboard letters

The combined default-size matrix now has **2,791 accepted / 359 refused / zero
invalid accepted output**, recovering five checkerboard configurations. Text is
**1,716 accepted / 312 refused**; figures remain **1,075 accepted / 47 refused**.
The checkerboard alone is **133 accepted / 65 refused / zero invalid**.

| Font | Text | Grid | Tips below 30° / below 45° |
|---|---|---|---|
| Nunito | Anna | 4×4 | 2 / 6 |
| Nunito | William | 14×14 | 63 / 175 |
| Oswald | GOD JUL | 6×6 | 12 / 24 |
| Kalam | ABCDEFGHIJ | 10×10 | 0 / 10 |
| Kalam | GOD JUL | 6×6 | 0 / 0 |

Each 2×2 letter group can now use a mixture of two- and four-port contour
constructions. Their connections interleave along the shared grid edges, with
paper-family assignments chosen from the compatible open-path pairings. Each
group still connects the same opposite boundary edges. The letter field, font,
checker colours and number of paper strips are unchanged. Counters still use
coincident cuts, never detached cutouts. Repeated local cells and failures are
cached; matching two-port geometry is reused from the earlier construction.

The new construction runs **after all existing recipes fail**. Moving it before
the wider two-port repair recovered the same five cases sooner, but a separate
comparison of the 20 earlier repair successes found five with worse tip counts,
including handwritten ANNA and Oswald A-B. That order was rejected. All 20
established quality measurements are restored in the final source, with three
new regression tests guarding representative cases. Five further regressions
cover the newly supported configurations and both editor handoffs.

All **198 checkerboard cases** were audited, then the 20 earlier repair successes
and five new cases were rerun after restoring the final recipe order. Every
accepted result passes JSON/SVG roundtrips, the editor's own spacing check and
the generator's artwork-fidelity check. There are no regressions. The merged
report is `tmp/generator/mixed-checker-merged.json`, backed by
`mixed-checker-final.json` and `mixed-restored-final.json`. The combined record
is `mixed-current.json`; other frames retain their preceding results. All 2,791
success IDs are pinned in `scripts/generator/expected.json`; none were removed.

All five finished hearts and both paper templates were rendered and inspected
in `tmp/generator/mixed-checker-gallery-0.png` through `-4.png`, with matching
SVGs. Hashes of their cuts match the final source's validation outputs. William
and the Oswald design remain intricate, as their tip counts show; no physical
weaving trial has been performed. Browser inventory again returned no available
browser and a native-pipe startup failure. Final construction times for these
cases are still several seconds, exceeding 20 seconds for William in a run
alongside tests. Difficult-case latency is not solved.

All **1,081 unit tests and 177 inverse tests** pass, together with type checking,
lint and the production build. Type checking reports seven existing warnings.
Logs are under `tmp/generator/mixed-checker-`, with `tests-final.log` for the
final full-suite run.

The full goal remains unfinished: 359 corpus configurations still refuse, and
most other sizes and the remaining searchable catalog are unverified. These
five recoveries do not imply universal support.

### Additional topology probes, not shipped

- Four connections in every cell produced valid open paths only when neighbouring
  contacts interleaved and the quadrants alternated their paper assignments.
  Using four connections everywhere still failed the targeted rejected glyphs;
  choosing the topology separately for each group recovered the five cases above.
- A six-port symbolic extension has 26 compatible group pairings, 15 involving
  six-port cells. Its eight tested difficult texts recovered none; local geometry
  still failed. The reports are `checker-sixport-symbolic.json` and
  `sixport-checker-probe.json`.
- Routing blocked shared spokes around the original glyph outlines inside their
  cell recovered none of five probes and added work. The bounded visibility-graph
  experiment is in `routed-spokes-probe.json` and is not in production.

## Previous quality: choose checkerboard connections per letter

The checkerboard now combines the best letter cells from its existing spacing
passes. The local score includes both paper paths where a connection meets a
grid line. This reuses cached geometry without another routing search. It skips
fitting unless the combined raw cuts improve, and keeps the earlier result unless
the complete exported template has fewer narrow tips and passes every validator.
An export with no tips below 45° returns without this additional pass.

- Nunito SØREN decreases from **40 to 30 tips below 45°**, with none below 30°.
- Lowercase Nunito anna decreases from **five to three tips below 45°**; its two
  tips below 30° remain. These are improvements, not claims of effortless cutting.
- Uppercase ANNA retains its 4×4 ANNA / NNAA / NAAN / AANN field and **eight tips
  below 45°**, none below 30°. The original unoptimized design had 34 and eight.
  JUL retains its broad connections, with no tips below 45°.
- Each letter outline, counter, colour arrangement and grid size is preserved.
  Counters still use coincident cuts rather than detached cutouts.

All **128 previously accepted checkerboard configurations** were freshly checked
across all six fonts: **128 accepted / zero refused / zero invalid**, including
JSON/SVG handoffs and the editor's spacing check. The report is
`tmp/generator/cell-quality-checker.json`. The 70 previous refusals do not enter
this new quality pass and were not rerun. The combined matrix remains **2,786
accepted / 364 refused / zero invalid accepted output**; results outside these
128 cases are retained from `wide-current.json`. Its updated combined record is
`cell-quality-current.json`. No expected success was removed.

The current generator's hearts and both cutting templates were rendered and
inspected in `cell-quality-gallery-0.png` (ANNA), `-1.png` (anna), and `-2.png`
(SØREN), with matching SVGs under `tmp/generator`. Browser inventory returned no
available browser and a native-pipe startup failure. There has been no physical
weaving trial. Single consecutive timing probes measured anna at 5.77→6.24 seconds
and SØREN at 9.89→11.48 seconds: the extra full-sheet fit still costs time when a
better combination is found. These measurements ran alongside regression checks
and are not latency guarantees. Difficult-case speed remains unresolved.

All **1,073 unit tests and 177 inverse tests** pass, together with type checking,
lint and the production build. Type checking reports seven existing warnings.
The 17 focused checkerboard/quality tests also pass on the final source. Logs
are `tmp/generator/cell-quality-{check,lint,build,tests,tests-focused}.log`.

The full goal remains unfinished: 364 corpus configurations still refuse, and
most other sizes and the remaining searchable catalog are unverified. This
change improves cutting quality for working layouts without weakening the
acceptance checks or claiming universal support.

### Additional figure probes, not shipped

- Sliding shared attachments along their original outline segment away from
  artificial seam endpoints removes the first coffee-cup pinch, but the complete
  cuts still fail spacing. None of 36 probes recovered a refused configuration.
- Swapping whole four-port cells between paper families tried 584 assignments
  across coffee, oval paw, sunburst paw and sunburst stars. Only the four original
  assignments compiled; the other 580 ended on the wrong paper edge. This is
  distinct from the earlier swaps of two-terminal islands within one cell.
- Constructing those four component layouts after a half-turn or reflection,
  then restoring the original artwork and sheet families, recovered none of 12
  probes. Their geometry problems remain. Reports are `slide-ports-probe.json`,
  `component-phase-probe.json`, and `component-symmetry-probe.json`.

## Previous coverage: wider component grids and a fitted envelope

The combined default-size matrix is **2,786 accepted / 364 refused / zero invalid
accepted output**. This batch recovers **16 figure combinations**. It freshly
checked all 1,122 figures, then repeated all 51 fitted-frame cases after adding
the common-envelope fallback. There are no regressions. The preceding full
3,150-case refresh and the 198-case checkerboard audit have also completed.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1711 | 317 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1075 | 47 | 0 |

The combined record is `tmp/generator/wide-current.json`. Fresh figure reports
are `wide-final-figure.json` and `wide-final-fitted.json`; the completed preceding
reports are `junction-current.json` and `quality-checker.json`. All 2,786 accepted
IDs are pinned in `scripts/generator/expected.json`; none were removed.

- Component grids now try two, three and four columns. They split the largest
  islands until each row is full and retain each piece's source island. Adjacent
  pieces of that island share a gate inside their filled seam. Every original
  outline and counter is retained, and artificial seams are stitched afterward.
- This recovers Tabler paw in circle, diamond, hexagon, rounded and scalloped
  frames, each in all three outer styles: **15 combinations**, all with 7×7 grids.
  The four toes occupy their own cells; the larger pad is divided beneath them.
  Its oval, sunburst, fitted, checked-tip and layered variants still refuse.
- A final fitted-frame recipe puts component-grid gates on the convex envelope
  of the complete motif. The outer cuts then project to the paper edges without
  adding a visible circular frame. Fidelity is checked over the **whole envelope**,
  including spaces between components. This recovers Tabler stars in the fitted
  template with a 5×5 grid. Existing successful recipes return before it.
- Six new regression cases cover the five paw frame shapes and the fitted stars,
  including JSON/SVG roundtrips and the editor's own cut-spacing checks.

The final generator's hearts and both cutting templates were rendered in
`tmp/generator/wide-final-hearts-and-cuts.png`. The paw/rays example has one tip
below 30° and two below 45°; the fitted stars have two below both thresholds.
A separate checked hexagon paw has one below 30° and nine below 45°. These are
still intricate paper cuts; there has been no physical weaving trial. Browser
inventory again returned no available app or browser.

All **1,072 unit tests and 177 inverse tests** pass, together with type
checking, lint and the production build. Type checking reports seven existing
warnings. Logs are `tmp/generator/wide-{check,lint,build,tests}.log`.

The goal remains unfinished: 364 default-size configurations still refuse,
most other sizes and the rest of the searchable catalog remain unverified, and
difficult-case latency remains unresolved. These recoveries are progress toward
the full goal, not a claim that the corpus or all combinations now work.

### Additional probes, not shipped

- Giving individual fitted components their own silhouette projections recovered
  none of 20 three-/four-column probes; those projections can cross another
  component. The common envelope recovered the stars in a subsequent 30-case probe.
- Uniform divisions, axis-aligned gap contacts and larger three-/four-row grids
  recovered no further failing figures. The larger grids encountered new local
  topology problems rather than clearing the oval paw's tight join.
- The coffee cup's three-column layout has a 0.087-unit pinch where a steam
  connection approaches an artificial division. Testing 49 division-fraction
  pairs still recovered none; it needs a different connection or decomposition.
  A separate 40-case probe that rejected shared attachments near seam endpoints
  recovered no additional failures and also rejected the valid wider paw route.
  That stricter local acceptance rule is not shipped.

## Previous coverage: fewer sharp checkerboard tips and complete sunburst grids

The checkerboard frame now considers one more connection spacing after finding
a valid design. It keeps a candidate only when the complete exported template
has fewer narrow tips and passes the unchanged topology, spacing and artwork
checks. It stops when no tips below 45° remain and skips curve fitting for worse
raw candidates. The additional search does not run for an already refused input.

- Nunito ANNA remains exactly 4×4, with ANNA / NNAA / NAAN / AANN. Its actual
  exported tips below 45° decrease from ten to **eight**, with none below 30°.
  The original unoptimized template had 34 below 45°, including eight below 30°.
- The direct SØREN probe improves from 55 to 40 tips below 45°, with none below
  30°. JUL retains its original broad connections; tighter candidates were worse
  or failed spacing. The original Oswald ANNA route is also retained.
- Failed sunburst figures can retry their four-port medallion using the complete
  five-strip grid. Its outer band adds two strips to each sheet. Earlier valid
  layouts return first, and full-sheet spacing checks remain unchanged. This
  recovers the authored gift and Phosphor paw, each with 5×5 grids and no cutouts.

All **51 sunburst configurations** were freshly checked: **47 accepted / four
refused / zero invalid output**, with two recoveries and no regressions. The
report is `tmp/generator/quality-sunburst.json`; the combined record with prior
results retained elsewhere is `quality-current.json`. The completed 198-case
checkerboard audit has 128 accepted / 70 refused / zero invalid output and no
regressions. The preceding full 3,150-case refresh also finished with no regressions. All 2,770 accepted IDs, including these two new
figure cases, are pinned in `scripts/generator/expected.json`.

The finished ANNA heart and both cutting templates before and after the change
were rendered and inspected in `tmp/generator/quality-text-before-after.png`.
The repaired figures are in `quality-sunburst-cuts.png`: gift has four cut tips
below 45° and none below 30°; paw has none below 45°. These are digital checks,
not physical weaving trials. Browser inventory again returned no available app
or browser, so a live interface check was unavailable.

Type checking, lint and the production build pass (seven existing type-check
warnings). All 1,066 unit tests pass: the full run passed 1,065, and the one
handwritten-cell cache test that timed out under concurrent audit load passed
its isolated rerun in 7.2 seconds. All 177 inverse tests pass. Logs
are `tmp/generator/quality-{check,lint,build,tests,retry,inverse}.log`.

The broader goal remains unfinished. At least 380 default-size matrix cases
remain refused, most other sizes and the rest of the searchable catalog remain
unverified, and difficult-case latency remains unresolved. The new sunburst
fallback takes about 1.1 seconds for gift and 13.2 seconds for paw in this run,
because it preserves all established recipes before retrying the complete grid.

### Additional probes

Counting every outer band in all local panel, component and fitted routes
recovered the same two sunburst figures in a 65-refusal probe. A complete
102-case sunburst/layered probe had no regressions, but changed several existing
layered grids. That broader change is not shipped: the final implementation uses
only the four-port sunburst retry needed for the verified recoveries.

## Previous coverage: clipping touching contours

The combined default-size matrix has **2,768 accepted / 382 refused / zero invalid
accepted results**. The full refresh completed all **3,150 cases**: all 1,122
figure configurations and all 338 text configurations for each of Nunito,
Bree Serif, Oswald, Righteous, Kalam and Cinzel. There were four gains, no
regressions and no invalid accepted output.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1711 | 317 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1057 | 65 | 0 |

The combined record is `tmp/generator/junction-current.json`. Completed reports
are `junction-{figure,nunito,breeserif,oswald,righteous,kalam,cinzel}.json`. All 2,768 accepted IDs are pinned in
`scripts/generator/expected.json`; none were removed.

- Clipping can produce a shared vertex belonging to more than one closed
  contour. An even-degree junction now yields separate closed walks instead
  of an ambiguity error or one self-touching outline. Each original boundary
  edge is retained once, and the even-odd artwork stays the same. Unpaired and
  open boundaries remain errors.
- This recovers Phosphor butterfly in all three oval styles, with 5×5 grids,
  and Phosphor rabbit in the layered frame, with a 10×10 grid. Their complete
  generated paths and JSON/SVG/editor handoffs pass all existing checks.
- Three focused clipping tests cover touching islands, a counter touching its
  parent, and three islands meeting on the divider. They compare the clipped
  fill with the original on both sides of the divider and with reversed input
  contour order and direction. The eight-test panel suite passes.

Both finished hearts and both cutting templates for each were rendered and
inspected in `tmp/generator/junction-hearts-and-cuts.png`. Butterfly has no cut
tips below 45°; rabbit has two below 30° and ten below 45°, including its ears.
The cuts remain intricate, with no physical weaving trial. Browser inventory
again returned no app or browser, so a live interface check was unavailable.

All **1,064 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Type checking reports seven existing warnings.
Logs are `tmp/generator/junction-{tests,check,lint,build}.log`.

The goal remained unfinished after this batch: 382 matrix configurations were
still refused, most non-default sizes and the rest of
the searchable catalog remain unverified, and difficult-case latency is unresolved.

### Additional investigations, not shipped

- Treating every odd-degree clipping vertex as a divider endpoint fixes an
  isolated touching-square/triangle Boolean example without changing its fill.
  However, a separate completed probe of all 65 remaining figure refusals
  recovered none. This broader endpoint rule remains experimental.
- Adaptive letter-panel dividers placed between contour coordinates recovered
  none of 96 direct probes: Cinzel P, E, R and PIP in three frames, four layouts
  and two paddings. Moving whole figure components directly onto the fitted
  frame also recovered none of that frame's 11 refusals.
- [Weaving Paper into Star Patterns](https://archive.bridgesmathart.org/2020/bridges2020-427.pdf)
  discusses changing sheets at extra vertices, but its more complex examples
  cut one sheet into separate components. It therefore does not provide a direct
  replacement for this generator's open-strip, no-detached-piece requirement.

## Previous coverage: repair complete layouts and give bent text connections room

The current default-size matrix has **2,764 accepted / 386 refused / zero invalid
accepted results**. This batch freshly retested all 75 previous figure refusals:
**six now pass, 69 remain refused, and none produced invalid accepted output**.
The other 3,075 records retain their preceding audit results; this was not a
fresh full-matrix run.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1711 | 317 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1053 | 69 | 0 |

The combined report is `tmp/generator/shared-current.json`; the fresh figure
report is `shared-final.json`. All 2,764 accepted IDs are pinned in
`scripts/generator/expected.json`; none were removed. Ordinary and checkerboard
repeat remain at 137/198 and 128/198.

- Complete figure layouts that fail spacing or crossing checks are retained
  while the other recipes run. If every recipe fails, the bounded shared-cut
  detours can repair these layouts too. Their visible contours, graph endpoints,
  selected frame and artwork remain fixed. Changed cuts are recompiled and pass
  all existing topology, spacing, fidelity and JSON/SVG/editor checks.
- This recovers Tabler stars in the checked-tip frame (6×6), Tabler palette in
  the layered frame (7×7), bicycle in the sunburst frame (5×5), and bicycle in
  all three scalloped styles (3×3). Already successful constructions return
  before these repairs; unchanged failed edges skip another fit.
- Framed text can combine bent connections with the air layout's wider cell
  padding. Outside the matrix, standalone Cinzel `P` now works in woven, circle,
  diamond, rounded and scalloped frames, all with 3×3 grids. Its earlier air
  success remains; hexagon and oval still refuse P. The counter remains part
  of the paper through coincident cuts.
- A direct probe of that wider text recipe covered all 165 previous non-repeating,
  non-air text refusals plus those seven P frames. It recovered the five P cases
  only. This does not establish support for arbitrary P-containing words, and
  these recipe probes are not fresh full-generator matrix records.

Five finished hearts and both templates for each were rendered and inspected in
`tmp/generator/shared-hearts-and-cuts.png`: stars, palette, the two new bicycle
frame families and P. The respective cut-tip counts below 30°/45° are 2/4, 4/6,
2/2, 2/2 and 0/0. These remain intricate cuts, with no physical weaving trial.
Browser inventory again returned no available app or browser, so there was no
live interface check.

All **1,057 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Type checking reports seven existing warnings.
Logs are `tmp/generator/shared-{tests,check,lint,build}.log`.

The goal remains unfinished: 386 default-size matrix cases are refused, and the
rest of the searchable catalog and most non-default sizes remain unverified.
The newly accepted bicycle repairs still took roughly 5.8–7.4 seconds locally;
difficult-case latency and the earlier browser slowdown remain unresolved.

### Additional probes, not shipped

- Routing shared cuts in four different orders while ignoring connections not
  yet routed did not add gains in paw, coffee, bicycle, butterfly or moon/stars.
  The paw's two middle connections still cross neighboring upper pads.
- Combining bent connections with filled-seam letter panels added no gains in
  120 direct probes: Cinzel P, E, R and PIP, three frames, five panel layouts and
  two paddings. These extra combinations are not production fallbacks.

## Previous coverage: separate figure components and shared-cut detours

The current default-size matrix has **2,758 accepted / 392 refused / zero invalid
accepted results**. This batch freshly tested 179 distinct figure configurations:
all 86 previous figure refusals, all checked-tip and sunburst figures, and all
previous bicycle successes. There are **11 gains and no regressions** in that
scope: 104 accepted, 75 refused. The other 2,971 records retain their preceding
audit results; this was not a fresh full-matrix run.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1711 | 317 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1047 | 75 | 0 |

The combined report is `tmp/generator/components-current.json`. Fresh reports are
`components-final.json`, `bent-corner-final.json` and `bent-sunburst-final.json`;
the 90-case component report takes precedence where their scopes overlap.
All 2,758 accepted IDs are pinned in `scripts/generator/expected.json`; none were
removed. Ordinary and checkerboard repeat remain at 137/198 and 128/198.

- Separate figure islands can occupy individual cells in a two-column grid.
  Counters stay with their parent island. If the island count is odd, the largest
  is split into two cells and its artificial seam is stitched away. The original
  visible artwork is retained. This recovers the bicycle in the rays, checked
  and plain variants of the circle, hexagon and rounded frames, using 4×4 grids.
- Adjacent cells share gates near their outlines, avoiding intervening islands.
  Coincident A/B connections can detour around other cuts using a bounded
  visibility graph. Only shared connections move; endpoints and visible outlines
  stay fixed. Crossing, topology, spacing and artwork validation still apply to
  the complete sheets and their JSON/SVG/editor round trips.
- Bent outline approaches also recover Phosphor sailboat in the six-strip
  checked-tip frame and Tabler gift in the five-strip sunburst frame. All these
  constructions are final fallbacks, preserving earlier successful layouts.

A separate fresh audit tested all 51 checked-tip figures at three non-default
sizes. These 153 cases are outside the matrix above:

| Motif size | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|
| 45% | 48 | 3 | 0 |
| 55% | 48 | 3 | 0 |
| 85% | 47 | 4 | 0 |

The 45% bicycle is newly accepted; no earlier success was lost. Reports are
`tmp/generator/bent-corners-scale-{45,55,85}.json`. These checks do not cover all
slider values or non-default sizes in the other frames.

The bicycle, sailboat and gift hearts and both cutting templates for each were
rendered and inspected in `tmp/generator/component-hearts-and-cuts.png`. Their
cut-tip counts below 30°/45° are 1/1, 0/0 and 0/0, respectively. The cuts remain
intricate; there has been no physical cutting or weaving trial. Browser inventory
returned no available app or browser, so no live interface check was possible.

All **1,048 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Type checking reports the seven existing
warnings. Logs are `tmp/generator/components-{tests,check,lint,build}.log`.
The newly recovered bicycle layouts took roughly 4.2–4.8 seconds in the local
production audit; this is still too slow for smooth iteration and is not a
browser latency measurement.

The goal remains unfinished: 392 default-size matrix cases are refused, and the
rest of the searchable catalog and most non-default sizes remain unverified.
Difficult-case latency and the earlier browser slowdown remain unresolved.

### Additional investigations, not shipped

- Trying each root island as the contour-chain anchor did not recover the
  probed paw, coffee or bicycle cases. Changing the component routing to the
  practical or balanced variants added no gains over the ordinary route.
- The Tabler paw's nearly touching upper pads remain separated even when its
  original SVG is flattened at much finer tolerances. This is not simply a
  stored-coordinate rounding contact; the artwork was not merged or smoothed.
- Paw routes can be topologically valid yet fail spacing near a pad tip. Moving
  the gate alone trades that pinch for an intersection elsewhere. The current
  shared-cut detours recover the bicycle but still do not resolve the paw.

## Previous coverage: bent shared connections

The current default-size matrix has **2,747 accepted / 403 refused / zero invalid
accepted results**. This batch freshly tested 93 previously refused text cases:
all 63 ordinary-repeat refusals and all 30 non-repeating refusals outside Cinzel.
Two now pass, 91 remain refused, and none produced invalid accepted output. The
other 3,057 records retain their preceding audit results; this was not a fresh
full-matrix run.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1711 | 317 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1036 | 86 | 0 |

The combined report is `tmp/generator/bent-current.json`; the fresh reports are
`bent-final-repeat.json` and `bent-final-framed.json`. All 2,747 accepted IDs are
pinned in `scripts/generator/expected.json`; none were removed. Ordinary repeat
now accepts 137/198 configurations; checkerboard repeat remains at 128/198.

- Shared connections can approach a letter along its outward normal or corner
  bisector, with a short bend before returning to the cell gate. This avoids a
  grazing approach that leaves a narrow hook. The outline, counter and visible
  background remain unchanged. Bends are precomputed for the fixed attachment
  candidates, and the existing crossing, topology, fidelity and spacing checks
  still apply.
- These constructions run only after the established recipes fail. Repeated
  text reuses completed cells when a local cell fails. A failure after joining
  completed cells instead rebuilds their connections. The existing practical
  and balanced routing budgets are retained.
- Nunito `William` and `ÆØÅ` now work in the ordinary repeating frame, using
  14×7 and 6×3 strip grids. Their editor and SVG round trips pass independently.
  This does not change the checkerboard ANNA design or its 4×4 letter field.
- A separate probe outside the matrix recovers standalone Cinzel `P` in the air
  frame, using a 3×3 grid with its counter connected by coincident cuts. The seven
  other non-repeating frames still refuse P. Eight additional P-containing words
  or multiline inputs also remain refused, so this is not general P support.

All three finished hearts and both templates for each were rendered and inspected
in `tmp/generator/bent-hearts-and-cuts.png`. The repeated layouts remain intricate;
there has been no physical cutting or weaving trial. Browser inventory again
returned no available app or browser, so no live interface check was possible.

All **1,039 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Type checking reports the seven existing
warnings. Logs are `tmp/generator/bent-{tests,check,lint,build}.log`.

The goal remains unfinished: 403 default-size matrix cases are refused, and the
rest of the searchable catalog and most non-default sizes remain unverified.
Difficult-case latency and the earlier browser slowdown remain unresolved.

### Additional probes, not shipped

- Applying bent connections throughout every recipe rather than as a fallback
  did not recover the 20 Cinzel/air refusals. An exploratory 95-case mixed text
  audit was stopped after 51 saved results once the production fallback audits
  superseded it; it is not a completed coverage report.
- Applying bends to the four remaining checked-tip figure failures recovered
  Phosphor sailboat, with no invalid accepted output in that four-case prototype.
  The figure routing API does not yet expose this option; this is a candidate
  for the next integration and regression audit, not part of the matrix above.

## Previous coverage: checked-tip routing and border space

The current default-size matrix has **2,745 accepted / 405 refused / zero invalid
accepted results**. This batch freshly tested all 51 figures in the checked-tip
frame: **47 accepted / four refused**, recovering 14 configurations with no
regressions. The other 3,099 records retain their preceding audit results; this
was not a fresh full-matrix run.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1709 | 319 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1036 | 86 | 0 |

The combined report is `tmp/generator/corner-current.json`; the fresh report is
`corner-final.json`. All 2,745 accepted default-size IDs are pinned in
`scripts/generator/expected.json`; none were removed. Both repeat-text results
remain unchanged at 135/198 and 128/198.

- The checked-tip frame now tries practical two-port routing after its old
  three-lane contour chain fails. Counters use coincident A/B bridges, and each
  lane still provides one open cut in each sheet. This recovers both gifts,
  cookie, moon and stars, the authored snowflake, cat, butterfly, rabbit, paw
  print, bicycle, smiley, Tabler butterfly and palette.
- Coffee additionally needs its steam curls in the side lanes. Connections
  approach each side lane's artwork near its own vertical extent, then continue
  outside the whole motif. They no longer run diagonally through the cup.
- At large motif sizes, fixed outside routes could cross the outer bands. Two
  final constructions fit those routes into the available border space. Band
  widths retain at least the grid clearance, and the bypass stays inside them.
  The motif size, selected frame and six-strip layout remain. Unchanged fallback
  constructions skip repeated curve fitting.

A separate fresh audit tested the same 51 figures at three non-default sizes:

| Motif size | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|
| 45% | 47 | 4 | 0 |
| 55% | 48 | 3 | 0 |
| 85% | 47 | 4 | 0 |

These 153 cases are outside the default-size matrix. Fitting the border recovered
41 of the 45 previously refused cases at 85%, with no loss of earlier successes
at any of these three sizes. The reports are `corner-scale-final-{45,55,85}.json`
in `tmp/generator`. This does not cover all slider values or the other frames at
non-default sizes.

Eight finished hearts and both paper templates for gift, coffee, bicycle and a
large gift were rendered and inspected. The artifacts are `corner-hearts.png`
and `corner-cuts.png` in `tmp/generator`. The cuts remain intricate; no physical
weaving trial has been performed.

All **1,036 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Type checking reports the seven existing
warnings. Logs are `tmp/generator/corner-{tests,check,lint,build}.log`. Browser
inventory still returns no available app or browser, so the live interface
check could not run.

The goal remains unfinished. At the default size the checked-tip frame still
refuses Tabler stars, sailboat, crown and Tabler paw. The combined matrix still
has 405 refusals, and the rest of the searchable catalog and most non-default
sizes are unverified. Browser latency remains unresolved.

### Additional investigations, not shipped

- Allowing even-degree shared-point vertices in clipping did not recover the
  tested coffee/circle-rays case. Rejecting collinear shared-cut overlaps,
  considering convex as well as concave relief corners, and independently
  placing whole-letter gates using filled scan intervals did not recover the
  separately tested Cinzel P, E or R.
- The saved divided R network has cycle rank 17. Exhausting all 131,072
  parity-preserving cycle assignments on those existing edges produced 15,616
  degree-valid graphs, but every one still connected an A path to the wrong
  paper edge. This witness requires different connections; changing sheet
  assignments or removing shared segments within that fixed network cannot
  repair it. The diagnostic is `cycle-space-probe.log` in `tmp/generator`.
- Flipping complete checked-tip lanes did not recover the five cases left by
  practical routing. Splitting the motif into three two-port panels did not
  recover the final four default-size refusals. Neither extra search is part of
  the production fallback.

## Previous implementation: reuse curve-fitting calculations

Curve fitting now evaluates each Bernstein basis once for both coordinates and
reuses derivative control points across the samples of each Newton pass. The
arithmetic order, fitting tolerance, candidate routes and validation rules remain
unchanged. The following source-level comparisons returned exactly equal full
design objects (or the same refusal), across three alternating before/after runs:

| Input | Frame | Median before | Median after | Result |
|---|---|---:|---:|---|
| Nunito ANNA | Checkerboard repeat | 1,128 ms | 1,087 ms | Identical design |
| Nunito JUL | Checkerboard repeat | 1,152 ms | 985 ms | Identical design |
| Kalam ANNA / BO, two lines | Hexagon | 4,224 ms | 3,964 ms | Identical design |
| Cinzel BO | Circle | 7,254 ms | 6,605 ms | Identical design |
| Oswald ÆØÅ | Air | 5,179 ms | 5,063 ms | Same refusal |

These are local Node observations, not browser latency guarantees. The report is
`tmp/generator/fitter-benchmark.json`. Separate comparisons of the gift/circle-rays
and Phosphor snowflake/rounded-check figures also returned identical full designs.
The current ANNA cutting template was rendered and inspected: its 4×4 field and
cut-tip counts remain unchanged at zero below 30° and ten below 45°. There has
been no physical weaving trial. Browser-control inventory still has no
available browser; the previously observed browser slowdown remains unresolved.

All **1,031 unit tests and 177 inverse tests** pass, as do type checking, lint and
the production build. Type checking still reports the seven existing warnings.
The logs are `tmp/generator/fitter-{tests,check,lint,build}.log`.

There are no additional accepted configurations from this batch. The latest
combined matrix remains **2,731 accepted / 419 refused / zero invalid accepted
results**, as recorded below; it was not freshly rerun for this arithmetic reuse.
The wider goal remains unfinished, including unsupported text, figures and
unverified catalog entries.

### Additional topology investigations, not shipped

- Parent-counter corner attachments and independent corner/ray choices for the
  two counter bridges did not recover the separately probed Cinzel P or R.
- Whole letters with six, eight or ten ports and coincident internal chords can
  produce open topology for P, E and R in some layouts, but those results still
  fail full-sheet spacing. A 30-case prototype audit of other refused framed
  texts added no accepted output. Its multiline strip-limit guard was overly
  restrictive, so this does not exhaust all proposed multiline variants.
- Cancelling closed edge cycles while retaining the visible outline did not
  repair the R witness or any of the 19 refused bicycle templates tested.
- Separating the R witness's degree-four junctions into adjacent, noncrossing
  connections removes the branches, but all 64 combinations still connect at
  least one path to the wrong paper edge. Four separation radii gave the same
  result; branch removal alone is insufficient. These experimental geometries
  are not accepted exports.

## Previous coverage: divide the ink, retain the outer margin

The current 3,150-configuration matrix has **2,731 accepted / 419 refused / zero
invalid accepted results**. This batch freshly retested all 60 BO configurations
across six fonts and ten frames: **54 accepted / six refused**, with two gains
and no regressions. The other 3,090 records retain their preceding audit results;
this was not a fresh full-matrix run.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1709 | 319 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1022 | 100 | 0 |

The combined record is `tmp/generator/ink-current.json`; the fresh report is
`ink-final-bo.json` in the same directory. All 2,731 accepted IDs are pinned in
`scripts/generator/expected.json`; none were removed. Ordinary repeat and
checkerboard results remain 135/198 and 128/198.

- A final 2×5 panel layout places the internal seams over the letter's ink
  dimensions, excluding its cell padding. The outside gates and margin remain.
  Clipping and stitching use the same seam positions, and shared contacts still
  land inside solid intervals. This avoids spending the extra panels on empty
  margins. The layout is skipped if its grid would exceed the 20-strip limit.
- Cinzel BO now works in circle and scalloped frames, using 10×10 grids. The
  exact font contours and counters remain. The new recipe runs only after all
  earlier constructions fail; established successful routes remain available.
- An exploratory sweep of all 188 previously refused framed-text cases found
  these two gains. Wider practical routing over the other 186 cases added none,
  so that extra work is not part of the production fallback. The discarded
  experiments are recorded below to guide further work.

All **1,031 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Both finished hearts and both paper templates for
each new layout were inspected. The serif details remain intricate, and there
has been no physical weaving trial. Browser-control inventory still returns no
available browsers, so the final interface check could not run.

The goal remains unfinished: 419 matrix configurations are refused, including
186 non-repeating text cases (156 Cinzel, 14 Oswald, seven Bree Serif, and three
each in Nunito, Kalam and Righteous). Separate probes also found that Cinzel P
and R in the air frame remain refused; these single-letter inputs are outside
the 34-text matrix. The rest of the searchable icon catalog and non-default
figure scales remain unverified. Difficult-case latency and the earlier browser
slowdown are unresolved. No claim of universal support follows from this matrix.

### Exploratory results from this batch

- Changing the paper assignment of separate motif components, with direct use
  of existing contact points, did not recover the tested Tabler paw, Phosphor
  coffee, fitted butterfly or bicycle. The paw's upper pads have a tiny gap in
  the rounded source coordinates rather than one exact shared vertex. This is
  distinct from the bicycle's and butterfly's exact contour contacts.
- Empty figure panels with coincident elbow joins, larger uniform text grids,
  multiple relief chords ranked by narrow gaps, and smooth-turn attachment
  candidates did not recover the targeted failures. They were not shipped.
- A four-bridge counter prototype has valid topology: on a synthetic annulus,
  24 of 216 candidates had the prescribed open pairs, no crossing shared cuts
  and valid clearance. It did not recover Cinzel 2026, P or R in the tested
  layouts and is not in production. The next counter investigation should
  examine the actual failing bridges and their parent-outline attachment
  choices, rather than assuming that more bridges alone solve the pinch.
- The saved R/air/2×5 edge witness has degree-four joins after stitching: some
  contain two same-sheet outline edges plus two shared edges; others contain
  four shared edges. Trying the next filled interval on either seam axis did
  not repair this layout. This is a panel-topology problem, not a tolerance or
  floating-point rounding problem. The witness is in
  `tmp/generator/ink-witness-R.json`; the subsequent parent-attachment experiment
  is recorded above and did not recover P or R.

## Previous coverage: solid seams in divided letters

The current 3,150-configuration matrix has **2,729 accepted / 421 refused / zero
invalid accepted results**. This batch freshly retested all 120 B/BO configurations
across six fonts and ten frames: **109 accepted / 11 refused**, with six gains
and no regressions. The remaining 3,030 records retain their preceding audit
results; this was not a fresh full-matrix run.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1707 | 321 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1022 | 100 | 0 |

The combined record is `tmp/generator/stem-current.json`. All 2,729 accepted IDs
are pinned in `scripts/generator/expected.json`; none were removed. The two fresh
reports are `stem-final-b.json` and `stem-final-bo.json` in the same directory.
The ordinary repeat and checkerboard results remain 135/198 and 128/198.

- Two final text layouts divide each letter into three horizontal panels, with
  either one or two columns. Internal connections move into the widest solid
  interval of the shared seam, avoiding counters. Neighbouring panels agree on
  the connection; the visible outline, selected font, frame and spacing checks
  remain unchanged. The one-column layout skips its full-sheet fit if no seam
  connection moved. These layouts run only after the earlier recipes fail.
- Cinzel B now works in woven, air, circle, rounded and scalloped frames; Cinzel
  BO also works in rounded. The results use 5×5, 6×6 and 8×8 grids. An exploratory
  run over all 194 previously refused non-repeating text configurations found
  these same six gains, but only the final production B/BO runs replace records
  in the combined report.
- Trial rays that miss a contour now return a missing result directly instead
  of throwing a routine exception. The public ray operation still throws on
  failure. Five compiled-worker comparisons returned byte-identical results
  before and after this change. Single-run Node timings were mixed; this is not
  a latency guarantee and did not resolve the browser slowdown.

All **1,029 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Six representative finished-heart renders and
both paper templates for B/circle and BO/rounded were inspected. These preserve
the serif details and have no closed cutout loops, but remain intricate patterns.
The final interface check could not run because the browser-control inventory
returned no available browsers. The previous two-line Kalam check on the ray-only build
reached a valid result but still took about 141 seconds before thumbnail work
began, while Node took 4.37 seconds. These concurrent observations do not isolate
the cause; no browser settings were changed.

The goal remains unfinished: 421 tested configurations are still refused,
including 188 non-repeating text cases (158 Cinzel, 14 Oswald, seven Bree Serif,
and three each in Nunito, Kalam and Righteous). The rest of the searchable icon
catalog and non-default figure scales remain outside this matrix. Difficult
cases still take too long. Artwork fidelity, open cuts, clearance and JSON/SVG
handoffs are checked digitally; no physical weaving trial was performed.

## Previous coverage: adaptive contacts for framed letters

The current 3,150-configuration matrix has **2,723 accepted / 427 refused / zero
invalid accepted results**. This batch retested all 291 previously refused
non-repeating text configurations: **97 now pass and 194 remain refused**.
Previously accepted layouts, the two repeat frames and the figures retain their
preceding audit results; their successful construction paths are unchanged.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1701 | 327 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1022 | 100 | 0 |

The combined record is `tmp/generator/text-gates-current.json`. All 2,723 accepted
IDs are pinned in `scripts/generator/expected.json`; none were removed. The latest
refusal retest is assembled from the 59-case probe, the saved 61-case remainder
prefix and three complete 57-case tail shards, with no duplicate or missing IDs.
The ordinary repeat and checkerboard results remain 135/198 and 128/198.

- A final framed-text construction moves opposite connections along the cell
  edges, by at most 20% of the cell width or height. The nine candidate position
  pairs keep the font outlines, counters and connection order. Only whole-letter
  cells use this operation; divided letters retain their shared seam contacts.
- The cache copies both the chosen cuts and the shifted contacts when a letter
  repeats. No full-sheet fit is repeated when all contacts retain their original
  positions. Wider attachment search is conditional on an actually crowded
  earlier search, and the full spacing and topology checks still apply.
- Kalam handwriting gains 81 framed configurations, including names, Danish
  letters and two- and three-line arrangements. Oswald gains nine, including
  `juleman`, `æøå` and `Åse`; Righteous gains seven. No other font is substituted.
  The new construction runs only after the established recipes fail.

All **1,022 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Six representative renders were inspected. The handwritten ANNA hexagon has a
matching main preview and selected thumbnail and reaches the editor as a 6×6
weave without warnings. The two-line handwritten ANNA/BO hexagon also has a
matching preview/thumbnail and reaches the editor as a 7×7 weave without warnings.
The corpus checks artwork fidelity, open cuts, clearance
and both JSON/SVG handoffs. No physical weaving trial was performed.

The goal remains unfinished: 427 tested configurations are still refused,
including 194 non-repeating text cases (164 Cinzel, 14 Oswald, seven Bree Serif,
and three each in Nunito, Kalam and Righteous). The rest of the searchable icon
catalog and non-default figure scales remain outside this matrix. Difficult
cases still take too long; these audit timings are not latency benchmarks.
In the browser check, the two-line Kalam hexagon took roughly 109 seconds before
thumbnail generation began, despite a 21 ms font load and a visible page. The
same production worker bundle returned an accepted result in 4.78 seconds in
Node, close to its 4.51-second source audit. The cause of this browser slowdown
is unresolved; no browser throttling or settings were changed. These concurrent
single runs are diagnostic observations, not performance guarantees.

## Previous coverage: independent letter contacts and filled panel seams

The current 3,150-configuration matrix has **2,626 accepted / 524 refused / zero
invalid accepted results**, with no regressions. This batch freshly reran all
198 checkerboard text cases and all 1,122 figures. The other 1,830 text results
come from the preceding audit; their construction paths are unchanged.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1604 | 424 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1022 | 100 | 0 |

The combined record is `tmp/generator/cell-repair-current.json`. All 2,626 accepted
IDs are pinned in `scripts/generator/expected.json`; none were removed. This adds
20 checkerboard configurations and 21 figure configurations. Checkerboard repeat
now accepts 128/198 cases; ordinary repeat remains 135/198.

- Failed checkerboard cells try independent positions for their two connections.
  The first remains before its edge midpoint and the second after it, preserving
  connection order between adjacent letters. The bounded nine-pair search uses
  the existing clearance and open-cut tests. Completed cells are reused across
  ordinary, balanced and repair passes; unchanged full designs are not refitted.
  Recoveries include Nunito `jul` and `Hej!`, Bree Serif `Anna` and `M&M`, Oswald
  `William` and multiline text, and Kalam `ANNA` and accented initials.
- Two final figure panel layouts put shared connections in the widest filled
  interval of a seam. Phosphor moon and stars now works in diamond and oval,
  in all three styles, with 5×5 grids. The authored snowflake works in circle,
  diamond, hexagon, rounded and scalloped frames in all three styles, with
  8×8 grids. Both neighbours use the same connection; counters are not cut out.
- Existing successful designs retain their routes, fonts, motifs and selected
  frames. The earlier ANNA cut-tip improvement remains unchanged.

All **1,007 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Six representative renders were inspected. Browser verification covered the
Kalam ANNA checkerboard's matching preview and selected thumbnail and 4×4 editor
handoff, plus the snowflake's matching preview/thumbnail and 8×8 editor handoff.
The corpus checks artwork fidelity, open cuts, clearance and JSON/SVG roundtrips.
No physical weaving trial was performed.

The goal remains unfinished: 524 tested configurations are still refused. The
rest of the searchable icon catalog and non-default figure scales also remain
outside this matrix. Difficult cases still take too long; the concurrent audit
is not a latency benchmark. Historical counts below describe earlier audits.

## Previous coverage: shifted panels and touching counters

The current 3,150-configuration matrix has **2,585 accepted / 565 refused / zero
invalid accepted results**, with no regressions. This batch freshly reran all
1,122 figures; its 2,028 text results come from the complete preceding audit.
Text construction rules are unchanged in this batch.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1584 | 444 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1001 | 121 | 0 |

The combined record is `tmp/generator/contacts-current.json`; all 2,585 accepted
IDs are pinned in `scripts/generator/expected.json`. This batch adds 13 figure
combinations, following the preceding batch's 85 recoveries.

- A final three-panel layout shifts invisible dividers away from motif tips and
  into wider gaps between outline coordinates. Each shift stays within a quarter
  of a panel width. Phosphor sun now works in the fitted template and all three
  styles of diamond, hexagon and oval, using 5×5 grids.
- A counter that already meets its parent outline can use that junction as one
  connection, with an invisible A/B bridge on the other side of an external
  gate. The compiler still requires open paths and valid sheet degrees. This
  recovers Phosphor bicycle in all three oval styles, using 3×3 grids.
- Successful existing designs retain their routes. The additional figure
  recipes run only after those fail, and the counter fallback is skipped when
  the contour forest contains no counter contact. Visible outlines, counters,
  frame choices and clearance thresholds remain intact.

All **986 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Six representative renders were inspected.
Browser checks verified matching previews and selected thumbnails, plus the
bicycle's 3×3 and fitted sun's 5×5 editor handoffs without warnings. The corpus
checks artwork fidelity, open cuts, clearance and JSON/SVG roundtrips. No
physical weaving trial was performed.

The goal remains unfinished: 565 tested combinations are still refused. The
rest of the searchable icon catalog and non-default figure scales also remain
outside this matrix. Difficult cases still take too long; the concurrent audit
is not a latency benchmark. Historical counts below describe earlier audits.

## Previous coverage: more attachment choices for difficult contours

A fresh audit of all **3,150 configurations** finished with **2,572 accepted /
578 refused / zero invalid accepted results**, with no regressions. This adds
85 verified combinations without removing any previous acceptance pins.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1584 | 444 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 988 | 134 | 0 |

The combined record is `tmp/generator/balanced-current.json`. All 2,572 accepted
IDs are pinned in `scripts/generator/expected.json`. The repeat frame accepts
135/198 configurations; checkerboard repeat accepts 108/198.

- The final contour-routing fallback distributes its fixed 256-candidate budget
  across more outer attachments, considering at most four internal counter
  variants per attachment. Text retries only when the earlier pass actually
  considered more variants there. Visible artwork and minimum clearance stay
  unchanged; no solver or detached cutouts are introduced.
- Repeated text repairs only failed local cells and reuses completed cells.
  New successes include Kalam ANNA, OSCAR and mixed-line text, Bree Serif Anna,
  2026 and M&M, plus Righteous SØREN. A regression test verifies cache reuse.
- Other recovered text includes Bree Serif William and accented Danish words,
  Oswald ÆØÅ, numerous Kalam names and multiline arrangements, and Kalam B in
  the alternating checkerboard. The prior ANNA cut-tip optimization remains.
- Tabler gift now works in hexagon and oval frames in all three styles; Tabler
  palette works in all three scalloped styles. Only failed designs reach the
  bounded additional figure pass.

All **971 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Rendered inspection covered eight representative
recoveries. Browser verification covered the Kalam ANNA repeat preview and
matching thumbnail, its 8×4 editor handoff, and the Tabler gift hexagon preview
and matching selected thumbnail. These are digital geometry, fidelity and
JSON/SVG export checks, not physical weaving trials.

The goal remains unfinished: 578 tested combinations are refused, and the rest
of the searchable icon catalog and non-default scales remain outside this
matrix. Difficult cases still take too long; concurrent audit timings are not
used as latency claims. Historical totals below describe earlier audits.

## Previous coverage: compound relief cuts and divided medallions

The expanded matrix covers every bundled font in every text frame. Its current
status is **2,487 accepted / 663 refused / zero invalid accepted results**:

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1508 | 520 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 979 | 143 | 0 |

This batch freshly retested all **1,632 non-repeating text configurations** and
all **51 layered figures**, with no regressions. The other configurations retain
the preceding expanded audit's results; their construction paths are unchanged.
The combined record is `tmp/generator/compound-current.json`. All 2,487 accepted
IDs are pinned in `scripts/generator/expected.json`; none were removed.

- A difficult letter can use two invisible relief chords when one leaves a
  narrow shoulder. The bounded final pass keeps the outline, counters and open
  strip pairings. This recovers Kalam `juleman` in air, diamond, hexagon, rounded
  and scalloped frames, plus `amy` in a circle. If joining a new route fails,
  the previous recipe remains available; it is rerun only if a chord changed.
- Layered medallions can divide their circle and motif into neighbouring panels.
  Outer attachments project onto each panel's own silhouette; shared attachments
  can use the widest filled interval instead of landing in a counter. Both outer
  bands remain complete. Angel, snow, Phosphor sun and Phosphor smiley now pass,
  using 8×8 or 10×10 grids.
- The earlier checkerboard optimization remains: Nunito ANNA has ten exported
  tips narrower than 45°, down from sixteen, with none narrower than 30°. Its
  4×4 cyclic letter field is unchanged. JUL retains its original connections
  because the alternative produces worse tips.

Isolated single-run checks changed Kalam `amy`/circle from a 4.02-second refusal
to a 3.38-second accepted result, and `juleman`/air from a 2.10-second refusal to
a 1.72-second accepted result. These samples are not latency guarantees; difficult
handwriting and serif cases still take too long. Corpus timing includes concurrent
batches and is not used for performance claims.

All **955 unit tests and 177 inverse tests** pass, along with type checking, lint
and the production build. Rendered inspection covered the ten repaired layouts;
browser verification covered matching previews/thumbnails, the handwritten
`amy` 5×5 editor handoff and the unchanged ANNA checkerboard selection. These
are digital geometry and export checks, not a physical weaving trial.

The goal remains unfinished. The 663 refusals, the rest of the searchable icon
catalog and non-default figure scales still need work. The historical results
below describe earlier, smaller audits and must not be read as current totals.

## Follow-up: touching contours, fitted panels and repeated letters

A fresh pass over the earlier **2,130 configurations** finished with no
regressions and no invalid accepted results:

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: earlier font/frame matrix, including checkerboard | 1008 | 768 | 240 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 975 | 147 | 0 |

The ordinary repeat frame accepts **126/198** configurations; the checkerboard
frame accepts **107/198**. Every accepted result passed artwork fidelity,
open-cut topology, spacing and both JSON and SVG handoffs.

This batch repairs 19 figure combinations and 15 repeated-text combinations.
It also verifies 79 additional checkerboard configurations from the previously
untested font cases. The acceptance list now pins **1,743** configurations,
113 more than the preceding batch.

- A shared starting vertex no longer makes a separate contour look like a
  hole. Containment uses bounds and a point off the parent's boundary. This
  recovers the Phosphor butterfly in 16 templates without changing its outline.
- The close-fitting template can divide the motif into panels and attach outer
  grid lines directly to each panel's silhouette. The authored gift uses a
  5×5 grid; the Phosphor paw and Tabler gift use 4×4 grids. No circle or cutout
  is introduced.
- Repeated letters can use the corner-routing and invisible-chord construction
  when the original cell fails. Completed cells are reused, and boundary
  candidates are checked using the retained paths after their caps are opened.
  Recovered examples include Nunito `Anna` and `SØREN`, Bree Serif `amy`,
  Oswald `William`, and several Kalam initials and words.
- Attachment order is reused, and rounded graph keys are cached within each
  cell. Two diagnostic comparisons retained identical construction results:
  Nunito `Anna` took 3.80→2.99 seconds, while the refused Cinzel `SØREN` took
  34.27→29.03 seconds. These individual measurements are not a latency guarantee;
  difficult handwriting and serif cases still take too long.

All **939 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Rendered inspection covered eight recovered
examples. Browser checks covered the repaired mixed-case repeat preview and
the gift's matching thumbnail, main preview and 5×5 editor handoff. No physical
weaving trial was performed.

The goal remains unfinished: **387 tested configurations are still refused**.
The harness previously tested five fonts in only four frames. It now covers
every font in every frame, adding **1,020 configurations not yet audited**.
The expanded target is 2,028 text configurations plus 1,122 figures. Earlier
matrix results must not be presented as proof of that expanded coverage.

## Follow-up: imported contours and alternative cut routes

The figure sweep now accepts **956 of 1,122 combinations**, with **166 refused,
zero invalid accepted results and no regressions** against the preceding
acceptance list. This combines a full sweep with a retest of its refusals after
repairing the three oval paw frames. It verifies 71 additional figure cases,
including rabbit, sun, coffee and butterfly frames.

Imported contours are split at exactly repeated vertices, and collapsed loops
are removed without moving their edges or changing their even-odd fill. A
locally valid route can still fail when joined to neighbouring cells; in that
case the figure generator retains the original attachment route as a bounded
fallback. Local construction failures do not trigger this redundant retry.

The cleaner-cut ranking introduced for checkerboard letters is also available
as a final framed-text construction. A focused retest of 194 previous text
refusals accepted 30 and refused 164, with no invalid accepted output. Of these,
26 were not already pinned, including Kalam `juleman`, Bree Serif `ÆØÅ` and
Nunito `æøå` in several frames. This was a refusal retest, not a new full text
sweep. A separate 2×2 checkerboard fallback spaces shared attachments farther
apart and recovers Nunito `Å` with its ring intact.

These runs add **98 verified configurations**, bringing the acceptance list to
**1,630**. Every accepted case passed artwork fidelity, clearance and JSON/SVG
handoff checks. Rendered inspection covered eight recovered text and figure
examples. These are digital checks; there has been no physical weaving trial.
Full text and checkerboard coverage remains unfinished, as do the 166 figure
refusals.

All **926 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Browser verification covered the recovered
rabbit preview and thumbnail, the accented checkerboard's 2×2 editor handoff,
and ANNA's unchanged alternating letter field.

## Focused follow-up: checkerboard text and practical cuts

The new `repeat-check` frame ("Gentag med tern") builds alternating backgrounds
from the actual cutting geometry. ANNA keeps its cyclic 4×4 letter field;
odd-length words repeat twice along each axis to make an even colour period.
The ordinary repeat frame remains a separate choice.

Counter connections can land at natural corners, and invisible chords can split
long pointed tongues between the two sheets. The bounded route comparison
penalizes hairpins and short sharp steps while preserving every visible outline.
If none of these alternatives fits, that letter keeps the original contour
construction. On Nunito ANNA, exported cut tips narrower than 45° fell from 34
to 16; all eight tips narrower than 30° were eliminated. This is a geometric
improvement, not a physical paper-strength measurement.

The final checkerboard sweep tested 33 Nunito texts plus ANNA in the other five
fonts: **27 accepted, 11 refused, zero invalid accepted results**. All 25
configurations that worked before cut optimization still work; Oswald ANNA and
Cinzel ANNA are newly accepted. Every accepted result passed both JSON and SVG
handoffs, raster comparison and editor spacing checks. These 27 cases join the
acceptance list, which now pins 1,532 configurations across the generators.

The focused follow-up also recovered 12 text configurations and two default
figure configurations (`ph-paw-print` and `tb-butterfly`) from the preceding
audit's refusals. These are pinned in `scripts/generator/expected.json` and
covered by export regression tests. Larger letter panels and visible
connections to disconnected components retain the selected font and motif.

All 900 unit tests and 177 inverse tests pass, as do type checking, lint and the
production build. Browser verification covered ANNA's new frame thumbnail,
matching main preview and 4×4 editor handoff with the improved cuts. The updated
intersection warning scan retains the exhaustive algorithm's results and order
while excluding distant segment pairs before testing them.

The full audit below predates this follow-up. Its aggregate counts have not been
replaced with estimates from the focused runs; full coverage remains unfinished.

## Preceding full audit

Offline audit completed 15 October 2026. Baseline: `7e5d5d7`. The generators are safer and cover more inputs after this change, but **they do not yet support every tested combination**. Refusals are listed separately from successful generations.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts | 810 | 608 | 202 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 883 | 239 | 0 |

All accepted results passed contour fidelity and cut validation, then JSON and SVG save/reload checks. There were **no regressions among previously accepted configurations**. These are digital checks; no physical weaving trial was performed.

## Comparison on the original 1,884 configurations

The extra `amy` and uneven multiline `A\nnnn` cases were added later and are excluded from this before/after comparison.

| Mode | Before | After | Newly accepted |
|---|---:|---:|---:|
| Text | 526/762 | 565/762 | 39 |
| Figure | 880/1122 | 883/1122 | 3 |

## What changed

- Sharp concave letter shoulders can use an invisible chord through the filled stroke. It preserves the complete outline, uses no cutouts, and must retain the four open path pairings. Boundary-cap routes are checked separately so a bridge cannot remove part of a letter.
- Difficult text gets an additional layout with more spacing and separate lanes along flat frame sides. The font and selected frame stay the same.
- Figure fallback constructions can distribute details over larger panel grids. The gift now works in all three oval templates, using a 6×6 grid.
- Exterior spokes are checked once per attachment, before trying counter bridges. Extra chord attempts are bounded; the air layout no longer repeats an identical failed construction.
- The seasonal catalog no longer labels an archery bow as a ribbon bow; it shows a gift in its place.
- The corpus distinguishes construction refusals, unexpected runtime errors, invalid accepted output, and regressions. It pins accepted configurations so future failures cannot disappear inside an aggregate pass count.

## Text coverage by font

Nunito uses all nine frames. The other fonts use woven, air and repeat. The ten-letter repeat limit excludes one input per font.

| Font | Accepted | Refused |
|---|---:|---:|
| nunito | 285/305 | 20 |
| breeserif | 83/101 | 18 |
| oswald | 84/101 | 17 |
| kalam | 26/101 | 75 |
| cinzel | 40/101 | 61 |
| righteous | 90/101 | 11 |

## Figure coverage

| Motif | Accepted templates |
|---|---:|
| star | 22/22 |
| tree | 22/22 |
| heart | 22/22 |
| angel | 21/22 |
| bell | 22/22 |
| gift | 19/22 |
| tb-candle | 22/22 |
| tb-christmas-tree | 22/22 |
| tb-bow | 21/22 |
| tb-star | 22/22 |
| tb-stars | 19/22 |
| tb-bell | 22/22 |
| tb-cookie | 20/22 |
| ph-snowflake | 22/22 |
| ph-tree-evergreen | 22/22 |
| ph-star-four | 22/22 |
| ph-music-notes | 22/22 |
| ph-moon-stars | 11/22 |
| circle | 22/22 |
| flower | 22/22 |
| snow | 0/22 |
| moon | 22/22 |
| house | 22/22 |
| diamond | 22/22 |
| ph-cat | 20/22 |
| ph-dog | 22/22 |
| ph-bird | 22/22 |
| ph-butterfly | 0/22 |
| ph-horse | 22/22 |
| ph-rabbit | 0/22 |
| ph-fish | 22/22 |
| ph-paw-print | 4/22 |
| ph-coffee | 1/22 |
| ph-bicycle | 0/22 |
| ph-sailboat | 17/22 |
| ph-flower-tulip | 22/22 |
| ph-crown | 20/22 |
| ph-sun | 0/22 |
| ph-leaf | 22/22 |
| ph-eyeglasses | 22/22 |
| ph-smiley | 20/22 |
| ph-anchor | 22/22 |
| ph-infinity | 22/22 |
| ph-puzzle-piece | 22/22 |
| tb-gift | 12/22 |
| tb-heart | 22/22 |
| tb-paw | 0/22 |
| tb-flower | 22/22 |
| tb-butterfly | 1/22 |
| tb-apple | 22/22 |
| tb-palette | 17/22 |

## Remaining limitations

- Repeated text still refuses some dotted/accented letters and mixed-case words, including Nunito `jul`, `Sofie`, `ÆØÅ` and `Anna`. The extra boundary components and their connections need a more general construction.
- Fine handwriting and serif strokes still fail spacing checks in many combinations. Some failed cases remain slow; measured times are diagnostics, not a latency guarantee.
- Some complex or thin figures remain unavailable, including the authored `snow`, `ph-butterfly`, `ph-rabbit`, `ph-bicycle`, `ph-sun` and `tb-paw` motifs. Other figures work in only some frames.
- Invalid constructions remain unavailable for export. Tests do not waive clearance, remove counters, replace fonts or redraw the source motif to raise the success rate.

## Reproduce

See [the harness instructions](README.md). Run `npm run test:generator:robustness` for the full matrix. Per-case results go to `tmp/generator/report.json`, with timings, failure reasons and strip counts. The ordinary test suite includes 35 focused generation/export regressions.

Browser verification covered the repaired Nunito `anna` repeat preview and its 8×4-strip editor handoff. The gift’s oval pattern and all 42 motifs accepted in the default circle-rays frame were inspected as rendered SVG contact sheets. This checks recognizability, not physical weaveability.
