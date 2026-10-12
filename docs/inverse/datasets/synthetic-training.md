# Synthetic training data for graph proposals

This offline generator supplies reproducible images **with a known, validated cut-graph witness**. It does not train a model or change the live generator. Real photographs remain essential: these images currently approximate flat paper and simple backgrounds, rather than realistic folds, metallic reflections or scene clutter.

The first inspected pilot contains **12 base designs, 36 photographic views, 8 stored graph-incidence signatures and 3 procedural recipe groups**. The 36 views are not 36 independent motifs. All admitted designs passed the existing geometric and nominal paper-core checks, and an independent render from exported cuts agreed with the geometric renderer to within **0.275%** at 512 pixels. One frame candidate failed the unchanged geometry gate and was rejected. [Pilot evidence](synthetic-pilot.json)

The subsequent inspected batch contains **128 validated designs and 512 views at 384 pixels**, with 56 stored incidence signatures and the same 3 recipe groups. It took **81.1 seconds** including validation and file writes; all 3,968 referenced assets passed hash and label-consistency verification. Eight invalid candidates were rejected/resampled; the maximum renderer disagreement was **0.327%** at 512 pixels. The recipe holdout has 64 training designs (256 views), 32 validation designs (128 views) and 32 test designs (128 views). [Batch evidence](synthetic-batch.json)

Reproduce that batch with `--designs=128 --views=4 --resolution=384 --canonicalResolution=512` and a fresh output directory. The pilot and batch use overlapping seeds, so **do not concatenate them as independent designs**; the batch supersedes the pilot for training.

Generate and inspect a new dataset:

```sh
node scripts/inverse/datasets/synthetic-generate.mjs \
  --designs=12 --views=3 --seed=713051 --resolution=256 \
  --canonicalResolution=512 \
  --output=tmp/heart-training-synthetic/my-pilot
node scripts/inverse/datasets/synthetic-verify.mjs tmp/heart-training-synthetic/my-pilot
node --test --test-concurrency=1 scripts/inverse/datasets/synthetic-training.test.mjs
```

The output directory must not exist. Open its `index.html` to compare the canonical design, synthetic photograph, imperfect crop and undegraded material-coverage label. Asset hashes, code hashes, generation seeds, rejected candidates and admission checks are retained in `manifest.json`. Existing outputs are never overwritten. All generation uses installed project dependencies; no model or new package is required.

## Base designs and labels

The generator creates ordinary and shared-cut lattices with independently varying slit counts (1–7 in each sheet), straight and gently curved cuts, variable subsets of exactly shared connections, curved diagonal channels and frame-like arrangements. Both symmetric and asymmetric layouts occur. This is still a deliberately small set of procedural recipes; increasing the number of views alone cannot fix that limitation.

Every candidate passes through the production geometry validator, the nominal paper-core audit and the independently rendered exported template pair before any image is admitted. The independent SVG renderer is resvg; the comparison renderer samples the original cubic geometry. Their thresholded antialiasing conventions differ, so the measured disagreement and resolution are recorded, with a fixed 0.5% gate. This is numerical validation, not proof that the heart has been physically assembled.

The geometry hash excludes color phase and paper palette, so merely swapping colors does not count as new geometry. Exact control/path serializations remain distinct even if they describe equivalent reparameterized curves. The first pilot/batch manifests were corrected after this distinction and split leakage were reviewed; their original manifests and hashes are preserved alongside a recorded metadata-only correction.

For each accepted design:

- `cuts.json` contains the exported template pair with shared cubics stored once.
- `graph.json` contains nodes, exact canonical cubics, visible/shared edge flags and references from both slit families.
- `canonical.png` is the independently rendered two-color weave. Black represents paper A here; the coverage PNG labels use **white for fraction A = 1**, as explicitly described in their metadata.
- The manifest records geometric and paper validation, exact geometry hash, graph-incidence hash, source seed and recipe parameters.

A graph is a **valid witness**, not necessarily the only correct decomposition of its image. Edges not used by that witness must not automatically be trained as negative examples. Geometrically invisible shared cuts cannot generally be inferred uniquely from appearance. Alternative valid routings should eventually be represented as multiple positive witnesses or evaluated with downstream feasibility.

`topologySha256` fingerprints the stored edge incidence and ordered sheet paths, excluding coordinates and color phase. It distinguishes the pilot's repeated routing structures from new shapes, but is **not a graph-isomorphism canonicalizer**. Different subdivisions or relabelings can produce different signatures. Recipe groups, not those hashes, control the current splits. These groups are **not topology-disjoint or verified real motif families**: a 1×1 shared lattice and a channel can reduce to the same routing after degree-two vertices are suppressed.

## Photographic simulation

Each view adds the actual heart silhouette and two colored lobes around the overlap, then independently draws:

- Pose, scale, framing and a projective camera transform.
- Paper palettes including red/white, gold/cream, green/red, blue/white and difficult pale pairs.
- Illumination gradients, exposure, vignetting, paper texture, procedural background texture and a simple cast shadow.
- Pixel noise, Gaussian blur, reduced image resolution and JPEG compression.
- An imperfect four-corner crop, applied to the already degraded JPEG.

The clean latent coverage is stored separately from the photograph. It is not a threshold or color classification of that photograph. Color mixing in this pilot is empirical in sRGB, not a calibrated physical camera/paper model. The output does not currently simulate actual occlusions, paper thickness, folds or foil reflections.

Each view includes `photo.jpg`, `crop.png`, coverage PNGs, overlap-validity PNGs and `labels.json`. Supervise the graph inside the overlap-valid region; the silhouette/background are useful for localization but are not additional cut-graph targets. Coverage outside the valid region must be masked out.

`canonicalToPhoto` and `canonicalToCrop` preserve the exact relationship between cut geometry and each view, even when the proposed crop is wrong. Node projections are also stored directly. **A projective transformation of a polynomial Bézier curve is generally rational:** do not transform the four controls and pretend the resulting polynomial cubic is exact. Evaluate the canonical cubic and then apply the saved homography, or use an appropriate rational representation.

## Split and evaluation policy

No existing gallery template, Hunodan design or photograph benchmark is read by default. The current pilot consists only of new procedural parameterizations, with no external assets.

All ordinary/shared lattice variants—including different counts, curvature, color phases and perturbations—belong to the **same training recipe group**. Channel recipes are assigned to validation, and frame recipes to test. Every view inherits its source's `sourceId`, `familyId`, `groupId` and split. The legacy `familyId` field describes a recipe grouping, not a verified real motif family. The generator never randomly separates views of the same base design.

This is a **procedural-recipe holdout**, not topology-disjoint evaluation or an established test of structural generalization. Simplified routing topologies and similar motifs cross the recipe groups; for example, the one-cut shared lattice and the channel can have the same contracted routing. True held-out motif families require canonical topology/motif matching, including degree-two suppression, shared cuts, symmetries and alternative valid decompositions. These recipes are familiar constructions also used elsewhere in geometric experiments. Do not interpret success on them as recognition of novel art, and do not substitute this split for held-out real photographs. Adding gallery or photographed templates later requires explicit family/duplicate matching against the existing Hunodan and photographic QA sets first, including rotated/recolored/cropped variants.

`synthetic-verify.mjs` checks asset hashes, recorded admission checks, source/recipe-group isolation and projective node/corner consistency after copying the dataset. It does not repeat geometry or physical testing; regenerate to repeat the complete admission procedure. The focused tests exercise deterministic output, exact shared-edge identity, recipe grouping, projective transforms and independent validation.

## Next useful expansion

Prioritize additional valid routing families and a verified motif/topology split and several distinct valid witnesses for the same mask before multiplying views of existing designs. Keep counts of base designs, recipe groups, routing signatures and views separate. Fit augmentation ranges to the newly collected photographs, particularly pale paper, foil, lighting and crop error. Controlled real-photo comparisons should decide which effects help; greater synthetic distortion is not automatically better training.

For initial learning, these labels support a boundary/junction model and a connection-proposal scorer. The existing MILP, Bézier refinement and independent validators should continue to decide whether a proposed graph yields a usable template pair.
