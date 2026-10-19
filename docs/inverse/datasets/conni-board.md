# Conni's “Flettet julehjerte skabelon” board

The [user-supplied board](https://dk.pinterest.com/0wt3lqxkvukjlwc/flettet-julehjerte-skabelon/) was inventoried on 2026-10-19. Its signed-in page displayed **122 pins**. All **122 distinct cards**, at board positions **0–121**, were captured and downloaded; **zero cards are missing**. “Find more ideas” recommendations were excluded. One card has an opaque Pinterest path identifier, which is preserved literally. The signed-out SEO title still said 120 and its public data exposed only 25 anonymized records; neither was used as a completeness test.

The 122 cards advertise 91 image URLs, yielding **90 distinct byte hashes**. Three match the existing inventory exactly and reuse its immutable files through hardlinks. The batch downloaded **13,111,446 bytes (12.50 MiB)** under a 20 MiB cap; retained new asset bytes are 13,086,556. Original JPEG, PNG and GIF bytes are preserved. No image enlargement was guessed: every original URL came directly from a rendered card's `img srcset`.

This board is particularly useful for preserving cutting sheets. All three contact sheets were reviewed, with three ambiguous items inspected individually:

| Source-file content | Files |
| --- | ---: |
| Cutting templates or rendered designs | 57 |
| Photograph/template composites | 23 |
| Single assembled woven object photograph | 4 |
| Multiple-heart photograph | 1 |
| Process photographs | 2 |
| Other paper ornaments | 2 |
| Generic PDF placeholder icon | 1 |

These are file counts, not 90 independent motifs or verified cutting-template pairs. Some designs have nonstandard outlines, and one single-object photograph shows a four-lobed woven shape. Composites retain their photographic and template content together. Historical printed sheets are preserved as scans; their publication dates and creators have not been established. Low-resolution originals remain low resolution.

## Provenance and dataset separation

The [observed selection](../../../scripts/inverse/datasets/real-conni-board.json) preserves card titles as source text, not creator attribution. “Conni” is the board owner's displayed name; it is not assigned as designer, photographer or rights holder. Rights remain **not cleared**. No source file was added to public website assets.

Two external links were observed directly in rendered card controls: the card `504825439463937735` linked to [Fru Kubik's flowers/stars post](https://frukubikslaekkerier.com/2012/10/flettet-julehjerte-med-blomster-og.html), and `504825439482587760` linked to [Papirfoldning's week 51 page](https://www.papirfoldning.dk/da/ugensfold/2008-51.html). Another card's title literally contains the [DNA double-helix post URL](https://julehjerter.wordpress.com/2014/12/03/3-december-julehjerte-med-dna-dobbelthelix/). These are preservation follow-up leads, not independently verified author statements or newly downloaded original-source pages. Public web-reader fetches failed for all three during this batch.

The exact existing connections are:

| Existing asset | Existing split group | Status |
| --- | --- | --- |
| `real-6599bf9afb0a05e2` | `real-split-6659576e7cd45da1` | QA reserved |
| `real-e9600478525b9218` | `real-split-03b70ea1e7075716` | QA reserved |
| `real-874e5a5e2cd2e9ce` | `real-split-03b70ea1e7075716` | QA reserved |

The [results](conni-board-results.json) list their source groups. No additional file matches the existing decoded RGB bytes and dimensions exactly. A 256-bit difference-hash screen found **42 similarity links involving 31 staged files** at Hamming distance ≤12. These are [unreviewed candidates](conni-board-near-duplicate-candidates.json), not duplicate assertions. Three links reach currently unassigned source groups. Existing groups must therefore be audited before these source relationships are merged. The entire board is conservatively held for QA because its exact matches already connect to QA. Byte novelty does not establish independent training data.

## Files and verification

The import-ready [staged manifest](conni-board-staged-manifest.json) includes source-file labels, every pin origin, hashes, dimensions, existing source/split links and pending template/family status. Original assets and the three contact sheets are local to:

`/Users/ahle/repos/julehjerte-pinterest-skabelon/tmp/pinterest-skabelon/staging/`

No write was made to the pinned parent inventory or its original photos. An independent audit checked all 90 files' bytes, decoded pixels and dimensions, and verified all three hardlinks. All 122 records replayed offline without new image downloads. Seven new acquisition-invariant tests and the fourteen existing collector tests pass. Application checks were not rerun: this isolated sparse branch changes data collection tooling and metadata only.

The bounded staging command is:

```sh
nice -n 15 /usr/bin/python3 scripts/inverse/datasets/real-board-stage.py \
  --selection scripts/inverse/datasets/real-conni-board.json \
  --existing-root /Users/ahle/repos/julehjerte-solver-initialization \
  --output tmp/pinterest-skabelon/staging
```

Add `--offline` for the verified no-network replay. The importer verifies its selection and existing-manifest pins on resume, caps new image downloads across resumes, stops after rate limiting, retains one staged content-addressed file per hash, and refuses staging inside the existing dataset's worktree.

For adoption **after the parent's active benchmark completes**:

1. Cherry-pick this branch's metadata/tooling commit; retain the old catalog snapshot and experiment pins.
2. Verify the staged manifest and each source file's SHA-256. Hardlink the 87 new files into the parent's asset store; reuse the three existing files. Do not copy or overwrite original bytes.
3. Merge origins by SHA-256 and preserve all 122 pin associations. Resolve the 42 similarity candidates separately; keep candidate links distinct from confirmed near-duplicate identities.
4. Propagate QA reservation across the newly observed board/source connections and review the three currently unassigned groups. Recompute the dataset audit before selecting future training/evaluation cohorts.
5. Do not run the old board importer unchanged: it assumes JPEG and numeric pin IDs. This batch includes PNG/GIF and an opaque card URL. Use the staged manifest or adapt that importer explicitly.

No model has trained on these additions, and the collection does not establish redistribution permission or verified graph ground truth.
