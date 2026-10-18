# Crop padding does not explain the missing edge features

A read-only follow-up to [the six remaining failures](remaining-photo-failures.md)
checks whether artificial white padding created the small source features lost
by the outlined star and crossed ribbons. **It did not:** all 68 star-feature
pixels and all 72 ribbon-feature pixels map inside the original photograph,
including their complete bilinear sampling footprints.

| Frozen automatic crop | Pixels receiving padding | Fully outside pixels | Missing-feature pixels receiving padding |
| --- | ---: | ---: | ---: |
| Outline star | 0 | 0 | 0 / 68 |
| Crossed ribbons | 2,809 | 2,564 | 0 / 72 |
| Bauble | 4,587 | 4,266 | 0 / 3,387 |

Each crop has 160,000 pixels. The analysis uses the saved effective quadrilateral,
original image dimensions and byte-verified classified masks from the completed
`turn-limit-v1` benchmark. A separate opaque-black input passed through the
production rectifier verifies the computed padding contribution: all 1,440,000
RGB samples agree within one byte. No photograph, corner, classification,
template, acceptance threshold or fitting result was changed.

The existing importer fills outside-image samples with the configured background
color and does not retain their coverage. Mal subsequently prepares the classified
mask as a drawing. That remains a limitation for partial photographs, but cannot
explain the particular lost features above. Excluding padding from evaluation
would change the denominator without demonstrating that those features recovered.

The star and ribbon fragments lie about 1.2–1.3 mm from the square's bottom edge.
Visual inspection of their masks shows small fragmented boundaries there. These
are observed photograph pixels, not established paper-material or original-artwork
labels; sampling inside the image does not establish that the crop includes only
the intended heart. Crop placement, paper/background classification and legal
routing remain distinct possibilities. This diagnostic supplies no evidence for
relaxing feature retention or automatically discarding those regions.

The [measurements and hashes](remaining-photo-coverage.json) retain the executable
local probe and its inputs. This is a three-case input diagnosis, not a new solve
benchmark or an increase over 25/31.
