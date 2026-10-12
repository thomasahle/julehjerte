# Public Pinterest photograph expansion

This collection extends the initial 42 downloaded public pins using the four pins supplied by the user, keyword search, and a bounded traversal of links and explicit Pin records exposed in public pin pages. It does not traverse boards or call private APIs. The machine-readable counts are in [the expansion audit](real-pinterest-expansion.json), and [the merged manifest](real-manifest.json) retains the full provenance.

The follow-up downloaded **428 of 442 visited pins**, yielding 365 distinct file hashes. All 14 failures returned public HTML without an advertised main image; there were no new HTTP rate limits. Including the initial run, **470 of 487 public pins downloaded**, and **198 source files contain assembled-paper-heart photographs**, representing 177 reviewed near-duplicate photo groups within the Pinterest subset.

| Merged corpus measure | Initial snapshot | After expansion |
| --- | ---: | ---: |
| Distinct file hashes | 672 | 1,034 |
| Reviewed assembled-heart photograph-containing files | 397 | 573 |
| Reviewed near-duplicate photo groups | 345 | 461 |
| QA-reserved files | 372 | 475 |

The net addition is **176 photograph-containing files and 116 photo groups** after accounting for existing images and confirmed reposts. The complete local inventory occupies **199,381,046 bytes**. All 1,034 files passed the independent byte/hash/dimension audit. There are 314 photograph-containing files outside reserved QA groups, but family, instance and rights review remain incomplete.

The four supplied pins all downloaded successfully:

- [76842737369225295](https://dk.pinterest.com/pin/76842737369225295/) advertises a 700 × 593 hanging-heart collage.
- [448600812892496489](https://dk.pinterest.com/pin/448600812892496489/) advertises a 600 × 836 *Bornholmske Hjerter* cover with many colored hearts.
- [408349891231964172](https://dk.pinterest.com/pin/408349891231964172/) advertises a 736 × 552 copy of the existing hard-case collage. It remains in the reserved QA group.
- [145452262943966772](https://dk.pinterest.com/pin/145452262943966772/) advertises a 480 × 854 screenshot containing existing Hunodan photograph/template composites. Visual review explicitly reserves this screenshot and its derived crops for QA.

## Acquisition and review

One hundred indexed keyword searches produced 425 distinct public pin IDs before relevance filtering. Queries cover Danish, Swedish, Norwegian, German and English terms. The final explicit selection contains 320 pins; related discovery is limited to two link steps and a maximum of 600 visited pins in a run. Literal pin links and typed public `Pin` JSON records are accepted; arbitrary numeric IDs, board IDs and private endpoints are not. For a public record that already exposes an image URL, the importer downloads that advertised image directly and records its parent page and parent-page hash.

Each host is paced at 1.2 seconds plus up to 0.5 seconds of jitter. Actual HTTP 429 stops the run; `Retry-After` is recorded. Cached failures are not silently retried. Public HTML main-image failures, HTTP failures and the ordinary crawler's robots exclusions are separate outcomes. The initial collection's older 429 is retained as historical evidence; the follow-up uses a separate run ledger and cache.

A normal Chromium browser also checked the public `julehjerter` keyword page. It returned HTTP 200 but displayed a mandatory login modal, with no public pin anchors exposed in the rendered DOM. No login or modal bypass was attempted. Search-engine-indexed pin URLs and their publicly advertised images were usable without that login flow. The browser result and screenshot are preserved under `tmp/heart-training-real/pinterest-browser-check/`.

Every retained file is classified from its actual pixels, not its search title. Search recommendations include recipes, knitting, embroidery, jewelry, clothing, furniture, template drawings and unrelated travel photographs. These are explicitly separated from assembled paper-heart photographs. Printed-paper designs, metallic and pale paper, green/blue/yellow paper, partial occlusion, open baskets, hands, tree scenes and collages are retained. A collage is one source photograph, not dozens of independent training images.

This remains a source-image corpus rather than a labeled training set. Motif families, per-heart boxes, corners, masks and cutting geometry are not annotated. Page-level cutting-template associations remain unverified. Pinterest uploader names are not treated as photographer or rights-holder attribution, and no training or redistribution license is inferred from public access.

## Reposts and evaluation separation

Byte-identical files are merged immediately. Perceptual hashes suggest resize/repost candidates, which are visually checked before grouping. The follow-up records 137 confirmed duplicate relationships in `real-duplicate-review.json`; confirmed duplicates retain a shared `nearDuplicateGroup`. Split grouping also retains source/publisher identity and conservatively includes unverified source links observed in public pin JSON. Those links may come from recommendations, so they are possible connections, not established image attribution.

QA reservation propagates across those groups. Known Hunodan composites and the existing hard-case collage are reserved even when a pin presents a screenshot, crop or different JPEG encoding. Similar-looking photographs can still depict the same motif: near-duplicate photo groups are not independent design counts, and unresolved family review prevents a claim of leakage-free training readiness.

## Files and reproduction

The original manifest and audit are preserved at commit `ade443a` and in `tmp/heart-training-real/snapshots/initial-ade443a/`. Each follow-up pass preserves its selection and import ledger as `run-N-selection.json` and `run-N-imports.json` under `tmp/heart-training-real/pinterest-expanded/`. Original image bytes stay outside Git; content hashes, URLs, dimensions, retrieval times, source evidence, review labels and grouping metadata are committed.

```sh
python3 scripts/inverse/datasets/real-pinterest.py \
  --selection scripts/inverse/datasets/real-pinterest-expanded-pins.json \
  --output tmp/heart-training-real/pinterest-expanded \
  --max-pins 600 --related-depth 2
python3 scripts/inverse/datasets/real-collect.py collect --offline
python3 scripts/inverse/datasets/real-collect.py export
python3 scripts/inverse/datasets/real-audit.py
python3 scripts/inverse/datasets/real-collect.test.py
```

The public-pin importer has an exclusive output lock and atomic checkpoints. Resuming preserves new query/parent provenance for cached pins and restores the bounded related-link queue. The collector merges both original and follow-up ledgers, counts repeated pin IDs once, and retains each ledger for inspection. Thirteen offline tests cover these identity/provenance rules along with cache integrity and transitive QA reservation.

Open `tmp/heart-training-real/index.html` for the merged filterable gallery. A Chromium smoke check verified all seven filter counts, including 573 photo-containing files and 202 template/render files, with no JavaScript errors or broken loaded images. The larger dataset improves photographic coverage, but the dominant acquisition limitation is relevance and repost duplication: a successful pin download is not necessarily a new photograph, and a new photograph is not necessarily a new motif.
