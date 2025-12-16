# Julehjerter Designer

Interactive Danish woven Christmas heart ("julehjerte") designer and PDF template generator.

## Features

- **Visual Editor**: Design custom woven heart patterns with an intuitive Paper.js-based editor
- **Multi-segment Curves**: Create complex curve patterns with bezier segments
- **Symmetry Tools**: Optional symmetry within curves, lobes, or between lobes
- **PDF Templates**: Generate printable PDF templates for your designs
- **Gallery**: Browse and select from pre-made heart designs
- **Batch Printing**: Print multiple templates at once with customizable scale

## Live Demo

Visit [ahle.github.io/julehjerte](https://ahle.github.io/julehjerte) to try it out.

## Heart JSON Format

The built-in gallery hearts live in `static/hearts/`:

- `static/hearts/index.json` lists the heart ids in the gallery (without `.json`).
- `static/hearts/<id>.json` contains a single heart design.

### Heart design schema

Each design file is a `HeartDesign` (see `src/lib/types/heart.ts`):

```json
{
  "id": "classic-4x4",
  "name": "Classic 4x4",
  "author": "Traditional",
  "description": "Optional",
  "gridSize": 4,
  "fingers": [
    { "id": "L-0", "lobe": "left", "pathData": "M 450 225 C 380 235 300 215 150 225" },
    { "id": "R-0", "lobe": "right", "pathData": "M 225 450 C 235 380 215 300 225 150" }
  ]
}
```

- `id`: stable identifier used in URLs and filenames.
- `name`, `author`, `description`: display metadata (`description` is optional).
- `gridSize`: number of strips per lobe (typically `2`–`8` in the UI).
- `fingers`: the *internal boundary curves* that separate adjacent strips.
  - For `gridSize = N` there are typically `N - 1` boundaries for the left lobe and `N - 1` for the right lobe (outer edges are implied).
  - `id`: usually `L-<i>` or `R-<i>` with `i = 0..N-2`.
  - `lobe`: `"left"` or `"right"`.
  - `pathData`: SVG path data using absolute `M` + one or more `C` cubic segments.
    - `M x y` is an absolute “move-to” that sets the start point.
    - Each `C x1 y1 x2 y2 x y` is an absolute cubic Bezier segment (two control points, then the segment end point). For multi-segment curves you repeat `C ...` and each segment starts where the previous ended.
    - Only absolute `M`/`C` commands are supported (no relative commands, and other commands like `Q`/`S`/`A` are ignored).
  - `nodeTypes` (optional): per-anchor node behavior, keyed by anchor index as a string (`"0"`..`"<n>"` where `n` is the number of `C` segments).
    - Values are `"corner" | "smooth" | "symmetric"` (Inkscape-like).
    - Anchor `0` is the `M` point, anchors `1..n-1` are segment junctions, and anchor `n` is the final segment end point.
  - Coordinates are in the app's canvas space (a `600x600` square). The overlap square has side length `gridSize * 75` and is centered at `(300, 300)`. When loading, endpoints are snapped to the overlap-square edges for the given `lobe`.
  - Legacy `p0/p1/p2/p3`-style finger formats are not used; the on-disk/share format is `pathData` (+ optional `nodeTypes`) only.

## Development

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
npm run preview  # Preview the production build
```

## Type Checking

```sh
npm run check
```

## Graph Utilities (Python)

These scripts are used for experimenting with planar face-adjacency graphs from two-colour images.

- Export embedded dual `G0` (faces + boundary “green” ports): `python3 image_adjacency.py example.png --embedded-json tmp/g0.json`
- Find a grid expansion (grid-minor style) and optionally emit the expanded grid graph:
  - `python3 gridify_embedded_dual.py tmp/g0.json --out tmp/grid.json --out-graph tmp/grid_graph.json`
- Apply refinement ops manually (SplitArc / VertexSplit):
  - `python3 refine_embedded_dual.py tmp/g0.json --op split_arc:0 --op vertex_split:1:1:3 --out tmp/g1.json`

## Deployment

The project is configured for GitHub Pages deployment. Push to `main` to trigger automatic deployment via GitHub Actions.

## Tech Stack

- [SvelteKit](https://kit.svelte.dev/) - Web framework
- [Paper.js](http://paperjs.org/) - Vector graphics library
- [jsPDF](https://github.com/parallax/jsPDF) - PDF generation
- [TypeScript](https://www.typescriptlang.org/) - Type safety

## License

MIT
