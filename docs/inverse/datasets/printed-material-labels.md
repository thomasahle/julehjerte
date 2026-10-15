# Material identity across printing and shading

Two existing body-labelled photographs now have proposed partial material
annotations. Their original photographs and polygon-outline previews have been
visually inspected. Compiled label verification and overlay review are pending;
the admitted inventory remains seven material-labelled instances.

| Existing photograph | Proposed distinction | What stays unknown |
| --- | --- | --- |
| Floral and striped three-by-three heart | Every floral print colour belongs to one material; every horizontal stripe colour belongs to the other | Joins, outer margins and unlabelled interiors; physical paper/fabric composition is not asserted |
| Bowed red/pale-pink basket | Each identity continues across illumination changes and bowing | Seam margins, uncertain body and hidden portions; tabletop, chocolates and cast shadows are not selected material |

The annotations use conservative interiors and inherit the original body labels
without changing them. They are intended to distinguish material from printed
ink or brightness. They provide neither cutting paths nor exact overlap corners.
The existing source groups and global allocations remain unchanged; neither
proposal has been used to train a material model.

A third reviewed image, `real-f4b397c381357dfa`, shows a dark decorative heart
held in two hands. Two distinct material identities cannot be established
confidently from that photograph. Its existing visible-body annotation remains
useful, but no A/B material labels are proposed. A guessed checker grid would
not establish observed material ground truth.

The [review record](printed-material-labels.json) preserves proposed source-pixel
coordinates, source/group hashes, outline-image hashes and this abstention.
The proposals are outside the admitted training sidecars. Compilation at 256 and
768 pixels is queued after the current solver/browser checks. It will recheck
source identity, existing body supervision, material conflicts and generated
pixels. Final overlays must then be inspected before promotion.
