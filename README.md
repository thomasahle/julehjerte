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
