// Stored hidden cuts for a motif's pictures in one frame (see src/lib/generator/recipes.ts).
//
// The slider's size settings are grouped by the picture's outline (the corners of each of its
// rings); each group is covered by solves of the exact-outline search (static/inverse/core/exact)
// at its first size not yet covered, each solve kept at every size of the group where the
// generator's own path (`fromStoredRecipe`) cuts it cleanly and better than the generator's
// construction, judged as the page compares hearts (`cutMeasures`, `betterCuts`): the places the
// paper may tear (weak paper at the 80 mm print, src/lib/geometry/paperNecks.ts, and needles), one
// template for both lobes over two, sharp tips, turns along the hidden cuts and the cuts' length,
// and a tie keeps the generator's. The recipes are solves for the frame's topologies'
// (scripts/generator/topology.mjs chooses those, and the page draws them on every motif of a
// topology): they go to scripts/generator/solves/<motif>.<style>.json, replacing that board's (or
// frame's). No motif's own recipes are shipped.
//
//   node scripts/generator/recipes.mjs <motif> <style> [strips] [from to]
//   REJUDGE=1 node scripts/generator/recipes.mjs <motif> <style> [strips]   # judge the file's recipes again
//   env: SYMMETRY=1    solve on the motif made exactly mirror-symmetric (each point averaged with its
//                      mirror image's), the heart's two halves tied: seconds rather than minutes; the
//                      recipes are checked on the motif itself
//        TEMPLATE=1     start each solve from the generator's own heart at that size (its cuts read as the
//                      search's template): seconds where a search from nothing runs out of time
//                      (the rays and checks)
//        VERBOSE=1      print each size's measures beside the generator's, and why one is not kept
//        SOLVE_SECONDS  per solve (120), MAX_SOLVES per group (4)
//        KEEP_ALL=1     keep a solve at every size it draws cleanly, beating the generator's or not (a
//                       pair's candidate, judged on every motif of its pair by pairs.mjs)
//        OUT_FILE=path  write there (only this run's recipes and the file's others) rather than the motif's file
//        OWN=1          no search: the generator's own heart at the size as the solve (a pair's candidate where
//                       the search finds none), OWN_TOL its hidden cuts' straightening (.01; .03 where that
//                       fails the editor's checks)
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
	// A heart's measures and how they decide, as the page compares hearts (see cutQuality.ts).
	const { cutMeasures: measures, betterCuts: better } = await load('/src/lib/generator/cutQuality.ts');
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
	const { DEFAULT_COLORS, DEFAULT_COLORS_HEX } = await load('/src/lib/stores/colors.ts');
	const mal = await load('/src/lib/inverse/engine.ts');
	const { prepare, restorePrepared, scaleTarget } = await core('engine.js');
	const { settings } = await core('settings.js');
	const { exactSymmetry } = await core('exact/stage.js');
	const { exactOutline } = await core('exact/snap.js');
	const { exactStart } = await core('exact/start.js');
	const { exactFromTemplate } = await core('exact/search.js');
	const { Cubic } = await core('bezier.js');

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

	// Whether a point of the picture's sheet lies inside a ring (even–odd).
	const inside = (x, y, ring) => {
		let c = false;
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const [xi, yi] = ring[i], [xj, yj] = ring[j];
			if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
		}
		return c;
	};
	/** The generator's heart as the search's template: its cuts in short straight pieces in the
	 * engine's square (its design's square, which depends on its board, as 0..width), each hidden
	 * where the picture has one colour on both sides. */
	const templateOf = (design, rings, width) => {
		const rect = inferOverlapRect(design.fingers, design.gridSize), unit = ([x, y]) => [(x - rect.left) / rect.width * 100, (y - rect.top) / rect.height * 100];
		const colour = (x, y) => rings.reduce((v, r) => v ^ Number(inside(x, y, r)), 0);
		const edges = [], paths = [[], []];
		for (const finger of design.fingers) {
			if (!finger.id.includes('-cut-')) continue;
			const pts = [];
			for (const sg of finger.segments) for (let k = pts.length ? 1 : 0; k <= 8; k++) {
				const t = k / 8, u = 1 - t, at = c => u * u * u * sg.p0[c] + 3 * u * u * t * sg.p1[c] + 3 * u * t * t * sg.p2[c] + t * t * t * sg.p3[c];
				pts.push(unit([at('x'), at('y')]));
			}
			const slit = [];
			for (let i = 1; i < pts.length; i++) {
				const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
				if (l < 1e-6) continue;
				const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], n = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
				edges.push({ curve: Cubic.line(...[a, b].map(p => p.map(v => v / 100 * width))), visible: colour(m[0] + .15 * n[0], m[1] + .15 * n[1]) !== colour(m[0] - .15 * n[0], m[1] - .15 * n[1]) });
				slit.push([edges.length - 1, true]);
			}
			paths[finger.lobe === 'right' ? 0 : 1].push(slit);
		}
		return { graph: { target: { width }, edges }, paths };
	};

	/** The exact-outline search on a picture, from the generator's heart `own` where TEMPLATE is
	 * set: its slits in the sheet, or why there are none. */
	async function solve(rings, own) {
		// OWN=1: no search, the generator's own heart's cuts as the solve (a pair's candidate from it): its
		// right lobe's cuts the A family, as the engine's.
		if (process.env.OWN) {
			if (!own) return { error: 'no heart of the generator', seconds: 0 };
			const rect = inferOverlapRect(own.fingers, own.gridSize), unit = ([x, y]) => [(x - rect.left) / rect.width * 100, (y - rect.top) / rect.height * 100];
			const lines = [[], []];
			for (const finger of own.fingers) {
				if (!finger.id.includes('-cut-')) continue;
				const pts = [];
				for (const sg of finger.segments) for (let k = pts.length ? 1 : 0; k <= 16; k++) {
					const t = k / 16, u = 1 - t, at = c => u * u * u * sg.p0[c] + 3 * u * u * t * sg.p1[c] + 3 * u * t * t * sg.p2[c] + t * t * t * sg.p3[c];
					pts.push(unit([at('x'), at('y')]));
				}
				lines[finger.lobe === 'right' ? 0 : 1].push(pts);
			}
			// A point of the heart's within .04 of a ring is put on it, and between two such points on
			// one ring the line follows the ring's own points: the heart's cut along an outline is a smooth
			// curve a hair off the rings' polygons, which piecesOf would read as outline and hidden by turns.
			const crossings = [];
			const segs = rings.flatMap((r, i) => r.map((a, k) => [a, r[(k + 1) % r.length], i]));
			for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
				const [a, b, ri] = segs[i], [c, d, rj] = segs[j];
				if (ri === rj) continue;
				const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
				if (Math.abs(den) < 1e-12) continue;
				const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den, u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
				if (t >= 0 && t <= 1 && u >= 0 && u <= 1) crossings.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
			}
			// A ring's point or two rings' crossing within .05 is where the heart's cut turns (its
			// curve a hair off the polygon's): before the nearest side.
			const ringSnap = .04, vertexSnap = .05;
			const onRing = p => {
				let best = null, vertex = null;
				rings.forEach((ring, r) => { for (let i = 0; i < ring.length; i++) {
					const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
					const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0, q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
					if (!best || d < best.d) best = { r, i, q, d };
					const dv = Math.hypot(a[0] - p[0], a[1] - p[1]);
					if (dv < vertexSnap && (!vertex || dv < vertex.d)) vertex = { r, i, q: a, d: dv };
				} });
				const crossing = crossings.find(c => Math.hypot(c[0] - p[0], c[1] - p[1]) < vertexSnap);
				if (crossing && (!vertex || Math.hypot(crossing[0] - p[0], crossing[1] - p[1]) < vertex.d)) return { ...best, q: crossing };
				return vertex ?? (best && best.d < ringSnap ? best : null);
			};
			for (const family of lines) for (let l = 0; l < family.length; l++) {
				const out = [];
				let prev = null;
				for (const p of family[l]) {
					const at = onRing(p);
					if (at && prev && prev.r === at.r) {
						const ring = rings[at.r], n = ring.length, fwd = ((at.i - prev.i) % n + n) % n, back = ((prev.i - at.i) % n + n) % n;
						const between = fwd <= back ? Array.from({ length: fwd }, (_, k) => ring[(prev.i + k + 1) % n]) : Array.from({ length: back }, (_, k) => ring[(prev.i - k + n) % n]);
						const path = [prev.q, ...between, at.q], arc = path.slice(1).reduce((s, q, k) => s + Math.hypot(q[0] - path[k][0], q[1] - path[k][1]), 0);
						if (arc <= 3 * Math.hypot(at.q[0] - prev.q[0], at.q[1] - prev.q[1]) + .3) out.push(...between);
					}
					out.push(at ? at.q : p);
					prev = at;
				}
				family[l] = out;
			}
			// Where two rings cross, a point of the heart's a hair off both is put on the crossing (piecesOf
			// names a crossing at a vertex of neither only within 1e-5 of both), and repeated points go.
			const snap = .02;
			for (const family of lines) for (let l = 0; l < family.length; l++) {
				const out = [];
				for (const p of family[l]) {
					const c = crossings.find(c => Math.hypot(c[0] - p[0], c[1] - p[1]) < snap), q = c ?? p, last = out.at(-1);
					if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 1e-6) out.push(q);
				}
				// The rings' points a segment passes (a corner of the squares the cut runs along) are its own.
				const vertices = [...rings.flat(), ...crossings], full = [out[0]];
				for (let i = 1; i < out.length; i++) {
					const a = out[i - 1], b = out[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
					const on = vertices.map(v => ({ v, t: ((v[0] - a[0]) * dx + (v[1] - a[1]) * dy) / l2 }))
						.filter(({ v, t }) => t > 1e-6 && t < 1 - 1e-6 && Math.hypot(a[0] + t * dx - v[0], a[1] + t * dy - v[1]) < 1e-4).sort((x, y) => x.t - y.t);
					for (const { v } of on) if (Math.hypot(v[0] - full.at(-1)[0], v[1] - full.at(-1)[1]) > 1e-6) full.push(v);
					full.push(b);
				}
				family[l] = full;
			}
			return { xy: { A: lines[0], B: lines[1] }, seconds: 0 };
		}
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path fill="#b91313" fill-rule="evenodd" d="${rings.map(r => 'M' + r.map(([x, y]) => `${(x * .12).toFixed(6)},${(y * .12).toFixed(6)}`).join('L') + 'Z').join('')}"/></svg>`;
		// The picture's own vector outline: the engine's exactTarget traces one from the pixels (Mal
		// reads pictures), a pixel off the rings the recipe is drawn on.
		const target = scaleTarget(restorePrepared(prepare({ type: 'svg', text: svg }, { ...raw, resolution: 400 }).target), cfg.width, cfg.paperColors);
		const exact = exactOutline(target, cfg), started = performance.now(), seconds = Number(process.env.SOLVE_SECONDS ?? 120);
		const template = process.env.TEMPLATE && own ? templateOf(own, rings, cfg.width) : null;
		const start = await exactStart(exact, template, { deadline: performance.now() + Math.min(30, seconds / 4) * 1000 });
		const took = () => (performance.now() - started) / 1000;
		if (start.error) return { error: start.error, seconds: took() };
		const search = symmetry => exactFromTemplate(target, template, cfg, { seconds: seconds - took(), exact, witness: start.witness, symmetry, ...start.how !== 'template' ? { spacing: 1.5, neighbours: 4 } : {} });
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
		// The picture's colour at a point (see `edgeOfColour`): two rings' common side cancels
		// (even–odd), and a cut along it is hidden though it lies on both rings.
		const colourAt = (x, y) => o.rings.reduce((v, ring) => {
			let c = false;
			for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
				const [xi, yi] = ring[i], [xj, yj] = ring[j];
				if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
			}
			return v ^ Number(c);
		}, 0);
		// Whether the colour changes across a piece, looked at nearer and nearer it: a thin tooth (the
		// horse's at 80% in the rays, 0.004 wide where the first look reaches past it to the outside on
		// both sides) is seen at the second, while a side two rings share, cancelled, changes at none.
		const edgeOfColour = (a, b) => {
			const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
			for (let e = Math.min(.05, l / 4); e > 1e-5; e /= 4) {
				const n = [-(b[1] - a[1]) / l * e, (b[0] - a[0]) / l * e];
				if (colourAt(m[0] + n[0], m[1] + n[1]) !== colourAt(m[0] - n[0], m[1] - n[1])) return true;
			}
			return false;
		};
		const anchor = (p, only, plain = false) => {
			// The nearest corner of any ring within the engine's merge (0.002 of its 12 units, 0.017 here)
			// names the place: two corners closer than that are one point to the search (a hairline side).
			let best = null;
			for (let r = 0; r < o.rings.length; r++) for (const [k, i] of o.corners[r].entries()) {
				const v = o.rings[r][i], d = Math.hypot(v[0] - p[0], v[1] - p[1]);
				if (d < .017 && (!best || d < best.d)) best = { r, k, d };
			}
			if (best) return { r: best.r, k: best.k, u: 0 };
			// Two rings crossing at a vertex of neither: one place for every stretch there, on the first
			// ring, the other as `x` (see recipes.ts).
			if (!plain) {
				const on = o.rings.map((_, r) => near(p, r)).filter(n => n.d < 1e-5);
				if (on.length > 1) return { ...anchor(p, on[0].r, true), x: on[1].r };
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
				if (n.d < .05 && edgeOfColour(a, b)) {
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
	const unshown = new Set();
	for (let p = from; p <= to; p++) {
		let own = null;
		try { own = generate(request(p / 100)); } catch { own = null; }
		const known = own ? knownOf(own, p / 100) : {}, shown = picture(request(p / 100, solvedOn), known);
		// None where the frame has no picture for the generator's heart (the rays on a finer board).
		if (!shown) { unshown.add(p); continue; }
		const rings = shown.rings, o = recipeOutline(rings);
		steps.push({ p, rings, o, known, own, sig: o.corners.map(c => c.length).join('.') + JSON.stringify(known) });
	}
	// Whether a recipe draws the size better than the generator's own heart, on the same picture.
	const keeps = (recipe, step) => {
		const say = (kept, why) => { if (process.env.VERBOSE) console.log(`    ${step.p}%: ${why}`); return kept; };
		const made = fromStoredRecipe(request(step.p / 100), [{ ...recipe, steps: [step.p] }]);
		if (!made) return say(false, 'not drawn, or not clean');
		if (!step.own) return say(true, 'over a refused heart');
		const off = apart(made.design, step.own.design);
		if (off > .005) return say(false, `another picture than the generator's (${(off * 100).toFixed(1)}% apart)`);
		if (process.env.KEEP_ALL) return say(true, 'kept, drawn cleanly');
		const rings = picture(request(step.p / 100), recipe.known).rings, mine = measures(made.design, rings), its = measures(step.own.design, rings);
		if (step.own.hardToCut) return say(true, `${JSON.stringify(mine)} over a hard heart`);
		return better(mine, its) ? say(true, `${JSON.stringify(mine)} over ${JSON.stringify(its)}`) : say(false, `${JSON.stringify(mine)} not better than ${JSON.stringify(its)}`);
	};
	const dir = 'scripts/generator/solves', file = process.env.OUT_FILE ?? path.join(dir, `${motif}.${style}.json`);
	const old = JSON.parse(await fs.readFile(file, 'utf8').catch(() => '{"version":1,"recipes":[]}'));
	const recipes = [];
	if (process.env.REJUDGE) {
		// The file's recipes for this board judged again at their sizes, by the rules as they are now.
		const at = new Map(steps.map(step => [step.p, step]));
		for (const recipe of old.recipes.filter(r => r.style === style && r.strips === strips)) {
			const held = recipe.steps.filter(p => at.has(p) ? keeps(recipe, at.get(p)) : !unshown.has(p));
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
				const solved = await solve(next.rings, next.own?.design).catch(error => ({ error: error.message, seconds: 0 }));
				if (!solved.xy) { console.log(`  ${next.p}%: no template (${solved.error}, ${solved.seconds.toFixed(0)} s)`); continue; }
				const recipe = { style, ...strips ? { strips } : {}, steps: [], gap: GAP, ...Object.keys(next.known).length ? { known: next.known } : {},
					sig: next.o.corners.map(c => c.length), ...piecesOf(solved.xy, next.o) };
				// OWN: a hidden piece's sampled bends kept only where they turn it (Douglas–Peucker, in its own
				// frame: the piece from 0,0 to 1,0).
				if (process.env.OWN) {
					const tol = Number(process.env.OWN_TOL ?? .01);
					const dp = pts => {
						if (pts.length < 3) return pts;
						const [a, b] = [pts[0], pts.at(-1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
						let far = 0, at = 0;
						for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / l; if (d > far) { far = d; at = i; } }
						return far < tol ? [a, b] : [...dp(pts.slice(0, at + 1)).slice(0, -1), ...dp(pts.slice(at))];
					};
					for (const family of [recipe.A, recipe.B]) for (const line of family) for (const piece of line) if (piece.bends) piece.bends = dp([[0, 0], ...piece.bends, [1, 0]]).slice(1, -1);
				}
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
} finally {
	await server.close();
}
