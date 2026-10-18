# Do not select shared cuts by one pixel score alone

A proposed change retained the accepted alignment prefix with the lowest
original-source pixel error while continuing to explore later joins. It was
replayed on the same 47 frozen accepted exports used by the audit-order study.
All geometry, nominal paper and feature-change checks pass.

Only the floral checker changes: eight joins survive instead of nine.
Source sampling improves by one pixel, but independent binary rendering worsens
by one pixel. Fractional coverage error improves very slightly, from 2.22449%
to 2.22405%. Exactly shared length falls from 55.29 to 52.11 mm. The two
400-pixel renders show no clear visual improvement.

This does not justify changing the selection objective. A tiny pixel-score
improvement can sacrifice useful shared geometry, and the independent renderer
need not rank subpixel changes identically. The [record](shared-prefix.json)
preserves the mixed results and the isolated implementation; the proposal was
not adopted. The full photographic comparison failure remains recorded.
