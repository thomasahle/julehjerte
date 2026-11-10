# Search constants: the measurements behind them

The Mal solver's code comments (`static/inverse/core/exact/*.js`, `core/engine.js`,
`worker-controller.js`) say what the code does and, in a line or two, why a constant has its value.
The measurements behind those choices (benchmark tallies, before/after timings, dates and the
names of runs) are kept here, one section per constant or function, each linked from its comment as
`(history: docs/inverse/SEARCH-CONSTANTS.md#anchor)`. The text is as the comments recorded it when
the measurement was made; a later run on other code may give other numbers. The search's times and
the ladder's rungs are declared together in `core/exact/schedule.js`; the sections below are grouped
by the code that uses them.

The picture sets named: the 128 (or 130) juleflet pictures and the 211 gallery, library and web
masks; the 170 generator-preset hearts (161 distinct); the 127 test pictures; the 106 broad pictures.

## worker-controller.js

<a id="exact-waits"></a>
### EXACT_GRACE_SECONDS, EXACT_WAIT_SECONDS, EXACT_UNDRAWN_SECONDS

On the juleflet pictures every exact template came within 40 s, while photographs the exact search
fails on waited out the whole minute. With the exact search's start at most 3 s, as many exact
templates came first by 20 s as by 30 on the juleflet pictures (91) and the scraped photographs (14),
which then took 22 s at the median instead of 30.

<a id="ladder-workers"></a>
### LADDER_WORKERS

On the 170 generator hearts one ladder passed 103, two 110 (the first template at 3.3 s for 4.8 at
the median), three 115; on the 127 test pictures 96, 96 and 98 (the mean 6.4 s with two, 5.6 with
three).

<a id="ladder-fine"></a>
### LADDER_FINE, LADDER_MARGIN, LADDER_GRACE, LADDER_GRACE_SHARE

On the 170 generator hearts and the 127 test pictures 6 templates came 0.5-0.9 points closer
(star-board-b7: 1.17% off to 0.33%), for 0.35 s more at the mean.

<a id="settles"></a>
### settles (a ladder template today's search cannot better)

Within the traced outline's bound were 16 of the 35 templates the 106 broad pictures held, none of them
beaten by today's search.

## core/engine.js

<a id="traced-seconds"></a>
### TRACED_SECONDS, ROUNDED_SECONDS (the stages of a picture's minute)

On the 128 juleflet pictures 79 of the 82 traced outlines passing did so within 20 s, and 49 of the 54
rounded ones.

<a id="return-repair"></a>
### returnRepaired, RETURN_REPAIR_SECONDS, RETURN_REPAIR_TRIES

The repair (repairFinal: the returns moved apart) took 0.4 to 3.3 s on the near misses. Templates it
rescued: hanefod-shot, khatam, triple-heart, 0.1 to 0.4% from their masks, where the fitter's was the
only one. The rounded outline's templates hide less: stjernerogkors, 0 against the traced one's 8.

<a id="mask-specks"></a>
### maskSpecks (120 of 400² pixels, n²/1333)

The 211 gallery, library and web masks have no interior region of 121 to 160 pixels but jul-2026's
four digit counters (144), which a higher limit would take; blobs of radius 7 (153) are left. At the
square's edge the same: none of them nor of the generator's 170 hearts has a region there under 144
pixels (the layers frame's 3 mm squares), and a speck painted there bites into the edge (puslespil with
two: no exact template; without them one in 4 s).

<a id="rough"></a>
### firstTrace, ROUGH_ONE, ROUGH_TWO

A hand-painted mask's model grows with every wobble of its edge: h4h2 at 40% jitter took 43 s with none
found, 3 s opened. The first trace's reason stands, opened or not: while only an unopened trace's reason
counted, the photographs' uneven crops were never read paired (danish-tree-dots,
gathering-hanging-trio-middle).

<a id="ladder-outlines"></a>
### exactTemplate: the ladder alone over several outlines

5star's 12 hidden cuts are on the rounded outline (today's search: 37 s; the ladder, once there: 3 s),
and of its 54 templates on the 106 broad pictures the ladder on the traced outline found 48 within 12 s.

<a id="loose"></a>
### LOOSE_LEAST, LOOSE_MM, STRICT_SECONDS

jul-tern: 18 hidden cuts, its count's bound, with the clearances lowered, where the model's limits held
every drawing at 16 and rules broken. Lowered from the start, the clearances lose vissevasse-arranged-r3c2
and others, whose returns then fail once smoothed.

<a id="ladder-part"></a>
### ladderPart: one of n ladders side by side

On the 170 generator hearts two ladders, every other outline each, passed 110 where one passed 102, the
first template at 3.3 s for 4.8 at the median.

<a id="traced-first-weight"></a>
### TRACED_FIRST_WEIGHT

One ladder on the 170 generator hearts: 103 against 102, none lost, the first template at 3.5 s for 5.0
at the median; the 127 test pictures 96 against 95, none lost, 4.3 s for 5.0.

## core/exact/stage.js

<a id="network-ladder"></a>
### networkLadder, LADDER, LADDER_SHARE

On 21 gallery designs held out of the network's training (2026-10-31) the ladder found the template of
today's search, or one as good, on most in a tenth to a third of its time (5star 37.6 s to 3.6,
roed-blomst 43.6 to 1.4).

<a id="ladder-samples"></a>
### LADDER_SAMPLES, LADDER_ALONE

On the hard pictures (2026-11-01) samples found khatam at K100 in 18 s where the plain ranking needed the
second outline and 36 s, and venus at K100 where it needed K300. The plain ranking has the held-out
benchmark's times alone (LADDER_ALONE): 5star's rungs to K300 found 12 hidden cuts in LADDER's, but
breaking rules still when their time ran out; in 10 s K300 had its template in 3.2 s.

<a id="first-order"></a>
### LADDER_FIRST, LADDER_SECOND, FIRST_ORDER

2026-11-05. A 4 x 4 heart of small stars (Små motiver) needs K300 on the rounded outline for 4-6 s,
which K300's 4 s after every sample there left to the second phase, at 40-43 s (11-18 s with
FIRST_ORDER), god-jul's 35-46 s -> 11-34 s. The ladder alone on 169 pictures (127 test, 40 generated,
two users' hearts; `nudge/plain2.sh`, the 14 that changed run twice more): passing 115 -> 114, median
10.7 -> 9.4 s where passing; lost brand-discord-corners and battery-4-layers (generated, 2 of 3 runs ->
none), which the page's sweep passed by today's search (28 s, 31 s; battery's failed it once alone since,
on a loaded machine). The plain rankings first all through (K10 to K300, then the samples) lost
play-card-j-silhouette, found by K30's first sample on the wider outline (3 of 3 -> 0 of 3).

<a id="start-seconds"></a>
### START_SECONDS and the coarser grid without the template's start

On the 128 juleflet pictures the coarser model (hidden segments between positions 3 units apart to
their 2 nearest) found the same templates as 1.5 and 4 in two thirds of the time; HiGHS's root, which
overruns its time limit, grows faster than the model (dagognat-shot: 65k rows 57 s, 34k 3 s).
On 160 traced outlines the grid's start took 0.07 s at the median, 4 s at most, and 19 of 24 topological
ones under 1 s, while 28 found none in 30 s; on those and the one taking 5.5 s, the search found as many
templates (9) with 3 s for the start as with 9, in half the time (10.8 s for 21 at the median).

<a id="turns-floor"></a>
### TURNS_FLOOR kept from the ladder alone

JUL in kalam on a woven square has its template untied in 0.6 s, where the tied rungs took 20 s of its
outline's 24 (two ladders: 3 of 3 runs at 21 s, against none; the 170 generator hearts 114 against 110,
the 127 test pictures 95 against 96, their one lost passing at 52 s in 2 of 3 runs against 3; three
ladders: 115 and 98 as before).

<a id="bare"></a>
### BARE_SHARE, BARE_FLOOR, COARSE_AFTER_BARE

Uret's juleflet picture: 74k rows from a start, crossing cuts after 30 s; the fine grid from none: 45k,
a template in 6 s. On the 130 juleflet pictures, 87 templates the export takes instead of 84.

<a id="even"></a>
### exactSearch: an outline made symmetric (`even`)

amy-flowering: 12 hidden segments made symmetric, where untied 32. Not before the search under the
ties: on the 109 pictures with ties, outlines the ties already hold made symmetric gave as many
templates but other ones (hermanngitter-shot's failing the paper, hvirvel's of 12 hidden segments, not 8).

<a id="subgroups"></a>
### fallbackTies, subgroupsOf, turnsOf

Under all eight of roed-blomst's symmetries there is none in 20 s; under its diagonal, 7 hidden
segments (on its outline with tips rounded, the time left on the traced one too little for both);
fejlternet's pinwheel has 12, the designer's count. A letter or a number in a hexagon has a template
only untied, 0.1-0.5% off. Of 36 generated hearts with two or more symmetries, today's search alone
passed 11, now 21, none lost (the 43 test pictures with as many: 41 and 41). Under a single tie, untied
straight after: heart on 3 strips untied at 0 hidden cuts in 3 s; of 161 generated hearts 92 passed,
now 96, none lost.

<a id="smooth-slack"></a>
### SMOOTH_SLACK and the redrawn template

Drawn on the mask's edge the same solution's hidden cut as the weave shows it grows where cuts run
closer beside a junction (amy-pinecone 9 steps to 11, 0.86% from its mask to 0.52%). On a photograph's
jagged staircase a smooth edge misses a few boundary pixels more (amy-pattern-shot 0.58% from its mask,
its pixel steps 0.16%).

## core/exact/model.js

<a id="slow-presolve"></a>
### SLOW_PRESOLVE_RULES

On some models presolve spent 41 s in these rules, beyond its own time limit, which it checks only
between passes (amy-weave-1: 44 s, now 2 s); on the others they took seconds and changed no template.

## core/exact/raster.js

<a id="near-touch"></a>
### NEAR_TOUCH_MM

Closing a design's own gaps costs a mask error of at most 0.12% at 0.9 mm and 0.13% at 1.2 (lilje1
0.40 to 0.52%). On the 128 library masks the hidden segments in all fell from 820 (0.6 mm) to 607
(0.9), 548 (1.2), 543 (1.8, two pictures lost); 0.36 lost two and cost 190 more.

## core/exact/refine.js

<a id="edges-on-mask"></a>
### edgesOnMask's `open`

Of 74 templates from opened outlines on the generator hearts and test pictures, 40 came closer to their
masks, 9 a hair further (the same templates otherwise).

<a id="smooth-edges"></a>
### smoothEdges

Uret's inner ring as the points' polyline: 338 cubics a cut; smoothed, one a run, 11.5 a cut, 0.23% off
its mask against the polyline's 0.0%.
