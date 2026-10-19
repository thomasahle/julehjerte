# Juleflet Designer

<img width="823" height="741" alt="Screenshot 2025-12-18 at 7 53 14 AM" src="https://github.com/user-attachments/assets/cfca1398-ceaf-4be2-b9c9-31fbd6dff6db" />


## Adding a heart

One SVG in `static/hearts/` (with its Danish and English names and descriptions written into it)
and one id in `hearts.json` in the project root, then
`npm run generate:heart-data` — the steps are in [docs/ADDING-A-HEART.md](docs/ADDING-A-HEART.md).


## Similar websites

- [Majbrit og Erik Ginnerskov](http://ginnerskov.dk/hjerter.php) - Anderledes flettede hjerter
- [Alt Om Hobby](https://www.altomhobby.dk/e-bog/Julehjerte-skabeloner.pdf) - Skabeloner tilflettede julehjerter
- [Gerth Stølting Brodal](https://cs.au.dk/~gerth/julehjerter/) - Flettede Julehjerter med bogstaver
- [Papermatrix](https://papermatrix.wordpress.com/links/) - Links til mange andre hjerter
- [Johan's Hjerter](https://johansjulehjerter.dk/) - wonderfully creative cuts


## Testing and release checks

`npm test` runs application tests and the complete inverse suite, including timed
quality benchmarks. To run the inverse release gates separately, use
`npm run test:inverse:ci`; `npm run benchmark:inverse:ci` runs the advisory cases.

The deployment workflow requires type checks, lint, application tests, inverse
correctness tests and a production build. Fresh image searches with strict
wall-clock quality or routing expectations are registered with `qualityBenchmark`.
They run separately with their original budgets and assertions; misses appear in
the workflow summary and the `inverse-timed-quality-1` / `-2` artifacts (kept seven days).
They do not block deploying an otherwise valid improvement. A missing or broken
benchmark run still fails its reporting job.

Fixed-work geometry, paper connectivity, feature/image-loss and exported-rendering
regressions remain blocking, as do the longer functional photo fits. This does
not change the application's acceptance thresholds or claim every photo can be
solved in ten seconds. The measured old/new comparison and known difficult cases
are recorded in [the checkpoint study](docs/inverse/CHECKPOINT-POLICY-COMPARISON.json).


## License

MIT
