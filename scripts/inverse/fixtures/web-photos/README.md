# Web photograph corpus

20 additional photographs, containing 44 selected heart instances, collected on 2026-09-08. These are **instances, not 44 independent designs**. The selection covers new colour pairs, glitter, printed paper, clutter, rotation and partial occlusion.

Sources:

- [Bibelselskabet](https://www.bibelselskabet.dk/flet-selv-smukke-julehjerter-12-skabeloner-til-fri-download): seven photographs complementing the four already in `photo-cases.json`.
- [Danish Things, basic hearts](https://danishthings.com/da/flettede-julehjerter/) and [tree motif](https://danishthings.com/da/julehjerte-med-juletrae/): eight photographs by Christel Parby.
- [Gathering Beauty](https://www.gatheringbeauty.com/blog/2018/02/diy-danish-woven-paper-heart-valentine-baskets.html): three photographs of patterned-paper hearts.
- [ViSSEVASSE](https://vissevasse.dk/pages/julehjerter-her-far-du-4-gratis-skabeloner): two group photographs with varied paper and rotations.

`manifest.json` records exact photo URLs, source pages, attribution, retrieval date, SHA-256, original dimensions, tags and published template links. Original JPEG bytes are retained. Rights remain with the creators; no software licence is assigned to the photos. Test fixtures are outside public website assets.

Rough rectangles select hearts within group photos, as a user would with **Select one heart**. They were annotated before running the detector and are not overlap-square corners. A null rectangle means the complete upload. Original photographs remain intact; the detector receives the source pixels and optional rough selection only. Reference links are for subsequent evaluation and never enter the fitter.

The published cuts have not yet been digitized or audited. `full-length-slit-candidate` is a visual scope annotation, not verified cutting geometry. `unreviewed` cases need a template audit before inclusion in a regular-design pass rate. Printed-paper and occluded cases should be reported separately from plain two-colour inputs: their visible decoration is not itself a weaving boundary. Multi-part/four-paper examples and instruction collages were excluded with reasons recorded in the manifest.

Related captures share a `family`. Group by publisher and motif as well as by photo when assessing generalization; keep related images together if introducing a holdout split. This exploratory corpus is not an untouched holdout after its results are inspected.

Verify all downloaded inputs offline:

```sh
node scripts/inverse/web-photo-data.mjs
```

To restore missing files, add `--fetch-missing`. Downloads must match the recorded hash; changed upstream images are rejected rather than silently replacing the fixtures.

Run automatic crop detection and preparation on every selection, offline:

```sh
node scripts/inverse/web-photo-benchmark.mjs
```

Add `--stage=solve --seconds=10` to fit templates and independently render exported cuts. `--ids=bibel-checker-3,danish-tree-red` selects specific cases; `--output=tmp/my-run` chooses the report directory. Both stages retain every failure in `results.json` and produce a visual `report.html`. Solving time is a solver budget; separately reported total time includes decoding, detection, preparation, validation and export. Run this benchmark serially without other CPU-heavy jobs.

See [the initial baseline](../../../../docs/inverse/WEB-PHOTOS.md). In particular, a passed candidate check does **not** establish a correct design if the crop or the classified mask was wrong.
