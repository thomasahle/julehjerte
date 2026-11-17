# How the generator makes a heart

`generate(request)` in `src/lib/generator/generate.ts` turns a text or a motif's
outline into a `HeartDesign` the editor can open. It draws the cuts directly on
the outline: no image is fitted and nothing is searched for over pixels. This
page says which code does what, in the order a request meets it, and how to
tell that a change left the hearts alone.

The page (`GeneratorPage.svelte`) shows a picture of the heart at once
(`picture.ts`, no cuts) and asks a worker (`worker.ts`) for the cuts. The
robustness harness is described in [README.md](README.md), the stored recipes
in [RECIPES.md](RECIPES.md).

## What a heart is made of

- A **request** (`GeneratorRequest`) names the mode (`text` or `figure`), the
  frame (`style`, or `textFrame` for a text), the outline (`contours`, or
  `text` and `font`), the size (`scale`), and what the frame offers besides:
  strips (`board`), space (`gap`, `room`), crown, place.
- A **construction** is the heart as straight cuts: `edges` on the motif's
  rings and the frame's lines, each of one sheet (a visible outline) or of
  both (a hidden cut, which cancels in the weave), compiled into the two
  sheets' open paths (`compile` in `geometry.ts`).
- `finishConstruction` turns a construction into a **result**
  (`GeneratorResult`: the design and what the page needs beside it). It audits
  the edges, refuses a severe pinch before any curve is fitted, converts the
  cuts to the editor's cubics (`convertValidatedCutGeometry`), judges the
  paper by `searchClearance.ts`, and checks the woven picture against the
  artwork (`fidelity`).
- A way of making a heart that cannot says so by throwing a **refusal**
  (`refusal.ts`: `ConstructionError` from a builder, `CutGeometryError` from
  the cut check). Everything above answers a refusal by trying the next way;
  any other error is a bug and is passed on (`refusal(error)` rethrows it).
- A heart whose weave is right but whose paper is narrower than the clearance
  is **hard to cut** (`hardToCut`, see `hardToCutResult`): shown with a
  warning, and never preferred to a clean one.

## The stages, outermost first

Each stage is one function in `generate.ts` and answers one question. A stage
that cannot make the heart refuses, and the stage above tries what it has left.

| Stage | What it decides |
| --- | --- |
| `generate` | A picture solved before keeps its stored cuts (`fromStoredRecipe`, `fromSolve`); otherwise the heart is built, and a topology's stored cuts are drawn on it where they are better (`fromTopology`). Hearts made inside another (`making`) skip this. |
| `withMirrorMean` | Små motiver of a motif a hair off its own mirror image: made as drawn and as the mean, the better kept. |
| `generateTried` | The motif without its hairline spurs. |
| `generateMade` | A heart refused every way is made again, once: up the channels between its pieces (`withChannelWays`), or with rings that touch joined by a neck of paper (`closedAtContacts`). |
| `generateTrimmed` | The second tries (`SECOND_TRIES`: exact outline indices, nearest island ports), each only where the first making met the case it mends. |
| `generateAsAsked` | A text whose frame is a figure frame (`textFigure.ts`); a board that cannot weave the motif on the strips asked for shows it on the nearest that can. |
| `generateAtSizeOrSmaller` | The size asked for, else the largest below it that can be made. |
| `generateAtSizeOrLastResort` | The last resorts (`LAST_RESORTS`), each only where the making set a construction aside for it. |
| `generateAtSize` | The frame's alternatives (`frameAlternatives`: cells square or fitted, the boards to try). A clean alternative is preferred to an earlier hard one, which is why the hard-to-cut fallback is deferred (`deferHard`). Figur i ternene leaves here for `generateStrips`. |
| `generateOnce`, `generateOnceMade` | One alternative: the frame's recipes; then the retries on the constructions they left unfinished (cuts rerouted or curved, panels, lanes, supports); then the hard-to-cut heart from the best of those. |
| `generateUsingRecipes` | The frame's own recipes, below. |

### The frames' recipes

`generateUsingRecipes` hands the request to one function per kind of frame.
Each tries its layouts in order and returns the first that finishes, or the
best of the first few (`bestOfFirst`).

| Function | Frames | Builders |
| --- | --- | --- |
| `textRecipes` | every text frame; Små motiver and the retired equal squares, where the motif is the one letter of a text (`boardMotif.ts`) | `textGrid.ts`, `checkeredGrid.ts`, `mixedCheckeredGrid.ts`, `panels.ts`, `branchedText.ts` |
| `layerRecipes` | Cirkel med dobbelt bort | `layers.ts` |
| `boardRecipes` | Cirkel · Lige store tern | `textGrid.ts` on the board's lines (`geometry.ts`: `boardLines`, `boardRanges`), completed past the touching circle by `boardCompletion.ts` and `boardPatterns.ts` |
| `cornerRecipes` | Tern i spidserne | `cornerChecks.ts` |
| `openRecipes` | Tæt om figuren, Kiler, the retired silhouette | `fitted.ts` |
| `cellRecipes` | Stråler, Strålekrans, the retired check | `geometry.ts` (`generateFigure`, `generateFourPortFigure`), `panels.ts`, `components.ts`, `sunburst.ts` |

Figur i ternene is built by `stripFigure.ts`.

The builders share `geometry.ts`: the motif's rings as a forest, the four
gates a motif is entered by, and `fourPortMotif`, which routes the hidden cuts
from the gates to every piece and island. How those cuts get round what is in
their way is a shortest-path search in `reach.ts`, which knows nothing of
hearts.

### The retries

Where a frame's recipes all refuse, `generateOnceMade` tries the retries in one
fixed order. Each returns at once for a frame that is not its own, so a frame
meets only its own, in the order of this table:

| Retry | Frames it serves |
| --- | --- |
| cuts rerouted (`rerouteSharedCuts`), then curved (`curveSharedCuts`), on the constructions the recipes left unfinished; between the two, Strålekrans' medallion routed again at its border's clearance | every figure frame; curved also for text |
| `retryPanelLayouts` | text in cells or the circle; Cirkel med dobbelt bort; the open frames; Stråler, Strålekrans |
| `retryFittedSupports` | the open frames (Tæt om figuren, Kiler, the retired silhouette) |
| the seam tilted, later split through the counters (inline) | Cirkel med dobbelt bort |
| `retryComponentLanes`, `retryFigureIslandPorts`, `retryWideComponentContacts` | Stråler, Strålekrans and the open frames (their lanes after the frame's own retries) |
| `retrySunburstPanels`, `retrySunburstComponents` | Strålekrans |
| `retryFittedComponentEnvelope`, `retryFittedGateClearance` | the open frames |
| `retryChainContacts`, `retryCornerLanes`, `retryBentCornerLegs` | Tern i spidserne |
| `retryTextPanelIslands`, then `retryBranchedText` (one word in the circle), `retryPanelReserve`, `retryGuardedPanels` | text in cells or the circle |
| `hardToCutResult` | every frame: the best unfinished construction, with the warning |

A text that finishes is looked at once more by `improveTextPanelTips`.

### What the frames share

Every frame but Figur i ternene and Tern i spidserne is a grid of **cells**.
A cell holds an outline (a letter, a motif, or the part of one that a panel
clips out) and has four gates, one on each side; `fourPortMotif` cuts the
outline between the gates. Cells that are neighbours share a gate, and
`connectCellGrid` gives each outer gate its way to the paper's edge:

- with no ring, two legs straight to the two edges at its corner (`openLeg`:
  the woven text frames, the open figure frames);
- on a ring, a gate on the ring (`framedGate`) with an arc and two legs
  (the circle frames: `gateAngle` says where on the ring);
- on a regular board, the board's own lines (`boardLegs`, `completionLegs`).

A text is such a grid with a letter in each cell (`textGrid.ts`); a figure is
one cell (`generateFourPortFigure`), its panels (`panels.ts`) or its pieces
(`components.ts`). The two meet in both directions: a figure on a board is
the one letter of a text (`boardMotif.ts`), and a text in Figur i ternene or
Cirkel med dobbelt bort is a figure whose outline is the letters'
(`textFigure.ts`).

Builders take their choices as a named options object (`CornerOptions`,
`ComponentOptions`, `FittedOptions`, `PanelOptions`, …), not as positional flags; a new
choice is a new field with the old behaviour as its default.

## Choices that are not passed down

A few choices change how code far below routes a cut, and are read there
without being handed through every builder: they are ambient switches
(`ambient.ts`). A switch is off, but for what is built inside its `during`:

```ts
const everyWay = ambientSwitch('everyWay');
const withEveryWay = everyWay.during;
…
withEveryWay(() => generateOnce(request));   // everyWay.on is true in there
```

It is as it was afterwards, also where the build throws, and nesting works.
There are twelve, in the file whose code reads them: `everyWay`,
`passingLanes`, `channelWays` and `spaceKept` in `generate.ts`; `counterWays`,
`exactArcs`, `nearestIslands`, `visibleIslands`, `remaking` and `channels` in
`geometry.ts`; `narrowCrown` in `frameFit.ts`; `crowdedHiddenCuts` in
`stripFigure.ts`.

A switch is an object and so always truthy: read `.on`, never the switch.

A heart is made the first way with every switch off. Only where that refuses
does a stage above turn one on, so a heart that could be made before a switch
existed is made the same after.

## How a heart was made

A result made some other way than its frame's first says so in `via`:

- `via.switches`: the named switches on as its cuts were finished.
- `via.tier`: what the tier of its frame's recipes that built it turns on
  (`walled`, `based`, `channeled`, `around`, `everyWay`, …), where the heart is
  made straight from that tier's cuts, or is the hard-to-cut heart made of a
  construction that tier left unfinished. A later retry that draws its own
  cuts names no tier.

The page reads none of it. It is there for whoever asks why a heart looks as
it does: `scripts/generator/identity.mjs` writes it into each row.

## Changing the generator without changing its hearts

The rule is that no heart gets worse, and a refactoring must leave every heart
exactly as it was. The tests cannot show that: they pin a few hundred
properties, not the cuts. `scripts/generator/identity.mjs` does. It makes 711
quick figures over the twelve figure frames and 244 texts over the six text
frames (13 texts in three fonts, and ten in Cinzel in the circle frame, whose
overlapping serifs are cut as branches), as the page makes them, and writes a
hash of each heart's cuts and picture.

```sh
# the baseline, from a worktree of the commit before the change
cd ../before && node ../after/scripts/generator/identity.mjs run tmp/generator/identity
# the change
cd ../after && node scripts/generator/identity.mjs run tmp/generator/identity
node scripts/generator/identity.mjs compare tmp/generator/identity ../before/tmp/generator/identity
```

`compare` prints each frame's count and every heart that differs, and exits 1
where one does. `FIRST=4 SIZES=70` with the figure frames' names makes a first
check of 48 figures in under a minute, `FIRST=1` with the text frames' names
(`text-squares`, `text-letters`, `text-checkered`, `text-circle`, `text-strips`,
`text-layers`) one of 78 texts; the whole set takes several minutes.

The quick figures seldom need a last resort. A change to the retries, the
second tries or the last resorts should also be run on hearts that do; the
slow tests in `frames.test.ts` name them (the trolley in Strålekrans, the
lasso in Cirkel med dobbelt bort, the microphone in Tæt om figuren), and
`npm run test:slow` runs those.

A change that is meant to alter hearts is judged by the same comparison, read
the other way: every heart that differs is looked at, and none may be worse.
