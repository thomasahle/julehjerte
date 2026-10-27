// Stored hidden cuts for a frame's topologies (see src/lib/generator/recipes.ts).
//
// Every recipe solved for a motif in the frame (scripts/generator/solves/<motif>.<style>.json, as
// recipes.mjs writes them, and <motif>.<style>-<strips>.*.json: more for one board) is turned into its topology's (`topologyOf`) and drawn on every motif
// given of that topology, at every size judged, beside the generator's own heart, each measured
// as the site compares them (`cutMeasures`, `betterCuts`: places the paper may tear, one template
// for both lobes over two, sharp tips, hidden turns, length). The site draws up to three of a
// topology's recipes at a size and keeps the best where it beats the generator's own heart
// (`fromTopology`). Each solve is a candidate twice: its places made short on each motif, and held
// where they lay on the motif solved (`held`). At each size judged the three are kept that do so
// for the most motifs, and a size between takes the nearest judged size's. A held one is also
// listed at the sizes it was solved for where it is the best of its motif's solves there and
// beats the generator's heart (`solved`): the site draws it first on its own motif (`motifFit`).
// A solve is held as converted at its first size, and converted again at the first size where
// that draws worse than the solve itself, so each of its sizes keeps the solve's cuts.
// Writes static/generator/recipes/<style>.json, listed in index.json.
//
//   node scripts/generator/topology.mjs <style> <strips> <motif>...   (strips - for a frame without a board: the rays)
//   env: STEPS=45-100   the sizes, in percent
//        EVERY=3        judge every third size (the others take the nearest's recipes)
//        SOLVES=dir     further solves (<motif>.<style>.json, <motif>.<style>-<strips>.*.json) beside
//                       scripts/generator/solves
//        MERGE=1        keep the file's recipes for other strips
//        ADD=1          keep all the shipped file's recipes, adding this run's only for the topologies
//                       it has none for on this board (so no heart the page draws already changes)
//        OUT=file       write there instead, unlisted (to merge runs on several boards)
//        CACHE=dir      where each motif size's judgement is kept (tmp/generator/topology): the
//                       generator's own heart under a hash of src/lib but the recipe code, the recipes'
//                       under one of all src/lib; a run again judges only what is new
//
// One process: each size draws every candidate recipe (a fifth of a second each) and the paper check.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const root = process.cwd();
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
console.warn = () => {};
const load = p => server.ssrLoadModule(p);
try {
	const { generate, storedHearts, fromStoredRecipe, spurless, knownOf } = await load('/src/lib/generator/generate.ts');
	const { picture } = await load('/src/lib/generator/picture.ts');
	const { topologyOf, nestingOf } = await load('/src/lib/generator/topologyRecipes.ts');
	const { boardOutline } = await load('/src/lib/generator/boardOutline.ts');
	const { cutMeasures, betterCuts } = await load('/src/lib/generator/cutQuality.ts');
	const { DEFAULT_COLORS_HEX } = await load('/src/lib/stores/colors.ts');

	const [style, stripsArg, ...motifs] = process.argv.slice(2);
	const strips = stripsArg === '-' ? undefined : Number(stripsArg), on = strips ? ` ${strips}` : '';
	if (!style || strips === 0 || Number.isNaN(strips) || !motifs.length) throw new Error('Usage: node scripts/generator/topology.mjs <style> <strips or -> <motif>...');
	const [lo, hi] = (process.env.STEPS ?? '45-100').split('-').map(Number), every = Number(process.env.EVERY ?? 3);
	const contoursOf = async id => JSON.parse(await fs.readFile(`static/generator/motifs/${id}.json`, 'utf8')).contours;
	const request = (contours, name, p) => ({ mode: 'figure', name, contours, style, frame: 'circle', frameSize: 70, scale: p / 100, gap: 3, colors: DEFAULT_COLORS_HEX, board: strips });
	const keyOf = pic => `${boardOutline(pic.rings.slice(0, pic.motif)).sig}|${nestingOf(pic.rings.slice(pic.motif))}`;

	// The candidates: every solve on this board as its topology's, each shape once.
	const sources = [];
	const solves = 'scripts/generator/solves';
	// A motif's (<motif>.<style>.json), and more for this board (<motif>.<style>-<strips>.*.json).
	const read = async dir => { for (const f of await fs.readdir(dir).catch(() => [])) if (f.endsWith(`.${style}.json`) || (f.includes(`.${style}-${strips}.`) && f.endsWith('.json'))) sources.push([f.split(`.${style}`)[0], path.join(dir, f)]); };
	await read(solves);
	if (process.env.SOLVES) await read(process.env.SOLVES);
	const candidates = new Map(), shapes = new Set(), made = [], listed = new Set();
	const convert = (id, contours, recipe, p) => { const shown = picture(request(contours, id, p), recipe.known); return shown && topologyOf(recipe, shown); };
	for (const [id, file] of sources) {
		// Solves made on an outline the motif has since changed keep it (`contours`): their places lie on it.
		const solved = JSON.parse(await fs.readFile(file, 'utf8')), contours = solved.contours ?? await contoursOf(id).catch(() => null);
		if (!contours) continue;
		for (const recipe of solved.recipes) {
			if (recipe.style !== style || recipe.strips !== strips || !recipe.steps.length || 'outline' in recipe) continue;
			let topology;
			for (const p of recipe.steps) if ((topology = convert(id, contours, recipe, p))) break;
			if (!topology) continue;
			const held = { ...topology, held: true };
			made.push({ id, contours, recipe, held });
			const shape = JSON.stringify([topology.outline, topology.motif, topology.places.map(p => p.length), topology.A, topology.B]);
			if (shapes.has(shape)) continue;
			shapes.add(shape);
			const key = `${topology.outline}|${topology.motif}`;
			if (!candidates.has(key)) candidates.set(key, []);
			// Each with its places made short, and held where they lay on the motif solved.
			candidates.get(key).push(topology, held);
			listed.add(held);
		}
	}
	console.log(`${style}${on}: ${[...candidates.values()].flat().length} topology recipes from ${sources.length} files, over ${candidates.size} topologies`);

	// What is already judged under the code as it is (a hash of src/lib), each motif's sizes in a file.
	const hash = text => crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
	const lib = (await fs.readdir('src/lib', { recursive: true })).filter(f => /\.(ts|js|json|svelte)$/.test(f) && !/\.test\.ts$/.test(f)).sort();
	const code = async (files = lib) => hash((await Promise.all(files.map(f => fs.readFile(path.join('src/lib', f), 'utf8')))).join('\0'));
	const cacheRoot = process.env.CACHE ?? 'tmp/generator/topology';
	// The generator's own heart draws no recipe.
	const recipeCode = ['recipes.ts', 'topologyRecipes.ts'].map(f => path.join('generator', f));
	const ownDir = path.join(cacheRoot, `${style}${on.replace(' ', '-')}-own-${await code(lib.filter(f => !recipeCode.includes(f)))}`);
	const cacheDir = path.join(cacheRoot, `${style}${on.replace(' ', '-')}-${await code()}`);
	await fs.mkdir(ownDir, { recursive: true });
	await fs.mkdir(cacheDir, { recursive: true });
	const recipeHash = ({ steps: _steps, solved: _solved, ...recipe }) => hash(JSON.stringify(recipe));

	// A motif at a size: the generator's own heart's measures (none where it is hard to cut or
	// refused), the topology's key, and those of the recipes given as drawn there (each the
	// site's way, none where it does not cut cleanly), each kept in the cache.
	const files = new Map();
	const judge = async (id, p, list) => {
		if (!files.has(id)) {
			const cacheFile = path.join(cacheDir, `${id}.json`), ownFile = path.join(ownDir, `${id}.json`);
			files.set(id, { contours: await contoursOf(id), cacheFile, ownFile,
				cache: JSON.parse(await fs.readFile(cacheFile, 'utf8').catch(() => '{}')), owns: JSON.parse(await fs.readFile(ownFile, 'utf8').catch(() => '{}')) });
		}
		const { contours, cacheFile, ownFile, cache, owns } = files.get(id), req = request(contours, id, p);
		// The generator's own heart, and what it tells the picture the site draws recipes on.
		if (!owns[p]) {
			let own;
			try { own = generate(req); } catch { own = null; }
			const known = own ? knownOf(own, p / 100) : {}, shown = picture(spurless(req), known);
			// A frame with no picture for the generator's heart (the rays on a finer board) has no topology there.
			owns[p] = { known, own: own && shown ? cutMeasures(own.design, shown.rings) : null, hard: !!own?.hardToCut };
			await fs.writeFile(ownFile, JSON.stringify(owns));
		}
		const seen = { ...owns[p], drawn: cache[p] ??= {} };
		const shown = picture(spurless(req), seen.known);
		if (shown?.motif === undefined) return;
		const key = keyOf(shown);
		list ??= candidates.get(key) ?? [];
		const drawn = list.map(candidate => {
			const h = recipeHash(candidate);
			if (!(h in seen.drawn)) {
				const heart = storedHearts(req, [{ ...candidate, steps: [p] }], true, 1, seen.known)[0];
				seen.drawn[h] = heart && !heart.hardToCut ? cutMeasures(heart.design, shown.rings) : null;
			}
			return seen.drawn[h];
		});
		await fs.writeFile(cacheFile, JSON.stringify(cache));
		return { key, own: seen.own && !seen.hard ? seen.own : null, drawn, list };
	};

	// Each motif at each size judged: the generator's own heart and every candidate of its topology.
	const rows = [];
	for (const id of motifs) for (let p = lo; p <= hi; p += every) {
		const started = performance.now(), judged = await judge(id, p);
		if (!judged) continue;
		const { key, own, drawn, list } = judged;
		rows.push({ id, p, key, own, drawn });
		const wins = drawn.filter(m => m && (!own || betterCuts(m, own))).length;
		console.log(`  ${id} ${p}%: ${list.length} recipes, ${drawn.filter(Boolean).length} draw, ${wins} beat the generator's ${own ? JSON.stringify(own) : 'refusal or hard heart'} (${((performance.now() - started) / 1000).toFixed(1)} s)`);
	}

	// The solve itself (as recipes.mjs stored it for its motif) drawn at a size, kept in the cache.
	const original = async (id, p, recipe) => {
		if (!await judge(id, p, [])) return null;
		const { contours, cacheFile, cache, owns } = files.get(id), h = `solve ${recipeHash(recipe)}`, drawn = cache[p];
		if (!(h in drawn)) {
			const req = request(contours, id, p), heart = fromStoredRecipe(req, [{ ...recipe, steps: [p] }]);
			drawn[h] = heart && !heart.hardToCut ? cutMeasures(heart.design, picture(spurless(req), owns[p].known).rings) : null;
			await fs.writeFile(cacheFile, JSON.stringify(cache));
		}
		return drawn[h];
	};
	// Each solve held on its motif at the sizes it was made for: converted at its first size, and
	// again at the first size that draws worse than the solve itself, until every size has one.
	const solvedOn = new Map(), heldOf = new Map(), ownOnly = [];
	for (const { id, contours, recipe, held: first } of made) {
		let remaining = recipe.steps.filter(p => p >= lo && p <= hi), next = first;
		while (remaining.length) {
			const p = remaining[0], topology = next ?? convert(id, contours, recipe, p);
			next = undefined;
			if (!topology) { remaining.shift(); continue; }
			const mark = `${id} ${recipeHash({ ...topology, held: true })}`;
			if (!heldOf.has(mark)) {
				const held = topology.held ? topology : { ...topology, held: true };
				held.solved = [];
				heldOf.set(mark, held);
				solvedOn.set(held, id);
				if (!listed.has(held)) ownOnly.push(held);
			}
			const held = heldOf.get(mark), covered = [];
			for (const q of remaining) {
				if (q === p) { covered.push(q); continue; }
				const m = (await judge(id, q, [held]))?.drawn[0], target = await original(id, q, recipe);
				if (m && (!target || !betterCuts(target, m))) covered.push(q);
			}
			held.solved = [...new Set([...held.solved, ...covered])].sort((a, b) => a - b);
			remaining = remaining.filter(q => !covered.includes(q));
		}
	}

	// At each size a motif was solved for, the best of its held solves there (where it beats the
	// generator's own heart): the site draws a motif's own first, but only three.
	const bestHeld = new Map();
	for (const [held, id] of solvedOn) for (const p of held.solved) {
		if (p < lo || p > hi) continue;
		const judged = await judge(id, p, [held]);
		const m = judged?.drawn[0], best = bestHeld.get(`${id} ${p}`);
		if (m && (!judged.own || betterCuts(m, judged.own)) && (!best || betterCuts(m, best.m))) bestHeld.set(`${id} ${p}`, { held, m });
	}

	// At each size judged, the three (or fewer) that make the site's choice beat the generator's most often.
	const recipes = [];
	let won = 0;
	for (const [key, list] of candidates) {
		const mine = rows.filter(r => r.key === key);
		if (!mine.length) continue;
		const judged = [...new Set(mine.map(r => r.p))].sort((a, b) => a - b), sets = new Map();
		for (const p of judged) {
			const here = mine.filter(r => r.p === p);
			const wins = set => here.filter(row => {
				const ms = set.map(c => row.drawn[c]).filter(Boolean);
				if (!ms.length) return false;
				const best = ms.reduce((a, b) => betterCuts(b, a) ? b : a);
				return !row.own || betterCuts(best, row.own);
			}).length;
			let best = { set: [], wins: 0 };
			for (let a = 0; a < list.length; a++) for (let b = a; b < list.length; b++) for (let c = b; c < list.length; c++) {
				const set = [...new Set([a, b, c])], n = wins(set);
				if (n > best.wins || (n === best.wins && n && set.length < best.set.length)) best = { set, wins: n };
			}
			sets.set(p, best.set);
			won += best.wins;
		}
		const steps = list.map(() => []);
		for (let p = Math.max(lo, judged[0] - Math.floor(every / 2)); p <= Math.min(hi, judged.at(-1) + Math.floor(every / 2)); p++) {
			const near = judged.reduce((a, b) => Math.abs(b - p) < Math.abs(a - p) ? b : a);
			for (const c of sets.get(near)) steps[c].push(p);
		}
		// A held recipe is also listed at the sizes it was solved for where it is its motif's best
		// there: on its own motif the site draws it first (`motifFit`), so that motif keeps its best
		// solve wherever the three chosen do worse.
		list.forEach((recipe, c) => {
			const { solved, ...rest } = recipe, id = solvedOn.get(recipe), own = (solved ?? []).filter(p => bestHeld.get(`${id} ${p}`)?.held === recipe);
			const all = [...new Set([...steps[c], ...own])].sort((a, b) => a - b);
			if (all.length) recipes.push({ ...rest, steps: all, ...own.length ? { solved: own } : {} });
		});
	}
	for (const held of ownOnly) {
		const { solved, ...rest } = held, id = solvedOn.get(held), own = solved.filter(p => bestHeld.get(`${id} ${p}`)?.held === held);
		if (own.length) recipes.push({ ...rest, steps: own, solved: own });
	}
	console.log(`${style}${on}: ${recipes.length} recipes kept; the site's choice beats the generator's own heart at ${won} of ${rows.length} motif sizes judged`);

	const dir = 'static/generator/recipes', shipped = path.join(dir, `${style}.json`), file = process.env.OUT ?? shipped;
	const old = JSON.parse(await fs.readFile(process.env.ADD ? shipped : file, 'utf8').catch(() => '{"version":1,"recipes":[]}'));
	const topologyKey = r => `${r.strips}|${r.outline}|${r.motif}`, had = new Set(old.recipes.map(topologyKey));
	const all = process.env.ADD ? [...old.recipes, ...recipes.filter(r => !had.has(topologyKey(r)))]
		: [...process.env.MERGE ? old.recipes.filter(r => r.strips !== strips) : [], ...recipes];
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, JSON.stringify({ version: 1, recipes: all }) + '\n');
	if (process.env.OUT) process.exit(0);
	const indexFile = path.join(dir, 'index.json'), index = JSON.parse(await fs.readFile(indexFile, 'utf8').catch(() => '{"files":[]}'));
	index.files = [...new Set([...index.files, ...all.length ? [style] : []])].sort();
	await fs.writeFile(indexFile, JSON.stringify(index) + '\n');
} finally {
	await server.close();
}
