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

## Deployment

The project is configured for GitHub Pages deployment. Push to `main` to trigger automatic deployment via GitHub Actions.

## Tech Stack

- [SvelteKit](https://kit.svelte.dev/) - Web framework
- [Paper.js](http://paperjs.org/) - Vector graphics library
- [jsPDF](https://github.com/parallax/jsPDF) - PDF generation
- [TypeScript](https://www.typescriptlang.org/) - Type safety

## License

MIT
