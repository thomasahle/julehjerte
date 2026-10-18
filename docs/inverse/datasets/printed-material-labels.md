# Material identity across printing and shading

Two existing body-labelled photographs now have admitted partial material
annotations. Source photographs, polygon outlines and compiled overlays were
inspected at 256 and 768 pixels. The admitted inventory increases from seven
to **nine material-labelled instances**, without adding source photographs.

| Existing photograph | Reviewed distinction | What stays unknown |
| --- | --- | --- |
| Floral and striped three-by-three heart | Every floral print colour belongs to one material; every horizontal stripe colour belongs to the other | Joins, outer margins and unlabelled interiors; physical paper/fabric composition is not asserted |
| Bowed red/pale-pink basket | Each identity continues across illumination changes and bowing | Seam margins, uncertain body and hidden portions; tabletop, chocolates and cast shadows are not selected material |

The annotations use conservative interiors and inherit the original body labels
without changing them. They are intended to distinguish material from printed
ink or brightness. They provide neither cutting paths nor exact overlap corners.
The existing source groups and global allocations remain unchanged; neither
annotation has been used to train a material model.

A third reviewed image, `real-f4b397c381357dfa`, shows a dark decorative heart
held in two hands. Two distinct material identities cannot be established
confidently from that photograph. Its existing visible-body annotation remains
useful, but no A/B material labels are proposed. A guessed checker grid would
not establish observed material ground truth.

The [review record](printed-material-labels.json) preserves proposed source-pixel
coordinates, source/group hashes, outline-image hashes and this abstention.
Closer source-image inspection found one floral polygon vertex at `(811, 570)`
extending into the adjacent striped cell. It was moved inward to `(849, 535)`;
the corrected outline has been visually checked. The original proposal and
outlines remain preserved, and its waiting compiler was stopped before any
labels were generated. The correction is recorded explicitly rather than
silently replacing the earlier review.

The [admitted sidecar](../../../scripts/inverse/datasets/real-materials-printed.json)
passes source, grouping, polygon-conflict and generated-pixel checks at both
resolutions. Unknown boundaries remain excluded from supervision. These are
assistant-reviewed annotations, not an independent human review.

Final identity checks also exposed an exporter bug: rebuilding RGB through a
NumPy array stripped the floral photograph’s embedded ICC color profile. Its
pixels were unchanged, but the PNG no longer matched the earlier body-training
export. The compiler now saves the original transformed RGB image object. A
regression test reproduces the lost profile before the fix and verifies profile
and complete PNG identity afterward. Both new RGB inputs and body-label PNGs
are now byte-identical to the previous 256-pixel body exports. All final label
and overlay pixels match the inspected proposals.

The full offline learning suite passes 90 tests across fifteen modules, including
the new profile-preservation regression and eight material-evaluation checks.
No model was trained or added to the application.
