# Sabrina Danholm's complete heart board

All **225 pins** on [Mine egne flettede julehjerter](https://dk.pinterest.com/sabrinadanholm/mine-egne-flettede-julehjerter/) were inventoried and downloaded on 2026-10-17. The signed-in board's displayed count matched 225 unique rendered pin links. Every original-image URL came from an explicitly advertised image `srcset`; no larger URL was guessed. The signed-out page exposed only 25 images despite reporting 225 pins, so its end marker was not treated as completeness evidence.

The collection adds **220 distinct files and 36,836,015 bytes (35.13 MiB)**. Five files already existed under other pin URLs and were reused. Originals are stored once by content hash, outside Git. Downloading was sequential at low priority, paced by host, with a 100 MiB per-run acquisition cap and a 10 GiB free-space floor.

All five contact sheets were visually reviewed: **223 assembled-heart photographs, one mixed photograph/reference-artwork image, and one process shot**. These are source files, not 225 independent designs or newly labeled training examples. The board provides metallic paper, dark colors, fine grids, curved motifs, perspective and reflections. It does not provide verified cutting geometry, corner or material-mask labels.

The merged inventory now contains **1,254 files, including 783 files containing assembled-heart photographs**. The independent asset audit verifies all bytes, decoded pixels, dimensions and split-group consistency. Fourteen collector tests pass. A separate offline import reproduces all 225 selections with zero new image bytes. The importer also rejects a missing offline image with a nonzero exit status. These 225 photographs have not yet been run as an end-to-end solver benchmark.

The observed board is kept together as a source group. One of its five reused files was already reserved for QA, so the existing conservative split rule reserves the entire board. This prevents the new source relationship from leaking related images into training. Historical experiments have not been rerun with the updated grouping. Motif-family annotation remains pending.

The [selection](../../../scripts/inverse/datasets/real-sabrina-board.json), [collection audit](sabrina-board-results.json), [merged manifest](real-manifest.json), and [asset audit](real-validation.json) retain provenance and checksums. Current local contact sheets are under `tmp/heart-training-real/sabrina-board/review/`.

```sh
python3 scripts/inverse/datasets/real-board-import.py \
  --selection scripts/inverse/datasets/real-sabrina-board.json \
  --output tmp/heart-training-real/sabrina-board
python3 scripts/inverse/datasets/real-collect.py collect --offline
python3 scripts/inverse/datasets/real-collect.py export
python3 scripts/inverse/datasets/real-audit.py
```

The importer consumes the saved, explicitly observed inventory; it does not crawl boards or export browser credentials. The collection retains the existing source-rights metadata and admission rules.
