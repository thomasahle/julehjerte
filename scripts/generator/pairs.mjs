// One stored recipe for each topology of the board circle: of its outer topology (the board's
// outline as blobs, `boardOutline` with no turns: where the circle stands among the squares) and
// its inner one (how the motif's rings nest), across every board. The circle past the middle lines'
// ends is one outer topology on five, seven and nine strips; a recipe for the pair is one template
// for every motif and size of it, on every board.
//
// Every solve on any board (scripts/generator/solves, as recipes.mjs and cover2.mjs store them) is
// a candidate for its pair, converted at each size it was solved for on the circle it was solved on
// (see `solvedAt`), its places made short and held where they lay. At each motif and size judged it
// is carried to the outline there (`transferTopology`) and drawn beside the generator's own heart,
// first at one size of a few of the pair's boards and motifs, then the best few at every size judged. For each
// pair the one is kept that beats the generator's heart at the most motif sizes (then: the fewest
// places the paper may tear where it draws, the fewest hidden turns), and stored once, with the
// outline it was solved on (`frame`); the page carries it to the outline of any picture of the pair,
// at any size on any board, and keeps it where it beats the generator's own heart (`fromTopology`).
//
//   node scripts/generator/pairs.mjs <motif>...
//   env: BOARDS=3,5,7,9   STEPS=45-100   EVERY=3   judge every third size of each board
//        SCREEN=8         at how many of a pair's boards and motifs its candidates are first judged
//        KEEP=6           how many of a pair's candidates are judged at every size
//        PER_PAIR=3       how many recipes a pair keeps: each next one adds the most motif sizes where
//                         the best of those kept (as the page keeps the best it draws) beats the generator's
//        CACHE=dir        (tmp/generator/topology, as topology.mjs's) OWN_FROM=hash: own hearts judged
//                         under a hash before (src/lib changed only in recipe code since); DRAWN_FROM=hash:
//                         candidates' hearts drawn under a hash before (storedHearts draws them as then)
//        OUT=file         write there (else static/generator/recipes/board.json)
//        ROWS_ONLY=1      only judge the generator's own hearts (to run boards apart beforehand)
//        UNSOLVED=file    write the pairs no candidate beats the generator's heart in, with their motif sizes
//        ADD=1 BASE=file  keep the recipes of every pair the file (else the page's) has any for, and choose
//                         only for the others
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer } from 'vite';

const root = process.cwd();
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
console.warn = () => {};
const load = p => server.ssrLoadModule(p);
try {
	const { generate, storedHearts, fromTopology, spurless, knownOf } = await load('/src/lib/generator/generate.ts');
	const { picture } = await load('/src/lib/generator/picture.ts');
	const { topologyOf, nestingOf } = await load('/src/lib/generator/topologyRecipes.ts');
	const { transferTopology, outlineFrame } = await load('/src/lib/generator/topologyTransfer.ts');
	const { boardSetting } = await load('/src/lib/generator/boardMotif.ts');
	const { boardRanges, boardLines } = await load('/src/lib/generator/geometry.ts');
	const { boardOutline } = await load('/src/lib/generator/boardOutline.ts');
	const { cutMeasures, betterCuts } = await load('/src/lib/generator/cutQuality.ts');
	const { DEFAULT_COLORS_HEX } = await load('/src/lib/stores/colors.ts');

	const motifs = process.argv.slice(2);
	if (!motifs.length) throw new Error('Usage: node scripts/generator/pairs.mjs <motif>...');
	const boards = (process.env.BOARDS ?? '3,5,7,9').split(',').map(Number), keep = Number(process.env.KEEP ?? 6), perPair = Number(process.env.PER_PAIR ?? 3);
	const [lo, hi] = (process.env.STEPS ?? '45-100').split('-').map(Number), every = Number(process.env.EVERY ?? 3);
	const contoursOf = async id => JSON.parse(await fs.readFile(`static/generator/motifs/${id}.json`, 'utf8')).contours;
	const request = (contours, name, p, strips) => ({ mode: 'figure', name, contours, style: 'board', frame: 'circle', frameSize: 70, scale: p / 100, gap: 3, colors: DEFAULT_COLORS_HEX, board: strips });
	const board = shown => shown.rings.slice(0, shown.motif);
	const pairOf = shown => `${boardOutline(board(shown), 360).sig}|${nestingOf(shown.rings.slice(shown.motif))}`;
	const fineOf = shown => boardOutline(board(shown)).sig;

	// The board circle's radius at a setting on the even slider (tried on a branch in 2026-10, never
	// shipped: the radius growing evenly over the settings): the pair solves made there
	// (`slider: 'even'`, as recipes.mjs on that branch marked them) name their sizes so.
	const even = (setting, strips) => {
		const ranges = boardRanges(strips), smallest = ranges[0][0], largest = Math.max(...ranges.map(([, high]) => high));
		let radius = smallest + (setting - .45) / .55 * (largest - smallest);
		for (const line of boardLines(strips)) if (Math.abs(radius - line) < .1) radius = line + .1;
		return radius;
	};
	// Where a solve was solved: at its own size, or at the setting whose circle is the one it had on
	// the even slider.
	const solvedAt = (p, known, slider, strips) => slider !== 'even' ? { p, known }
		: { p: boardSetting(even(p / 100, strips), strips) * 100, known: typeof known?.circle === 'number' ? { ...known, circle: boardSetting(even(known.circle, strips), strips) } : known };

	// The candidates: every solve on the boards as its topology's, once for each pair it was solved in.
	const candidates = [], shapes = new Set(), solves = 'scripts/generator/solves';
	for (const f of (await fs.readdir(solves)).sort()) {
		if (!f.endsWith('.json') || !/\.board(-\d+\.[^.]+)?\.json$/.test(f)) continue;
		const id = f.split('.board')[0], solved = JSON.parse(await fs.readFile(path.join(solves, f), 'utf8'));
		const contours = solved.contours ?? await contoursOf(id).catch(() => null);
		if (!contours) continue;
		for (const recipe of solved.recipes ?? []) {
			if (recipe.style !== 'board' || !boards.includes(recipe.strips) || !recipe.steps?.length || 'outline' in recipe) continue;
			const pairs = new Set();
			for (const p of recipe.steps) {
				const at = solvedAt(p, recipe.known, recipe.slider, recipe.strips), shown = picture(request(contours, id, at.p, recipe.strips), at.known);
				const topology = shown?.motif !== undefined && topologyOf(recipe, shown);
				if (!topology || pairs.has(pairOf(shown))) continue;
				pairs.add(pairOf(shown));
				for (const r of [topology, { ...topology, held: true }]) {
					const shape = JSON.stringify([r.outline, r.motif, !!r.held, r.places.map(ring => ring.length), r.A, r.B]);
					if (shapes.has(shape)) continue;
					shapes.add(shape);
					candidates.push({ recipe: r, board: board(shown), strips: recipe.strips, pair: pairOf(shown), from: `${id} ${recipe.strips}×${recipe.strips} ${p}%` });
				}
			}
		}
	}
	const byPair = new Map();
	candidates.forEach((c, i) => byPair.set(c.pair, [...byPair.get(c.pair) ?? [], i]));
	console.log(`${candidates.length} candidates from the solves on ${boards.join(', ')} strips, over ${byPair.size} pairs`);

	// What is already judged under the code as it is (a hash of src/lib), each board's motifs in a file.
	const hash = text => crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
	const lib = (await fs.readdir('src/lib', { recursive: true })).filter(f => /\.(ts|js|json|svelte)$/.test(f) && !/\.test\.ts$/.test(f)).sort();
	const code = async (files = lib) => hash((await Promise.all(files.map(f => fs.readFile(path.join('src/lib', f), 'utf8')))).join('\0'));
	const cacheRoot = process.env.CACHE ?? 'tmp/generator/topology';
	// The generator's own heart draws no recipe, nor the picture recipes are drawn on.
	const recipeCode = ['recipes.ts', 'topologyRecipes.ts', 'topologyTransfer.ts', 'boardOutline.ts', 'picture.ts'].map(f => path.join('generator', f));
	const ownCode = await code(lib.filter(f => !recipeCode.includes(f))), allCode = await code();
	const dirs = new Map();
	for (const strips of boards) {
		const own = path.join(cacheRoot, `board-${strips}-own-${ownCode}`), drawn = path.join(cacheRoot, `board-${strips}-pairs-${allCode}`);
		await fs.mkdir(drawn, { recursive: true });
		const seed = process.env.OWN_FROM && path.join(cacheRoot, `board-${strips}-own-${process.env.OWN_FROM}`);
		if (seed && !(await fs.stat(own).catch(() => null)) && await fs.stat(seed).catch(() => null)) await fs.cp(seed, own, { recursive: true });
		const drawnSeed = process.env.DRAWN_FROM && path.join(cacheRoot, `board-${strips}-pairs-${process.env.DRAWN_FROM}`);
		if (drawnSeed && !(await fs.readdir(drawn)).length && await fs.stat(drawnSeed).catch(() => null)) await fs.cp(drawnSeed, drawn, { recursive: true });
		await fs.mkdir(own, { recursive: true });
		dirs.set(strips, { own, drawn });
	}
	const recipeHash = ({ steps: _steps, solved: _solved, ...recipe }) => hash(JSON.stringify(recipe));

	// A motif at a size on a board: the generator's own heart (its measures, none where it is hard to
	// cut or refused, and what it tells the picture), and the picture's outline and pair.
	const files = new Map();
	const fileOf = async (strips, id) => {
		const key = `${strips} ${id}`;
		if (!files.has(key)) {
			const { own, drawn } = dirs.get(strips), ownFile = path.join(own, `${id}.json`), drawnFile = path.join(drawn, `${id}.json`);
			files.set(key, { contours: await contoursOf(id), ownFile, drawnFile,
				owns: JSON.parse(await fs.readFile(ownFile, 'utf8').catch(() => '{}')), drawn: JSON.parse(await fs.readFile(drawnFile, 'utf8').catch(() => '{}')) });
		}
		return files.get(key);
	};
	const row = async (strips, id, p) => {
		const file = await fileOf(strips, id), req = request(file.contours, id, p, strips);
		if (!file.owns[p]) {
			let own;
			try { own = generate(req); } catch { own = null; }
			const known = own ? knownOf(own, p / 100) : {}, shown = picture(spurless(req), known);
			file.owns[p] = { known, own: own && shown ? cutMeasures(own.design, shown.rings) : null, hard: !!own?.hardToCut };
			await fs.writeFile(file.ownFile, JSON.stringify(file.owns));
		}
		const { known, own, hard } = file.owns[p], shown = picture(spurless(req), known);
		if (shown?.motif === undefined) return;
		return { strips, id, p, req, known, shown, own: own && !hard ? own : null, hard, fine: fineOf(shown), pair: pairOf(shown), file };
	};

	// A candidate on an outline of a board: itself on its own, else carried there (once an outline).
	const carriedTo = new Map();
	const carry = (i, r) => {
		const key = `${i} ${r.strips} ${r.fine}`;
		if (!carriedTo.has(key)) {
			const c = candidates[i], recipe = c.strips === r.strips && c.recipe.outline === r.fine ? c.recipe : transferTopology(c.recipe, c.board, board(r.shown));
			carriedTo.set(key, recipe && { ...recipe, style: 'board', strips: r.strips });
		}
		return carriedTo.get(key);
	};
	// Its measures drawn there, the site's way (none where it does not cut cleanly, unless the
	// generator's heart is hard to cut there too and the page finishes it so, see `fromTopology`).
	const owns = new Map(), ownOf = r => { const k = `${r.strips} ${r.id} ${r.p}`; if (!owns.has(k)) { try { owns.set(k, generate(r.req)); } catch { owns.set(k, null); } } return owns.get(k); };
	const draw = (i, r) => {
		const recipe = carry(i, r);
		if (!recipe) return null;
		const at = r.file.drawn[r.p] ??= {}, h = recipeHash(recipe);
		if (!(h in at)) {
			let heart = storedHearts(r.req, [{ ...recipe, steps: [r.p] }], true, 1, r.known)[0];
			if ((!heart || heart.hardToCut) && r.hard) {
				const own = ownOf(r);
				heart = own ? fromTopology({ ...r.req, recipes: [{ ...recipe, steps: [r.p] }] }, own) : undefined;
			}
			at[h] = heart && (!heart.hardToCut || r.hard) ? cutMeasures(heart.design, r.shown.rings) : null;
		}
		return at[h];
	};
	const save = async () => { for (const f of files.values()) await fs.writeFile(f.drawnFile, JSON.stringify(f.drawn)); };

	// Every motif at every size judged on every board.
	const rows = [];
	for (const strips of boards) {
		for (const id of motifs) for (let p = lo; p <= hi; p += every) {
			const r = await row(strips, id, p);
			if (r) rows.push(r);
		}
		console.log(`  ${strips}×${strips}: ${rows.filter(r => r.strips === strips).length} motif sizes`);
	}
	// Only the generator's own hearts, judged ahead in another process.
	if (process.env.ROWS_ONLY) process.exit(0);
	const rowsOf = new Map();
	for (const r of rows) rowsOf.set(r.pair, [...rowsOf.get(r.pair) ?? [], r]);
	const wins = (m, r) => !!m && (!r.own || betterCuts(m, r.own));

	// Each pair: its candidates first at one size (the middle judged) of each board and motif, then the
	// best `keep` at all of them; the one that beats the generator's heart most often kept.
	const chosen = new Map(), unsolved = [];
	// ADD=1: the pairs the shipped file (BASE, else the page's) has recipes for keep them as they are, so
	// no heart the page draws already changes; only pairs without any are chosen for.
	const base = process.env.ADD ? JSON.parse(await fs.readFile(process.env.BASE ?? 'static/generator/recipes/board.json', 'utf8')).recipes.filter(r => r.frame) : [];
	const had = new Set(base.map(r => `${r.frame.blobs}|${r.motif}`));
	let n = 0;
	for (const [pair, mine] of rowsOf) {
		const list = byPair.get(pair) ?? [];
		n++;
		if (had.has(pair)) { console.log(`  pair ${n}/${rowsOf.size} (${mine.length} motif sizes): kept as shipped`); continue; }
		if (!list.length) { console.log(`  pair ${n}/${rowsOf.size} (${mine.length} motif sizes): no solve`); unsolved.push({ pair, candidates: 0, rows: mine.map(r => [r.strips, r.id, r.p]) }); continue; }
		const started = performance.now(), groups = new Map();
		for (const r of mine) groups.set(`${r.strips} ${r.id}`, [...groups.get(`${r.strips} ${r.id}`) ?? [], r]);
		// Screened at the middle size of up to `screen` of its boards and motifs, spread over them.
		const all = [...groups.values()], screen = Number(process.env.SCREEN ?? 8);
		const middles = (all.length <= screen ? all : Array.from({ length: screen }, (_, k) => all[Math.floor(k * all.length / screen)])).map(g => g[Math.floor(g.length / 2)]);
		const score = (i, among) => {
			let won = 0, weak = 0, turns = 0, drawn = 0;
			for (const r of among) {
				const m = draw(i, r);
				if (!m) continue;
				drawn++; weak += m[0]; turns += m[3];
				if (wins(m, r)) won++;
			}
			return { i, won, weak, turns, drawn };
		};
		const order = (a, b) => b.won - a.won || a.weak - b.weak || a.turns - b.turns;
		const screened = list.map(i => score(i, middles)).sort(order).slice(0, keep).filter(s => s.won);
		const judged = screened.map(s => score(s.i, mine)).sort(order);
		// Several kept: at each motif size the best of their hearts (as `fromTopology` keeps it), and
		// where that beats the generator's, its weak places.
		const together = picks => {
			let won = 0, weak = 0;
			for (const r of mine) {
				const best = picks.map(s => draw(s.i, r)).filter(Boolean).reduce((a, b) => !a || betterCuts(b, a) ? b : a, null);
				if (best && wins(best, r)) { won++; weak += best[0]; }
			}
			return { won, weak };
		};
		const picks = judged[0]?.won ? [judged[0]] : [];
		for (let now = together(picks); picks.length && picks.length < perPair;) {
			const next = judged.filter(s => !picks.includes(s)).map(s => ({ s, t: together([...picks, s]) }))
				.reduce((a, b) => !a || b.t.won > a.t.won || (b.t.won === a.t.won && b.t.weak < a.t.weak) ? b : a, null);
			if (!next || next.t.won <= now.won) break;
			picks.push(next.s);
			now = next.t;
		}
		await save();
		if (picks.length) chosen.set(pair, { picks, won: together(picks).won });
		else unsolved.push({ pair, candidates: list.length, rows: mine.map(r => [r.strips, r.id, r.p]) });
		const named = s => `${candidates[s.i].from}${candidates[s.i].recipe.held ? ' held' : ''}`;
		console.log(`  pair ${n}/${rowsOf.size} (${mine.length} motif sizes, ${list.length} candidates): ${picks.length ? `${picks.map(named).join(' + ')} beat${picks.length > 1 ? '' : 's'} the generator's at ${chosen.get(pair).won}` : 'none beats the generator\'s'} (${((performance.now() - started) / 1000).toFixed(0)} s)`);
	}

	// Each pair's recipes as solved, with the outline they were solved on (`frame`): the page carries
	// them to the outline of any picture of the pair, at every size on every board (`carryTopology`).
	const rounded = frame => frame && JSON.parse(JSON.stringify(frame, (_, v) => typeof v === 'number' ? +v.toFixed(6) : v));
	const recipes = [...chosen.values()].flatMap(({ picks }) => picks.map(pick => {
		const c = candidates[pick.i], { solved: _solved, ...recipe } = c.recipe;
		return { ...recipe, style: 'board', strips: c.strips, steps: [], frame: rounded(outlineFrame(c.board)) };
	})).filter(r => r.frame);
	recipes.unshift(...base);
	const won = [...chosen.values()].reduce((s, b) => s + b.won, 0);
	console.log(`${chosen.size} pairs of ${rowsOf.size} have a recipe chosen${had.size ? ` (and ${had.size} kept as shipped)` : ''}, ${recipes.length} kept; the chosen beat the generator's own heart at ${won} of ${rows.length} motif sizes judged`);

	// The pairs no solve beats the generator's heart in (none, or none of their candidates), to solve.
	if (process.env.UNSOLVED) await fs.writeFile(process.env.UNSOLVED, JSON.stringify(unsolved));
	const file = process.env.OUT ?? 'static/generator/recipes/board.json';
	const old = JSON.parse(await fs.readFile('static/generator/recipes/board.json', 'utf8').catch(() => '{"version":1,"recipes":[]}'));
	await fs.writeFile(file, JSON.stringify({ version: 1, recipes: [...old.recipes.filter(r => !boards.includes(r.strips)), ...recipes] }));
	console.log(`wrote ${file}`);
} finally {
	await server.close();
}
