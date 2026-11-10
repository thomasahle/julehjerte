// Whether a change to the generator leaves its hearts as they were. A few dozen figures in each frame
// (identity.json: the nine offered and the three retired, motifs that take under a second), made as the
// page makes them, with the frame's stored recipes and the motif's: a row for each with a hash of its
// cuts and of its picture and whether it is hard to cut, or its refusal. A row also says how the heart
// was made (`via`) and how long it took; the comparison reads neither.
//
//   node scripts/generator/identity.mjs run <dir> [frame...]      rows into <dir>/<frame>.jsonl, going on from those there
//   node scripts/generator/identity.mjs compare <dir> <baseline>  each heart against the baseline's; exits 1 where one differs
//   env: SIZES=50,70   the sizes in percent (else 70, and the first six of each frame at 50 and 100 too)
//        FIRST=n       only the first n motifs of each frame
//
// The hearts are those of the checkout it is run from, which need not be the script's own: a commit from
// before the script is measured from its worktree (cd ../before && node ../after/scripts/generator/identity.mjs run ...).
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [command, dir, ...rest] = process.argv.slice(2);
const frames = JSON.parse(await fs.readFile(fileURLToPath(new URL('./identity.json', import.meta.url)), 'utf8'));
const rows = async file => (await fs.readFile(file, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(line => JSON.parse(line));
const sha = (data, length) => crypto.createHash('sha1').update(data).digest('hex').slice(0, length);

if (command === 'run' && dir) {
	const { createServer } = await import('vite');
	const root = process.cwd();
	const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
	console.warn = () => {};
	try {
		const { generate } = await server.ssrLoadModule('/src/lib/generator/generate.ts');
		const { rasterizeDesign } = await server.ssrLoadModule('/src/lib/paint/rasterize.ts');
		const stored = 'static/generator/recipes', index = JSON.parse(await fs.readFile(`${stored}/index.json`, 'utf8'));
		const recipeFile = async name => index.files.includes(name) ? JSON.parse(await fs.readFile(`${stored}/${name}.json`, 'utf8')) : undefined;
		const sizes = process.env.SIZES?.split(',').map(Number), first = Number(process.env.FIRST ?? Infinity);
		await fs.mkdir(dir, { recursive: true });
		for (const style of rest.length ? rest : Object.keys(frames)) {
			if (!frames[style]) throw new Error(`No frame ${style}: ${Object.keys(frames).join(' ')}`);
			const out = path.join(dir, `${style}.jsonl`), done = new Set((await rows(out)).map(row => `${row.id} ${row.p}`));
			const ofFrame = await recipeFile(style);
			for (const [k, id] of frames[style].slice(0, first).entries()) {
				const { contours } = JSON.parse(await fs.readFile(`static/generator/motifs/${id}.json`, 'utf8'));
				const recipes = [...ofFrame?.recipes ?? [], ...(await recipeFile(`${id}.${style}`))?.recipes ?? []];
				// As the page: on Cirkel · Lige store tern a motif is kept whole below the size its file gives it.
				const dividedFrom = ofFrame?.whole?.[id]?.[5];
				for (const p of sizes ?? (k < 6 ? [70, 50, 100] : [70])) {
					if (done.has(`${id} ${p}`)) continue;
					const request = { mode: 'figure', name: id, contours, style, frame: 'circle', frameSize: 70, scale: p / 100, gap: 3,
						colors: { left: '#ffffff', right: '#b91313' }, ...recipes.length ? { recipes } : {}, ...style === 'board' && p > 70 && p < dividedFrom ? { keepWhole: true } : {} };
					const from = performance.now();
					let row;
					try {
						const heart = generate(request);
						row = { id, p, cut: sha(JSON.stringify(heart.design.fingers), 10), px: sha(rasterizeDesign(heart.design, 160).data, 12), hard: !!heart.hardToCut,
							ms: Math.round(performance.now() - from), ...heart.via ? { via: heart.via } : {} };
					} catch (error) {
						row = { id, p, refused: String(error?.message).slice(0, 80), ms: Math.round(performance.now() - from) };
					}
					await fs.appendFile(out, JSON.stringify(row) + '\n');
				}
			}
		}
	} finally {
		await server.close();
	}
} else if (command === 'compare' && dir && rest.length === 1) {
	// A directory's rows by frame, motif and size: the frame is its file's name up to the first dot.
	const read = async from => new Map((await Promise.all((await fs.readdir(from)).filter(name => name.endsWith('.jsonl')).map(async name =>
		(await rows(path.join(from, name))).map(row => [`${name.split('.')[0]} ${row.id} ${row.p}`, row])))).flat());
	const made = await read(dir), baseline = await read(rest[0]);
	const shown = row => row.refused !== undefined ? `refused: ${row.refused}` : `${row.cut}${row.hard ? ' hard' : ''} ${row.px}`;
	let differing = 0, same = 0;
	for (const style of Object.keys(frames)) {
		const mine = [...made].filter(([key]) => key.startsWith(`${style} `)), theirs = [...baseline].filter(([key]) => key.startsWith(`${style} `));
		if (!mine.length && !theirs.length) continue;
		const both = mine.filter(([key]) => baseline.has(key)), different = both.filter(([key, row]) => shown(row) !== shown(baseline.get(key)));
		const ms = list => list.reduce((sum, [, row]) => sum + row.ms, 0);
		console.log(`${style.padEnd(11)} same ${String(both.length - different.length).padStart(3)} of ${String(both.length).padStart(3)}` +
			`   ${ms(both)} ms (baseline ${ms(both.map(([key]) => [key, baseline.get(key)]))})` +
			(mine.length > both.length ? `   ${mine.length - both.length} not in the baseline` : '') +
			(theirs.length > both.length ? `   ${theirs.length - both.length} of the baseline's not made` : ''));
		for (const [key, row] of different) console.log(`  DIFFERENT ${key}: ${shown(baseline.get(key))} -> ${shown(row)}`);
		differing += different.length;
		same += both.length - different.length;
	}
	console.log(differing ? `${differing} different, ${same} the same` : same ? `all ${same} the same` : 'nothing to compare');
	if (differing || !same) process.exitCode = 1;
} else {
	console.error('usage: node scripts/generator/identity.mjs run <dir> [frame...] | compare <dir> <baseline>');
	process.exitCode = 2;
}
