// The next solve round's queue: one line "strips id p rows" for each pair no recipe beats the
// generator's heart in (pairs.mjs UNSOLVED=file), at a motif not yet tried in that pair (else its size
// farthest from those tried), its middle size; pairs with the most motif sizes first. Tried = the solve
// files of earlier rounds (<id>.board-<strips>.pair<p>.json, empty ones too) in the directories given.
//
//   node scripts/generator/pair-queue.mjs unsolved.json solves-1 solves-2 > queue.txt
import fs from 'node:fs';
const [unsolvedFile, ...dirs] = process.argv.slice(2);
const tried = new Set(dirs.flatMap(d => fs.readdirSync(d)).map(f => f.match(/^(.+)\.board-(\d+)\.pair(\d+)\.json$/)).filter(Boolean).map(m => `${m[2]} ${m[1]} ${m[3]}`));
const lines = [];
for (const { rows } of JSON.parse(fs.readFileSync(unsolvedFile, 'utf8'))) {
	const groups = new Map();
	for (const [s, id, p] of rows) groups.set(`${s} ${id}`, [...groups.get(`${s} ${id}`) ?? [], p]);
	const sorted = [...groups].sort((a, b) => b[1].length - a[1].length);
	const fresh = sorted.find(([g, ps]) => !ps.some(p => tried.has(`${g} ${p}`)));
	let pick;
	if (fresh) { const ps = fresh[1].sort((a, b) => a - b); pick = `${fresh[0]} ${ps[ps.length >> 1]}`; }
	else for (const [g, ps] of sorted) {
		const done = ps.filter(p => tried.has(`${g} ${p}`)), open = ps.filter(p => !done.includes(p));
		if (!open.length) continue;
		const far = open.reduce((a, b) => Math.min(...done.map(d => Math.abs(d - b))) > Math.min(...done.map(d => Math.abs(d - a))) ? b : a);
		pick = `${g} ${far}`; break;
	}
	if (pick) lines.push([pick, rows.length]);
}
lines.sort((a, b) => b[1] - a[1]);
console.log(lines.map(([p, n]) => `${p} ${n}`).join('\n'));
