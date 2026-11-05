// On a board circle past the touching circle, the size from which each featured motif is divided, kept
// whole below it (`keepWhole`: the grid's colours flipped behind the circle), on each board: one switch
// along the slider. At each size from 71% the motif is drawn both ways with the stored recipes, and may be
// kept whole where the divided heart is neither firmer (`firmerCuts`, the refiner's measure) nor better by
// the page's (`betterCuts`), or where the divided heart is hard to cut and the whole one is not. From the
// first size where it may not, it is divided; and the switch is brought down to just after a size where
// both ways show the motif as large, so the slider does not jump there (kept whole, past about 80% the
// motif waits where its completions end, then catches up), or where the step it makes is no larger than
// one it makes kept whole below it; else to none: kept whole to 100%, where it never shrinks, as
// the motifs the page keeps whole anyway grow (they wait, then catch up). Those, and the motifs it never
// can keep whole, are left out. Written into the page's board recipes as `whole` (see `RecipeFile`).
//
//   node scripts/generator/whole.mjs [motif...]   (else every featured motif)
//   env: BOARDS=5,7,3,9   ROWS=file  both ways' hearts at each size, kept to go on from (tmp/generator/whole.jsonl)
//        OUT=file         write there (else static/generator/recipes/board.json)
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const root = process.cwd();
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
console.warn = () => {};
const load = p => server.ssrLoadModule(p);
try {
	const { generate, spurless, knownOf, firmerCuts } = await load('/src/lib/generator/generate.ts');
	const { picture } = await load('/src/lib/generator/picture.ts');
	const { cutMeasures, betterCuts } = await load('/src/lib/generator/cutQuality.ts');
	const { holdingWidth, thinnestNeck } = await load('/src/lib/geometry/paperNecks.ts');
	const { MOTIF_GROUPS } = await load('/src/lib/generator/catalog.ts');
	const shipped = 'static/generator/recipes/board.json', file = JSON.parse(await fs.readFile(shipped, 'utf8'));
	const boards = (process.env.BOARDS ?? '5,7,3,9').split(',').map(Number);
	const ids = process.argv.length > 2 ? process.argv.slice(2) : Object.values(MOTIF_GROUPS).flat();
	const rowsFile = process.env.ROWS ?? 'tmp/generator/whole.jsonl';
	await fs.mkdir(path.dirname(rowsFile), { recursive: true });
	const rows = new Map((await fs.readFile(rowsFile, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(l => JSON.parse(l)).map(r => [`${r.id} ${r.strips} ${r.p}`, r]));

	// Whether the motif may be kept whole at a size: the divided heart neither firmer nor better.
	const allowed = r => !r.refused && r.whole.whole && (!r.whole.hard === !r.divided.hard ? r.firmer !== 'divided' && !betterCuts(r.divided.m, r.whole.m) : !r.whole.hard);
	const both = (id, contours, board, p) => {
		const request = { mode: 'figure', name: id, contours, style: 'board', frame: 'circle', frameSize: 70, scale: p / 100, gap: 3, colors: { left: '#ffffff', right: '#b91313' }, board, recipes: file.recipes };
		const way = keepWhole => {
			const t = performance.now(), heart = generate({ ...request, keepWhole }), ms = Math.round(performance.now() - t);
			const shown = picture(spurless(request), knownOf(heart, p / 100)), ink = shown.rings.slice(shown.motif).flat();
			const span = Math.max(...[0, 1].map(k => Math.max(...ink.map(q => q[k])) - Math.min(...ink.map(q => q[k]))));
			const m = cutMeasures(heart.design, shown.rings);
			return { heart, m, row: { whole: !!heart.whole, m, hard: !!heart.hardToCut, neck: +thinnestNeck(heart.design).toFixed(2), ...m[0] && { holds: holdingWidth(heart.design) }, span: +span.toFixed(1), ms } };
		};
		// A motif the page keeps whole anyway is drawn the same asked to be.
		const d = way(false), w = d.row.whole ? d : way(true);
		const firmer = !w.row.whole ? 'divided' : !w.row.hard !== !d.row.hard ? (w.row.hard ? 'divided' : 'whole')
			: firmerCuts(w.heart.design, w.m, d.heart.design, d.m) ? 'whole' : firmerCuts(d.heart.design, d.m, w.heart.design, w.m) ? 'divided' : 'tie';
		return { id, strips: board, p, firmer, whole: w.row, divided: d.row };
	};

	const whole = { ...file.whole };
	for (const board of boards) for (const id of ids) {
		const contours = JSON.parse(await fs.readFile(`static/generator/motifs/${id}.json`, 'utf8')).contours;
		// Every size up to the first where the motif may not be kept whole (the sizes past it are divided).
		for (let p = 71; p <= 100; p++) {
			const key = `${id} ${board} ${p}`;
			if (!rows.has(key)) {
				let row;
				try { row = both(id, contours, board, p); } catch (e) { row = { id, strips: board, p, refused: e.message.slice(0, 80) }; }
				rows.set(key, row);
				await fs.appendFile(rowsFile, JSON.stringify(row) + '\n');
			}
			if (!allowed(rows.get(key))) break;
		}
		const at = [...rows.values()].filter(r => r.id === id && r.strips === board && !r.refused).sort((a, b) => a.p - b.p);
		const on = whole[id] = { ...whole[id] };
		delete on[board];
		const n = at.length;
		let first = at.findIndex(r => !allowed(r));
		if (first < 0) first = n;
		const why = !n || !at[0].whole.whole ? 'never kept whole' : at.every(r => r.divided.whole) ? 'kept whole anyway' : '';
		if (!why) {
			// Where the switch may be: the motif never shrinks, and at the size before it both ways show it as
			// large, or the step it makes there is no larger than one it makes kept whole below it.
			const span = (i, t) => (i < t ? at[i].whole : at[i].divided).span;
			const smooth = t => at.every((r, i) => !i || span(i, t) >= span(i - 1, t) - .1)
				&& (t === n || !t || Math.abs(at[t - 1].whole.span - at[t - 1].divided.span) <= .1
					|| span(t, t) - span(t - 1, t) <= Math.max(...at.slice(1, t).map((r, i) => r.whole.span - at[i].whole.span)));
			let t = first;
			while (t > 0 && !smooth(t)) t--;
			if (t) on[board] = t < n ? at[t].p : 101;
			console.log(`${id} ${board}: ${t ? `divided from ${on[board]}` : 'divided throughout'}${first < n ? ` (may not be kept whole at ${at[first].p})` : ''}`);
		} else console.log(`${id} ${board}: ${why}`);
		if (!Object.keys(on).length) delete whole[id];
	}
	const out = process.env.OUT ?? shipped;
	await fs.writeFile(out, JSON.stringify({ version: 1, recipes: file.recipes, ...Object.keys(whole).length && { whole } }));
	console.log(`wrote ${out}`);
} finally {
	await server.close();
}
