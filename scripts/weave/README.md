# Weaving films

Each gallery heart's page can show the heart being cut, woven and hung, in 3D (the "Fletning"
tile under the heart). The film is a recording of a paper simulation, made here, offline, once
per heart; the page only plays it.

    static/hearts/<id>.svg --unweave.py--> run.npz --pack.py--> static/weave/<id>.jhb

- `unweave.py`, `cutmesh.py`, `labels.py`, `verify.py`: the simulator. It reads the cuts of a
  heart's SVG, meshes the two halves as paper, starts from the finished weave and takes it apart
  crossing by crossing; played backwards that is the weaving. `NOTES.md` says how it works.
- `pack.py`: turns a run into the compact recording the page fetches (`.jhb`: quantised
  positions, delta-coded and deflated, with the steps' times and tags).
- `viewer.html`: the simulator's own viewer, kept as the reference `static/weave/film.js` (the
  page's player) was made from.
- `films.mjs`: makes the films of the gallery's hearts and keeps `films.json`.
- `films-data.mjs`: what `films.json` means; shared with `scripts/generate-heart-data.mjs`.

## Making films

    python3 -m venv .venv-weave && .venv-weave/bin/pip install -r scripts/weave/requirements.txt
    export WEAVE_PYTHON=$PWD/.venv-weave/bin/python

    node scripts/weave/films.mjs --list          # what there is, and what is stale
    node scripts/weave/films.mjs --dry           # which hearts the simulator can do (seconds each)
    node scripts/weave/films.mjs --jobs 3        # every heart without an up-to-date film
    node scripts/weave/films.mjs kogle stjerne   # these hearts
    npm run generate:heart-data                  # tell the pages (also part of every build)

A heart takes from a few minutes to half an hour of one core, more for many strips. `--until
08:30` stops a long run at that time; what is done is kept, and the next run goes on with the
rest. Commit `films.json`, the new `static/weave/*.jhb` and `src/lib/data/heart-meta.json`
together.

## films.json

One line per heart that has been tried:

- `design`: hash of the cuts the film was made from (`designHash`: the SVG without its names,
  texts and credits). When a heart is redrawn the hash no longer matches, the build leaves the
  film out with a warning (it never fails), and `films.mjs` makes it again.
- `outcome`:
  - `clean`: paper never passed through paper.
  - `unclean`: the film was made, but a strip that would not go through a loop was carried
    through paper (`magic` strips, over `magicFrames` frames), or `bad` frames have paper in
    paper. Shown all the same; see `SHOWN` in `films-data.mjs`.
  - `unsupported`: the simulator cannot do this heart yet; `reason` is its own explanation
    (the cuts do not divide the halves into strips it can follow, or the finished weave
    cannot be laid out flat without paper in paper).
  - `failed`: the run broke; `reason` is its last line, and `tmp/weave/<id>/` holds its log.
- `v`, `bytes`: the recording's own hash and size. The page fetches `<id>.jhb?v=<v>` and
  knows the size beforehand for its progress bar.
- `seconds`, `crossings`, `stretch`, `retries`, `simSeconds`: the film's length as recorded,
  the crossings woven, the most the paper stretched (%), draws that needed a second try, and
  how long the simulation took.

## The page's side

- `src/lib/data/heart-meta.json` carries `film: { v, bytes } | null` per heart
  (`generate-heart-data.mjs`), so a page knows whether to offer the tile without asking the
  server.
- `src/lib/components/detail/HeartStage.svelte` shows the tile;
  `src/lib/components/detail/WeaveFilm.svelte` is the film's card (caption, transport);
  `src/lib/weave/film.ts` fetches three.js, the player and the recording when the tile is
  first chosen; `src/lib/weave/words.ts` words each step in Danish and English from its tag.
- `static/weave/film.js` is the player: `viewer.html`'s script with the page taken off. The
  weaving itself is shown faster than it was recorded (`WEAVE_PACE` in `WeaveFilm.svelte`);
  the cutting before it and the hanging after it are drawn by the player and keep their pace.
