# Visible junctions in the live gallery

On 18 October 2026, the [live gallery](https://juleflet.dk/) showed 55 designs.
Visual inspection and a numerical screen of their rendered SVG colour boundaries
found no genuine interior junction of degree greater than four. The
[snapshot](datasets/gallery-visible-junctions-2026-10-18.json) records every design,
source hashes, method and maximum degree found. This is not an exact algebraic
proof or an audit of minimum paper widths and physical assembly.

Two distinct necessary conditions should not be conflated:

- Any regular binary mask has even visible degree: a small loop returns to its
  starting colour after an even number of genuine boundary crossings. Six
  alternating wedges are a consistent binary mask.
- Our regular weave model additionally permits at most one simple cut of each
  sheet at a point, because same-sheet cuts are disjoint. Each cut contributes
  two branches. Shared portions cancel, so the visible degree is zero, two or
  four. A genuine degree-six junction is impossible in this model.

The count is local to one point. Six petals or many rays do not establish six
incident colour-boundary branches. In the gallery:

- [Eksplosion](https://juleflet.dk/hjerte/explosion/) separates its rays with a
  small central checkerboard containing distinct degree-four junctions.
- [Blomst](https://juleflet.dk/hjerte/flower/) and
  [Snefnug](https://juleflet.dk/hjerte/snowflake/) retain a solid central region.
- [Flyvende gæs](https://juleflet.dk/hjerte/flyvendegaes/) places a triangle tip
  against the middle of another triangle's base, yielding four branches there.

The numerical screen used the actual prerendered even-odd weave paths, normalized
to a 100-unit overlap square. It canonicalized collinear spans, split at detected
intersections and cancelled even-multiplicity segments. Adaptive chord tolerance
was 0.0025, with Newton refinement of curve intersections. `khatam` and `santa`
required a polygonal fallback at tolerance 0.0005 because the cubic importer
rejected partial nonlinear overlaps. Those approximations also found degree at
most four.

An initial raw segment count flagged `triple-heart` near two border endpoints.
Inspection showed collinear retracing and differently parameterized overlapping
straight segments, not six distinct visible branches. Straight-span normalization
removed the false positives. Counting serialized segment ends or crossings of a
fixed-size circle is therefore insufficient to certify a genuine junction.
