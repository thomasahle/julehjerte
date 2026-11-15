---
name: juleflet-heart
description: Design a new woven Christmas heart (julehjerte) pattern for juleflet.dk, check that it can be cut and woven, improve it, and put it in the user's "Mine hjerter" (My hearts). Use when someone asks for help making, changing or checking a woven paper heart pattern.
---

# Making a woven heart on juleflet.dk — a guide for AI agents

juleflet.dk is a free site with templates for Danish woven paper hearts (julehjerter). This page tells an
AI agent how to make a new pattern for someone, check it, improve it, and get it into their own
collection, "Mine hjerter" (English: "My hearts"). Save it as a skill file, or just read it.

Everything here was tried on the live site. The site is in Danish at `/` and in English under `/en/`;
button names below are the English ones with the Danish in brackets.

## 1. What a woven heart is

Two pieces of paper in two colours, each folded once and cut into strips from the fold. The strips of one
are woven through the strips of the other, and where they overlap they make a **square** standing on its
corner. The two rounded ends stick out above it and make the heart.

A pattern is nothing more than **the cuts in that square**:

- The square is 100 × 100 units. `(0,0)` is the **top** corner of the heart, `(100,100)` the bottom point,
  `(100,0)` the right corner and `(0,100)` the left corner. So x runs down the upper right edge and y down
  the upper left edge. On the screen a point `(x, y)` lies `x − y` to the right of the middle and `x + y`
  down from the top (times 1/√2): "up" in the picture is the direction `(−1, −1)`. Turn a motif 45° before
  you place it, or it will lie on its side.
- The left half's rounded end sits on the edge `x = 0` (upper left), the right half's on `y = 0` (upper
  right).
- The **left half** (white by default) has cuts that run across in the x direction, from the edge `x = 0`
  to the edge `x = 100`. Straight ones are horizontal lines `y = const`.
- The **right half** (red by default) has cuts that run in the y direction, from `y = 0` to `y = 100`.
  Straight ones are vertical lines `x = const`.
- `n` cuts in a half give `n + 1` strips. Two cuts in each half is a 3 × 3 heart. The site handles 2 to 20
  strips each way; 3 to 6 is what people actually weave, and the two halves may have different counts.

**The picture the cuts make.** Each cut is the border between two strips, and the strips alternate over
and under. So the colour you see swaps every time you cross a cut, of either half. For a point in the
square, count the left-half cuts that separate it from the edge `y = 0`, and the right-half cuts that
separate it from the edge `x = 0`. If the sum is even the point shows the left half's colour, if odd the
right half's. (That is for weave parity 0, the default; parity 1 swaps the two.) For a cut that wanders,
"separates" means which side of the cut the point is on: draw a straight line from the point to that
edge and count how many times it crosses the cut; an odd number counts as one, an even number as none.
Straight evenly spaced cuts give a chequerboard. Bending the cuts moves the borders, and that is the whole craft: the picture is exactly the
"exclusive or" of the two families of strips.

Three consequences do most of the design work:

- **At a crossing the colours alternate.** Where a left cut crosses a right cut, the four corners around
  the crossing are coloured like a chequerboard. A shape with a sharp tip at a crossing therefore touches
  a region of its own colour, tip to tip, on the far side.
- **Hidden cuts.** Where a left cut and a right cut lie exactly on top of each other, the colour swaps
  twice, so nothing shows: both sides have the same colour. This is allowed, the editor accepts it, and it
  is how a stand-alone figure is made. To draw a white moon on a red field, let the middle cut of each
  half leave its straight line, run *together* to the figure, part so that one follows the figure's one
  side and the other its other side, meet again, and run together back to their lines. The figure is the
  only place where exactly one of them is crossed. Write the shared stretches with identical numbers in
  both halves, or a hairline of the other colour shows. Hidden cuts still have to be cut, precisely.
- **What cannot be made:** a region's border is always pieces of cuts, every cut runs all the way across,
  and cuts of the same half never meet. A free-floating island needs hidden cuts to reach it.

## 2. The rules a pattern must keep

The site's editor checks rules 1 to 3 and shows offending cuts in red. Rules 4 and 5 are about paper and
nobody checks them for you: look at the template yourself.

1. **Every cut runs from edge to edge**: a left-half cut from `x = 0` to `x = 100`, a right-half cut from
   `y = 0` to `y = 100`, staying inside the square all the way.
2. **Cuts of the same half never cross or touch**, each other or themselves. They would cut a strip off.
   Cuts of *different* halves cross freely; that is the weave.
3. **Cuts of the same half stay at least 1.5 units apart** everywhere, and a cut stays that far from
   itself where it doubles back. Closer leaves a sliver of paper that tears.
4. **A cut may wander but must be cuttable with scissors**: it can bulge, wave, even go backwards for a
   while (that is how circles, hearts and letters are made), but tight hooks and hairpins tear.
5. **Paper, not just geometry.** Hearts are usually printed with the square 80 mm wide. A neck of paper
   narrower than about 2 mm (2.5 units) will tear when woven, even if rule 3 holds. Strips narrower than
   about 8 mm are hard to weave.

What makes a pattern *good*, from the hearts people have kept:

- **Simple and bold.** Judge the woven picture at thumbnail size. If it does not read there, it does not
  read on a Christmas tree.
- **Few, plain curves.** A cut should be a handful of smooth pieces a hand would draw, not many small
  fitted ones. Circular arcs and gentle S-curves cut well.
- **One template if you can.** If the right half's cuts are the left half's mirrored across the diagonal
  from top to bottom (swap x and y), both halves are cut from the same template. Use identical numbers in
  both halves, or thin gaps show where the cuts should coincide.
- **Even strips** where the design allows, so the weaving is not fiddly.
- An original pattern. Do not copy a designer's heart and call it new; if you start from one, say whose.

## 3. The file format

A heart is an SVG with a `0 0 100 100` viewBox and one `<path>` per cut. This is a complete, valid 3 × 3
heart with waved cuts:

```svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <title>Small waves</title>
  <path d="M 0 33.3 C 15 23 35 23 50 33.3 C 65 43.6 85 43.6 100 33.3" stroke="orange" fill="none"/>
  <path d="M 0 66.7 C 15 56.4 35 56.4 50 66.7 C 65 77 85 77 100 66.7" stroke="orange" fill="none"/>
  <path d="M 33.3 0 C 23 15 23 35 33.3 50 C 43.6 65 43.6 85 33.3 100" stroke="green" fill="none"/>
  <path d="M 66.7 0 C 56.4 15 56.4 35 66.7 50 C 77 65 77 85 66.7 100" stroke="green" fill="none"/>
</svg>
```

- `<title>` is the heart's name.
- The importer decides the half by direction: a path that runs across in x is a left-half cut, one that
  runs in y a right-half cut. The site writes left cuts in orange and right cuts in green; the colours
  are only for the reader. An asymmetric figure (a crescent, a letter) needs a template for each half.
- Any path commands work (lines, cubics, quadratics, arcs, relative ones), as do `<line>` and
  `<polyline>` and transforms. A cut drawn in several pieces whose ends meet is joined. The direction a
  cut is drawn in does not matter.
- Do not draw the outline of the square or the heart; only the cuts.
- `data-weave-parity="1"` on the `<svg>` swaps which colour the top cell shows.
- The gallery's own hearts are good examples: `https://juleflet.dk/hearts/<id>.svg`, where `<id>` is the
  last part of a heart page's address, for instance
  [hjertepude.svg](https://juleflet.dk/hearts/hjertepude.svg) or
  [kompasrose.svg](https://juleflet.dk/hearts/kompasrose.svg).

The same heart as JSON, which is what links and the browser's storage hold:

```json
{ "v": 1, "name": "Small waves", "gridSize": { "x": 3, "y": 3 },
  "fingers": [
    { "id": "L-1", "lobe": "left",  "pathData": "M 100 33.3 C 85 43.6 65 43.6 50 33.3 C 35 23 15 23 0 33.3" },
    { "id": "L-2", "lobe": "left",  "pathData": "M 100 66.7 C 85 77 65 77 50 66.7 C 35 56.4 15 56.4 0 66.7" },
    { "id": "R-1", "lobe": "right", "pathData": "M 33.3 100 C 43.6 85 43.6 65 33.3 50 C 23 35 23 15 33.3 0" },
    { "id": "R-2", "lobe": "right", "pathData": "M 66.7 100 C 77 85 77 65 66.7 50 C 56.4 35 56.4 15 66.7 0" }
  ] }
```

`gridSize.x` is the number of right-half cuts plus one, `gridSize.y` the number of left-half cuts plus
one. Number the cuts `L-1, L-2, …` by rising y and `R-1, R-2, …` by rising x. In `pathData` use absolute
`M` followed by `C` (or `L`) only, so convert arcs and relative commands first. The direction a cut is
written in does not matter here either (the site itself writes them from 100 down to 0). Optional fields: `author`, `weaveParity` (0 or 1), and
`colors: { "left": "#ffffff", "right": "#b91313" }` to pin the paper colours.

## 4. Four ways to make the cuts

Pick by what the person asked for. They combine: anything can be opened in the editor afterwards.

**A. Write the cuts yourself.** Best for geometric patterns: waves, arcs, zigzags, tilings, anything you
can compute. Work out the picture you want with the colour rule in section 1, then place the cuts. Keep
the cuts on their evenly spaced lines outside the motif and bend them only where the motif needs it.
Generate the numbers with a small script rather than by eye, and write both halves from the same numbers
when the heart is symmetric.

**B. Paint the picture and let the site find the cuts.** Best when you know the picture but not the cuts.
Open [/en/editor/paint/](https://juleflet.dk/en/editor/paint/) (Danish: `/editor/mal/`). Either paint on
the square with the tools, or press **Import picture** (Importér billede) and give it a two-colour
picture of the square: PNG, JPEG, WebP, or an SVG whose square viewBox is the woven square in the
coordinates of section 1. An SVG picture must be filled `<path>` elements using only the commands
`M L H V C S Q T Z`: no arcs, no `<rect>` or `<circle>`. The dialog shows how the mask will look and
which symmetries it found; press **Use as mask** (Brug som maske), then **Find the cuts** (Find snit). It
searches for up to a few minutes (the choices under it set the time and the narrowest strip) and reports,
for example, "4 + 4 cuts · at least 3.2 mm between cuts · 1.1% different from the mask". "Close, but not
exact" means the picture cannot be woven as painted; simplify the picture and try again. **Open in Draw**
(Åbn i Tegn) takes the result to the editor. Not every picture has a weave: see the end of section 1.

**C. Start from a figure or a word.** [/en/design/figure/](https://juleflet.dk/en/design/figure/) puts a
motif (star, tree, cat, and a couple of thousand more through the search box) into one of nine frames, with
sliders for size and spacing. [/en/design/text/](https://juleflet.dk/en/design/text/) does the same for a
few letters in a chosen font. The page's address changes as you choose, so it can be passed on. Both end
in **Save to My hearts** (Gem i Mine hjerter) and **Adjust the cuts in the editor** (Tilpas snit i
editoren).

**D. Draw in the editor.** [/en/editor/](https://juleflet.dk/en/editor/) (Danish: `/editor/`, called
Tegn). Click a cut to see its points and drag them; the panel sets the number of strips and the
symmetries (each curve, the curves in a half, the two halves) so one drag shapes the whole heart. The
**Escher** tab makes interlocking tiles. Dragging is slow work for an agent; use the editor mostly to
look at and touch up what A, B or C made.

## 5. Check it

Never hand over a heart you have not checked and looked at.

**With a browser.** Open [/en/editor/](https://juleflet.dk/en/editor/), and give your SVG to the file
input behind **Import SVG** (Importér SVG; `input[type=file][accept=".svg"]`). Importing replaces the
heart in the editor without asking. If the editor first asks "You have a draft from last time", answer
with the **Start over** (Start forfra) button *inside that question*; the panel has another button of the
same name, and the question itself is a `role="status"` element, so do not mistake it for the import's
answer. Read the status line the import prints:

- Good: `Imported: 3 × 3 strips. Cuts in each half: 2. No warnings.`
- Bad: `Not edge to edge (check them): path 5. Curves that cross or touch: 5.` and, above the heart,
  "The red curves cross or come too close to each other". The cuts at fault are drawn in red.

Both lines are in elements with `role="status"` or `role="alert"`, so they can be read without looking.
Then take a screenshot and **look at the woven heart**: is it the picture you meant? The editor draws
every cut as a line, hidden ones too. Untick **Show outline** (Vis omrids) in the Drawing panel to see
the heart as it will be woven; every import ticks it again.

Then open the heart's page through a share link (section 7); nothing needs to be saved for that. The page
states the strips, the **difficulty** (Easy, Medium, Hard, Expert) and the **symmetry** ("Mirror symmetry
– one template for both sides" or "No mirror symmetry – one template for each side"), and has a view of
the heart, one of the template to print (two, "Template left" and "Template right", when the halves
differ) and a 3D film of the weaving. The small picture on the "Heart" button is the heart at thumbnail
size: judge it there. The heart's page does **not** warn about crossing cuts; only the editor does.

**Without a browser.** The site is open source (MIT): `git clone https://github.com/thomasahle/julehjerte`,
`npm ci`, then

```sh
node scripts/svg-to-heart.mjs my-heart.svg --strict
```

prints the same status line as the editor and exits with 1 if there are warnings. Or check the rules of
section 2 with your own code: sample each cut finely, test same-half pairs for crossings and for the
1.5 unit distance, and render the picture with the colour rule to look at it.

## 6. Improve it

Expect several rounds. A useful loop:

1. Make the cuts, run the check, fix what is red.
2. Look at the woven picture small. Remove detail until it reads.
3. Look at the template (the heart page's Template views): are the strips wide enough, are there thin
   necks, does a curve have a kink or a tight turn? Smooth it with fewer, longer curve pieces.
4. If the two halves are nearly alike, make them exactly alike so one template is enough.
5. Show the person a picture and ask before polishing further. Taste differs.

## 7. Put it in the person's "Mine hjerter"

"Mine hjerter" lives in the **local storage of the person's own browser** on juleflet.dk. Nothing is
uploaded, and there are no accounts. So a heart saved in *your* automated browser is not in *theirs*.
Choose the route that fits what you can reach:

**You control the person's own browser** (a browser extension, or a browser they are watching). Import
the SVG in the editor as in section 5 (the Name field is filled from the file's `<title>`), and press the
**Save** button in the header (Gem; its accessible name is "Save to My hearts" / "Gem i Mine hjerter"). The message "… is saved in My hearts" confirms it. The heart now appears on the
front page under **My hearts** (Mine hjerter) and has its own page at `/hjerte/heart-…/`.

**You can only send the person something.** Send a link that carries the whole heart:

```
https://juleflet.dk/hjerte/delt/#design=<the JSON of section 3, percent-encoded>
```

(`/en/hjerte/delt/` for English.) In JavaScript: `'#design=' + encodeURIComponent(JSON.stringify(heart))`.
The heart travels in the part after `#`, which browsers do not send to any server.

Such a link is long: a few thousand characters for a plain heart, up to 30,000 for one full of curves.
Browsers open that, but chat and mail programs may cut it, and a link typed out character by character
is easily garbled. So round the coordinates to three decimals, write the link to a file or build it in
code rather than by hand, and prefer the compressed form, which is two to four times shorter and is
what the site's own Share button writes: the JSON, deflated *raw* (no zlib header), then base64url
without padding.

```python
import json, zlib, base64
def share_link(heart, lang_prefix=""):          # lang_prefix "/en" for English
    data = json.dumps(heart, separators=(",", ":")).encode()
    z = zlib.compressobj(9, zlib.DEFLATED, -15)  # -15: raw deflate
    payload = base64.urlsafe_b64encode(z.compress(data) + z.flush()).decode().rstrip("=")
    return f"https://juleflet.dk{lang_prefix}/hjerte/delt/#design={payload}"
```

If the link still comes to more than a couple of thousand characters and has to pass through a chat,
send the SVG file instead (below).

Opened, the link shows a page headed "A heart shared with you" with the heart and a **Save to My hearts**
(Gem i Mine hjerter) button; one click and it is theirs. The plain percent-encoded form (not the
compressed one) after `https://juleflet.dk/editor/?edit=true#design=` opens the heart in the editor
instead. Test your link in a browser before sending it if you can.

**Or send the SVG file** and tell them: open juleflet.dk/editor/, press Importér SVG, choose the file,
press Gem.

Do not write to the browser's storage yourself. The stored form is versioned and the site's own Save
button is the supported way in.

From the heart's page the person can print the template as a PDF (**Get template** / Hent skabelon),
trace it from the screen (**Trace** / Tegn af), watch the weaving film, change the colours, and share it
(**Share** / Del makes a link like the one above).

## 8. Good manners

- Tell the person plainly what you checked and what you did not, and whether the editor showed warnings.
- Give the heart a name and, if they want, put them as the author. Do not put a real designer's name on
  something they did not draw.
- The public gallery is curated by the site's owner. A heart for the gallery is suggested through
  [GitHub](https://github.com/thomasahle/julehjerte/issues), not added by an agent; the repository's
  `docs/ADDING-A-HEART.md` describes what a gallery heart needs.
- Be gentle with the site: it is a static site run by one person. Open pages as a visitor would; do not
  crawl it or run the cut finder in a loop.
