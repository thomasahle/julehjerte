# Real heart photograph collection

The first collection contains **397 visually reviewed source files showing assembled paper hearts**, representing **345 reviewed near-duplicate groups**. These are not 345 independent motifs: different photographs of the same design remain useful photographic observations, and motif-family annotation is still pending. The files include 29 composites combining photographs and cutting templates, 57 multiple-heart scenes and eight photographic collages. Individual heart instances have not been counted or annotated.

The complete acquisition inventory contains **672 distinct byte hashes**, about **154 MB** of assets. Every file has been visually inspected in contact sheets or individually. In addition to the 397 photograph files, it retains 67 assembly-process photographs, 143 template/render files, six photographs of other materials, 58 unrelated source-page images, and one ambiguous image. Those categories are explicitly separate from the assembled-heart photograph subset.

[The manifest](real-manifest.json) records hashes, dimensions, original/source URLs, acquisition/import times, source groups, review labels, rights facts and unverified template associations. [The audit](real-validation.json) checks the bytes, decoded RGB hashes and dimensions of every local asset. Bulk images are deliberately outside Git, under `tmp/heart-training-real/assets/`. Open `tmp/heart-training-real/index.html` for a filterable local gallery; numbered contact sheets are in `tmp/heart-training-real/review/`.

## Source coverage

The collection examined 134 primary/source pages, plus 45 explicitly selected public Pinterest pins. Examples include colored studio photographs, pale and metallic paper, printed paper, strong reflections, angled and open baskets, hands, Christmas trees, background clutter and large collages. The main photograph contributions are:

| Source | Assembled-heart photograph files | Reviewed near-duplicate groups within source |
| --- | ---: | ---: |
| Krümmel | 117 | 117 |
| flettedehjerter.dk | 102 | 92 |
| Danish Things | 36 | 21 |
| Hunodan, photo/template composites | 27 | 27 |
| Public Pinterest pins | 22 | 22 |
| Doodlecraft | 16 | 8 |
| Bibelselskabet | 13 | 13 |
| Flet.Studio | 11 | 10 |
| Wikimedia Commons | 5 | 5 |

Other sources include Gathering Beauty, Carina's Craftblog, ViSSEVASSE, Cloudberry Living, Northern Sunset Papercrafts, Rosemary Washington, Northpole and All Free Crafts. Existing regression fixtures are imported with their provenance, not counted as newly found photographs. Rows in this table can overlap through shared files and reposts and should not be summed as independent designs.

Source pages often offer templates. PDF/SVG URLs and same-page template image IDs are retained as **unverified associations**. Archive/index pages can associate many unrelated motifs; a same-page association does not establish the correct template for a particular photograph. None of these downloaded templates has been promoted to graph ground truth.

## Pinterest

The public-pin importer downloaded **42 of 45 selected pins**. The initial 41-pin batch all downloaded successfully. Of four additional keyword-search discoveries, one downloaded, one returned HTML without an advertised main image, one returned HTTP 429, and the remaining request was stopped because that host had rate limited the run. These are distinct outcomes, retained in the manifest. The downloaded subset contains **22 assembled-heart photograph files**, with the other files labeled as templates, other materials, process pictures, unrelated or ambiguous.

Pins were selected from public keyword-search results for *julehjerter*, *flettede julehjerter*, *woven paper hearts* and *Danish woven hearts*. No board traversal, account login, private API, CAPTCHA circumvention or crawler impersonation is used. The importer downloads the literal original-resolution URL advertised in the public pin HTML when present; otherwise it uses the advertised main-image URL. It never fabricates a larger-image URL. One pin supplies a different large hanging-heart collage from the existing 40-heart QA collage.

The ordinary website crawler honors robots rules. Pinterest's generic crawler exclusion is distinct from this bounded, user-authorized import of explicitly selected public pins. Links observed inside the public pin JSON are **unverified possible source links**, since related recommendations can appear there. They are not author/ownership attribution. They are used conservatively for split grouping, where an unnecessary connection only over-reserves data.

## Identity, rights and evaluation separation

- Exact byte hashes are deduplicated immediately. Decoded RGB hashes and 256-bit difference hashes support further review. The 95 perceptual-similarity candidate pairs are retained locally, and visually confirmed resizes/reposts share `nearDuplicateGroup`. Perceptual matching is not an automatic assertion that similar motifs are the same photograph.
- `splitGroupId` joins reviewed duplicate links and conservative source/publisher groups. Existing QA reservation propagates transitively, including to connected reposts. **372 files are currently QA-reserved**; 195 assembled-heart photograph files are outside those reserved groups. Those 195 are not yet training-ready.
- `familyId` remains unassigned until motif-family review. All crops or augmentations of a collage/photo must retain its group. Do not randomly split files or crops. Cross-source motifs may require additional grouping before any training split is approved.
- Rights facts are explicit per origin. Commons file-description licenses and authors are retained separately from the Commons page-text license. Most source photographs have no established training/redistribution permission; free craft-template download is not treated as such permission. Every asset currently has `trainingRightsStatus: not-cleared`.
- The collection includes fully visible and partially occluded hearts, difficult lighting and nonstandard outlines; it is not filtered to only easy solver cases. Geometry, masks, corners and heart-instance boxes have not been labeled.

## Reproduce and extend

Python 3.9+ and Pillow are required; no new dependency installation was needed in the development environment. Run from this worktree:

```sh
python3 scripts/inverse/datasets/real-collect.py discover
python3 scripts/inverse/datasets/real-pinterest.py
python3 scripts/inverse/datasets/real-collect.py collect
python3 scripts/inverse/datasets/real-collect.py review
python3 scripts/inverse/datasets/real-collect.py export
python3 scripts/inverse/datasets/real-audit.py
python3 scripts/inverse/datasets/real-collect.test.py
```

`real-sources.json` controls bounded primary-site discovery. `real-pinterest-pins.json` is an explicit list of public keyword-search discoveries. `real-review.json` stores visual labels keyed by content identity; `real-rights.json` records individually checked license facts. New files remain `unknown` until reviewed. Rerunning downloads reuses SHA-256-verified cached bytes and merges newly discovered source pages, source groups and rights-history evidence for already cached image URLs.

Requests have time/byte limits, per-host pacing, error records and atomic checkpoints. The main collector holds an exclusive lock for discovery/collection. It stops new requests to a host after HTTP 429. Prior failed requests are not silently retried: inspect the failure and remove its specific cached error record only when a retry is appropriate. HTTP/TLS failures and robots exclusions remain visible; the collector does not change hosts or credentials to get around them. Metadata checkpoints are saved every 25 candidates to keep resumption inexpensive; downloaded bytes are cached individually.

Ten offline tests cover image-URL selection, cache integrity, provenance merging, original-image selection without invented URL upgrades, nonexecuting public-JSON parsing and transitive QA reservation. The asset audit independently checks all 672 local files. The collection does not claim an exhaustive internet dataset or completed annotation/training work. The next valuable work is motif-family and per-heart annotation, including matching verified published templates where available, followed by a larger keyword-search Pinterest batch after rate limiting has cleared.
