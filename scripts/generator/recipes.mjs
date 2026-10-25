// Stored hidden cuts for a motif's pictures in one frame (see src/lib/generator/recipes.ts).
//
// The slider's size settings are grouped by the picture's outline (the corners of each of its
// rings); each group is covered by solves of the exact-outline search (static/inverse/core/exact)
// at its first size not yet covered, each solve kept at every size of the group where the
// generator's own path (`fromStoredRecipe`) cuts it cleanly and better than the generator's
// construction, judged in turn by the places the paper may tear (weak paper at the 80 mm print,
// where the paper check is there, src/lib/geometry/paperNecks.ts, and needles), sharp tips, turns
// along the hidden cuts and the cuts' length: the first that differs decides, and a tie keeps the
// generator's. The recipes go to static/generator/recipes/<motif>.<style>.json,
// replacing that board's, and the file is listed in index.json.
//
//   node scripts/generator/recipes.mjs <motif> <style> [strips] [from to]
//   REJUDGE=1 node scripts/generator/recipes.mjs <motif> <style> [strips]   # judge the file's recipes again
//   env: SYMMETRY=1    solve on the motif made exactly mirror-symmetric (each point averaged with its
//                      mirror image's), the heart's two halves tied: seconds rather than minutes; the
//                      recipes are checked on the motif itself
//        SOLVE_SECONDS  per solve (120), MAX_SOLVES per group (4)
//
// Run one at a time: each solve keeps a core busy for up to two minutes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;
const root = process.cwd();
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
console.warn = () => {};
const load = p => server.ssrLoadModule(p), core = p => import(`${root}/static/inverse/core/${p}`);
try {
	const { generate, fromStoredRecipe } = await load('/src/lib/generator/generate.ts');
	const { picture } = await load('/src/lib/generator/picture.ts');
	const { recipeOutline } = await load('/src/lib/generator/recipes.ts');
	const { cutTipCounts } = await load('/src/lib/generator/cutQuality.ts');
	const paper = await load('/src/lib/geometry/paperNecks.ts').catch(() => null), weak = design => paper ? paper.paperFaults(design).weak : 0;
	// Without the paper check weak paper counts as none, and recipes that win by their paper are lost.
	if (!paper && !process.env.NO_PAPER) throw new Error('The paper check (src/lib/geometry/paperNecks.ts) is missing: run in a tree that has it, or set NO_PAPER=1 to judge without it.');
	const { inferOverlapRect } = await load('/src/lib/utils/overlapRect.ts');
	const { rasterizeDesign } = await load('/src/lib/paint/rasterize.ts');
	// How far two hearts' woven pictures are apart, as a share of a 200 × 200 raster: a recipe may
	// not change what a size shows (the generator keeps some motifs whole past the touching circle,
	// or places them on their enclosing circle, which the plain picture does not).
	const apart = (a, b) => {
		const A = rasterizeDesign(a, 200).data, B = rasterizeDesign(b, 200).data;
		let d = 0;
		for (let i = 0; i < A.length; i++) d += A[i] !== B[i];
		return d / A.length;
	};
	// A heart's measures, in the order they decide: places its paper may tear (weak necks and
	// needles), sharp tips, turns over 25° along its hidden cuts (where the picture has one colour
	// on both sides), its cuts' length.
	const inside = (x, y, ring) => {
		let c = false;
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const [xi, yi] = ring[i], [xj, yj] = ring[j];
			if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
		}
		return c;
	};
	const measures = (design, rings) => {
		const rect = inferOverlapRect(design.fingers, design.gridSize), unit = p => [(p.x - rect.left) / rect.width * 100, (p.y - rect.top) / rect.height * 100];
		const colour = (x, y) => rings.reduce((v, r) => v ^ Number(inside(x, y, r)), 0);
		let length = 0, turns = 0;
		for (const finger of design.fingers) {
			if (!finger.id.includes('-cut-')) continue;
			const pts = [];
			for (const sg of finger.segments) for (let k = pts.length ? 1 : 0; k <= 8; k++) {
				const t = k / 8, u = 1 - t, at = c => u * u * u * sg.p0[c] + 3 * u * u * t * sg.p1[c] + 3 * u * t * t * sg.p2[c] + t * t * t * sg.p3[c];
				pts.push(unit({ x: at('x'), y: at('y') }));
			}
			let last = null, from = pts[0];
			for (let i = 1; i < pts.length; i++) {
				const p = pts[i], q = pts[i - 1], l = Math.hypot(p[0] - q[0], p[1] - q[1]);
				if (!l) continue;
				length += l;
				const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], n = [-(p[1] - q[1]) / l, (p[0] - q[0]) / l];
				const hidden = colour(m[0] + .15 * n[0], m[1] + .15 * n[1]) === colour(m[0] - .15 * n[0], m[1] - .15 * n[1]);
				if (Math.hypot(p[0] - from[0], p[1] - from[1]) < .5) continue;
				const direction = Math.atan2(p[1] - from[1], p[0] - from[0]);
				if (last !== null && hidden) {
					let a = Math.abs(direction - last);
					if (a > Math.PI) a = 2 * Math.PI - a;
					if (a > 25 * Math.PI / 180) turns++;
				}
				last = direction;
				from = p;
			}
		}
		const [needles, sharp] = cutTipCounts(design);
		return [weak(design) + needles, sharp, turns, Math.round(length)];
	};
	// Fewer places that may tear win outright; otherwise the first measure that differs decides, but a
	// sharp tip less buys no cuts much busier (a quarter more hidden turns, a twentieth more length).
	const better = (a, b) => {
		if (a[0] !== b[0]) return a[0] < b[0];
		const i = a.findIndex((x, k) => x !== b[k]);
		return i >= 0 && a[i] < b[i] && a[2] <= 1.25 * b[2] + 2 && a[3] <= 1.05 * b[3];
	};
	const { DEFAULT_COLORS, DEFAULT_COLORS_HEX } = await load('/src/lib/stores/colors.ts');
	const mal = await load('/src/lib/inverse/engine.ts');
	const { prepare, restorePrepared, scaleTarget } = await core('engine.js');
	const { settings } = await core('settings.js');
	const { exactTarget, exactSymmetry } = await core('exact/stage.js');
	const { exactOutline } = await core('exact/snap.js');
	const { exactStart } = await core('exact/start.js');
	const { exactFromTemplate } = await core('exact/search.js');

	const [motif, style, stripsArg, fromArg, toArg] = process.argv.slice(2);
	if (!motif || !style) throw new Error('Usage: node scripts/generator/recipes.mjs <motif> <style> [strips] [from to]');
	const strips = Number(stripsArg) || undefined, GAP = 3;
	const contours = JSON.parse(await fs.readFile(`static/generator/motifs/${motif}.json`, 'utf8')).contours;
	// The motif drawn mirror-symmetric about its upright axis, exactly: each point and the point
	// nearest its mirror image averaged, about the axis that moves them least.
	const symmetric = rings => {
		const pts = rings.flat(), xs = pts.map(p => p[0]), mid = (Math.min(...xs) + Math.max(...xs)) / 2, size = Math.max(...xs) - Math.min(...xs);
		const partner = (p, c) => pts.reduce((best, q) => { const d = Math.hypot(q[0] - (2 * c - p[0]), q[1] - p[1]); return d < best[1] ? [q, d] : best; }, [p, Infinity]);
		let axis = mid, least = Infinity;
		for (let k = -20; k <= 20; k++) {
			const c = mid + k * size / 1000, worst = Math.max(...pts.map(p => partner(p, c)[1]));
			if (worst < least) { least = worst; axis = c; }
		}
		return rings.map(ring => ring.map(p => { const [m] = partner(p, axis), x = axis + (p[0] - m[0]) / 2; return [Math.abs(x - axis) < 1e-9 ? axis : x, (p[1] + m[1]) / 2]; }));
	};
	const solvedOn = process.env.SYMMETRY ? symmetric(contours) : contours;
	const raw = mal.solveSettings({ colors: DEFAULT_COLORS, symmetry: { curve: 'off', lobe: 'off', lobes: process.env.SYMMETRY ? 'sym' : 'off' } });
	const cfg = settings(raw);
	const request = (setting, rings = contours) => ({ mode: 'figure', name: motif, contours: rings, style, frame: 'circle', frameSize: 70, scale: setting, gap: GAP, colors: DEFAULT_COLORS_HEX, ...strips ? { board: strips } : {} });
	// The engine's square (12 units, y up) in the picture's sheet (0..100, y down).
	const toSheet = ([x, y]) => [x / .12, (12 - y) / .12];

	/** The exact-outline search on a picture: its slits in the sheet, or why there are none. */
	async function solve(rings) {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path fill="#b91313" fill-rule="evenodd" d="${rings.map(r => 'M' + r.map(([x, y]) => `${(x * .12).toFixed(6)},${(y * .12).toFixed(6)}`).join('L') + 'Z').join('')}"/></svg>`;
		const target = scaleTarget(exactTarget(restorePrepared(prepare({ type: 'svg', text: svg }, { ...raw, resolution: 400 }).target)), cfg.width, cfg.paperColors);
		const exact = exactOutline(target, cfg), started = performance.now(), seconds = Number(process.env.SOLVE_SECONDS ?? 120);
		const start = await exactStart(exact, null, { deadline: performance.now() + Math.min(30, seconds / 4) * 1000 });
		const took = () => (performance.now() - started) / 1000;
		if (start.error) return { error: start.error, seconds: took() };
		const search = symmetry => exactFromTemplate(target, null, cfg, { seconds: seconds - took(), exact, witness: start.witness, symmetry, ...start.how !== 'template' ? { spacing: 1.5, neighbours: 4 } : {} });
		let found = await search(exactSymmetry(cfg.symmetry));
		// An outline a hair from symmetric (the circle through a corner of the board) is solved untied.
		if (found.error && /not symmetric enough/.test(found.error)) found = await search([]);
		if (found.error) return { error: found.error, seconds: took() };
		// The engine's clearance is stricter than the site's (it fails the generator's own clean
		// hearts on the 5×5 board at 72–95%): a solve it doubts is still drawn, and the
		// generator's own path judges it below.
		return { xy: { A: found.xy.A.map(l => l.map(toSheet)), B: found.xy.B.map(l => l.map(toSheet)) }, seconds: took() };
	}

	/** Solved slits as pieces on the picture's rings (see recipes.ts for the format). */
	function piecesOf(xy, o) {
		const ahead = (from, to, length) => ((to - from) % length + length) % length;
		const near = (p, only) => {
			let best = null;
			o.rings.forEach((ring, r) => {
				if (only !== undefined && r !== only) return;
				for (let i = 0; i < ring.length; i++) {
					const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
					const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0, d = Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
					if (!best || d < best.d) best = { r, s: o.arcs[r].cum[i] + t * Math.sqrt(l), d };
				}
			});
			return best;
		};
		const anchor = (p, only) => {
			// A corner of any ring there names the place.
			for (let r = 0; r < o.rings.length; r++) for (const [k, i] of o.corners[r].entries()) {
				const v = o.rings[r][i];
				if (Math.abs(v[0] - p[0]) < 1e-4 && Math.abs(v[1] - p[1]) < 1e-4) return { r, k, u: 0 };
			}
			const n = near(p, only), corners = o.corners[n.r], { cum, length } = o.arcs[n.r];
			let k = corners.length - 1;
			for (let i = 0; i < corners.length; i++) if (cum[corners[i]] <= n.s + 1e-9) k = i;
			const from = cum[corners[k]], to = cum[corners[(k + 1) % corners.length]], span = corners.length === 1 ? length : ahead(from, to, length);
			// A hair before the corner is at it, not a whole ring on.
			const on = ahead(from, n.s, length), u = span ? (on > length - 1e-7 ? 0 : on) / span : 0;
			if (u > 1 - 1e-6) return { r: n.r, k: (k + 1) % corners.length, u: 0 };
			return { r: n.r, k, u: u < 1e-6 ? 0 : +u.toFixed(9) };
		};
		const out = { A: [], B: [] };
		for (const family of ['A', 'B']) for (const line of xy[family]) {
			const pieces = [];
			for (let i = 0; i + 1 < line.length; i++) {
				const a = line[i], b = line[i + 1], n = near([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), last = pieces.at(-1);
				if (n.d < .05) {
					if (last?.kind === 'outline' && last.r === n.r) last.to = b;
					else pieces.push({ kind: 'outline', r: n.r, from: a, to: b, mid: n.s });
				} else if (last?.kind === 'hidden') last.points.push(b);
				else pieces.push({ kind: 'hidden', points: [a, b] });
			}
			out[family].push(pieces.map(piece => {
				if (piece.kind === 'outline') {
					const length = o.arcs[piece.r].length, s0 = near(piece.from, piece.r).s;
					return { v: piece.r, a: anchor(piece.from, piece.r), b: anchor(piece.to, piece.r), f: ahead(s0, piece.mid, length) < length / 2 };
				}
				const P = piece.points[0], Q = piece.points.at(-1), d = [Q[0] - P[0], Q[1] - P[1]], l2 = d[0] * d[0] + d[1] * d[1];
				return { h: [anchor(P), anchor(Q)], bends: piece.points.slice(1, -1).map(p => {
					const v = [p[0] - P[0], p[1] - P[1]];
					return [+((v[0] * d[0] + v[1] * d[1]) / l2).toFixed(9), +((-v[0] * d[1] + v[1] * d[0]) / l2).toFixed(9)];
				}) };
			}));
		}
		return out;
	}

	const from = Number(fromArg ?? 45), to = Number(toArg ?? 100), steps = [];
	// What the generator's own heart tells the picture at each size, as the page's preview takes it
	// (a motif kept whole past the touching circle, or on its enclosing circle): a recipe is solved
	// and drawn on that picture, so it shows what the generator's heart would.
	const knownOf = (own, asked) => Object.fromEntries(Object.entries({
		place: own.place, board: own.board ?? own.design.gridSize.x,
		circle: own.scale !== undefined ? (own.scale < asked ? own.scale : 'large') : undefined,
		enclosed: asked > .85 ? !!own.enclosed : undefined, whole: asked > .7 ? !!own.whole : undefined
	}).filter(([, v]) => v !== undefined));
	for (let p = from; p <= to; p++) {
		let own = null;
		try { own = generate(request(p / 100)); } catch { own = null; }
		const known = own ? knownOf(own, p / 100) : {}, rings = picture(request(p / 100, solvedOn), known).rings, o = recipeOutline(rings);
		steps.push({ p, rings, o, known, own, sig: o.corners.map(c => c.length).join('.') + JSON.stringify(known) });
	}
	// Whether a recipe draws the size better than the generator's own heart, on the same picture.
	const keeps = (recipe, step) => {
		const made = fromStoredRecipe(request(step.p / 100), [{ ...recipe, steps: [step.p] }]);
		if (!made) return false;
		if (!step.own) return true;
		if (apart(made.design, step.own.design) > .005) return false;
		const rings = picture(request(step.p / 100), recipe.known).rings;
		return Boolean(step.own.hardToCut) || better(measures(made.design, rings), measures(step.own.design, rings));
	};
	const dir = 'static/generator/recipes', name = `${motif}.${style}`, file = path.join(dir, `${name}.json`);
	const old = JSON.parse(await fs.readFile(file, 'utf8').catch(() => '{"version":1,"recipes":[]}'));
	const recipes = [];
	if (process.env.REJUDGE) {
		// The file's recipes for this board judged again at their sizes, by the rules as they are now.
		const at = new Map(steps.map(step => [step.p, step]));
		for (const recipe of old.recipes.filter(r => r.style === style && r.strips === strips)) {
			const held = recipe.steps.filter(p => !at.has(p) || keeps(recipe, at.get(p)));
			console.log(`  recipe of ${recipe.steps.join(',')}: kept at ${held.join(',') || 'none'}`);
			if (held.length) recipes.push({ ...recipe, steps: held });
		}
	} else {
		const groups = [];
		for (const step of steps) {
			const group = groups.find(g => g.sig === step.sig && g.steps.at(-1).p === step.p - 1);
			if (group) group.steps.push(step); else groups.push({ sig: step.sig, steps: [step] });
		}
		console.log(`${motif} ${style}${strips ? ` ${strips}` : ''}: ${groups.length} outlines over ${from}-${to}%`);
		const covered = new Set(), maxSolves = Number(process.env.MAX_SOLVES ?? 4);
		for (const group of groups) {
			const tried = new Set();
			for (let k = 0; k < maxSolves; k++) {
				const next = group.steps.find(s => !covered.has(s.p) && !tried.has(s.p));
				if (!next) break;
				tried.add(next.p);
				// The engine refuses some outlines outright (an edge with one face on both sides).
				const solved = await solve(next.rings).catch(error => ({ error: error.message, seconds: 0 }));
				if (!solved.xy) { console.log(`  ${next.p}%: no template (${solved.error}, ${solved.seconds.toFixed(0)} s)`); continue; }
				const recipe = { style, ...strips ? { strips } : {}, steps: [], gap: GAP, ...Object.keys(next.known).length ? { known: next.known } : {},
					sig: next.o.corners.map(c => c.length), ...piecesOf(solved.xy, next.o) };
				for (const step of group.steps) if (!covered.has(step.p) && keeps(recipe, step)) {
					recipe.steps.push(step.p);
					covered.add(step.p);
				}
				if (recipe.steps.length) recipes.push(recipe);
				console.log(`  ${next.p}%: solved in ${solved.seconds.toFixed(0)} s, kept at ${recipe.steps.length ? recipe.steps.join(',') : 'none'}`);
			}
		}
	}
	console.log(`${motif} ${style}${strips ? ` ${strips}` : ''}: ${recipes.length} recipes cover ${recipes.reduce((n, r) => n + r.steps.length, 0)} of ${steps.length} sizes`);

	// Into the motif's file for the frame, replacing this board's (or frame's) recipes in the range.
	await fs.mkdir(dir, { recursive: true });
	const kept = old.recipes.filter(r => r.style !== style || r.strips !== strips || (!process.env.REJUDGE && r.steps.every(s => s < from || s > to)));
	const all = [...kept, ...recipes];
	await fs.writeFile(file, JSON.stringify({ version: 1, recipes: all }) + '\n');
	const indexFile = path.join(dir, 'index.json'), index = JSON.parse(await fs.readFile(indexFile, 'utf8').catch(() => '{"files":[]}'));
	index.files = [...new Set([...index.files.filter(f => f !== name), ...all.length ? [name] : []])].sort();
	await fs.writeFile(indexFile, JSON.stringify(index) + '\n');
} finally {
	await server.close();
}
