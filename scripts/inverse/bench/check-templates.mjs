// Whether each template (cut.json, e.g. the generator's own, generator-set.mjs) keeps our export's cutting rules
// on its own outline, the converter's doubled shared cuts (edge_parity) set aside (was tmp/e2e/even/genassess.mjs,
// a superset of genvalid.mjs): `valid` with no issue at all, `exports` as the export reads it (clearances up to
// 0.1 mm short pass, and the paper), the issue kinds and clearance shortfalls, and the near-miss rank the exact
// search would give it (exact/stage.js assess `near`). One JSON line per file.
//   [CORE=DIR] node scripts/inverse/bench/check-templates.mjs CUT.json... > templates.jsonl
// run.mjs --templates reads `exports` as "solvable" (a template the export takes is known); cuts/README.md: the
// training's --drop list is the templates that are not `valid`.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url))), C = path.resolve(process.env.CORE ?? `${ROOT}/static/inverse/core`);
const server = await createServer({root: ROOT, configFile: `${ROOT}/vite.config.ts`, server: {middlewareMode: true, hmr: false, ws: false}, appType: 'custom', logLevel: 'silent', cacheDir: process.env.VITE_CACHE_DIR ?? `${ROOT}/tmp/.vite-check-${process.pid}`});
{ const dir = server.config.cacheDir, drop = () => process.getBuiltinModule('node:fs').rmSync(dir, {recursive: true, force: true}); process.on('exit', drop); for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => process.exit(143)); } // the per-run cache goes with the run
const [mal, {DEFAULT_COLORS}] = await Promise.all(['/src/lib/inverse/engine.ts', '/src/lib/stores/colors.ts'].map(p => server.ssrLoadModule(p)));
const {loadSolutionJSON} = await import(`${C}/graph.js`);
const {settings} = await import(`${C}/settings.js`);
const {validate, verdict} = await import(`${C}/validate.js`);
const {finalMaterialAudit} = await import(`${C}/geometric-material.js`);
const {verifiedPaperSettings} = await import(`${C}/material.js`);
const {verifyPaper} = await import(`${C}/exact/paper.js`);
const {issueKinds} = await import(`${C}/result-rank.js`);
const cfg = settings(mal.solveSettings({colors: DEFAULT_COLORS, symmetry: {curve: 'off', lobe: 'off', lobes: 'off'}}));
for (const file of process.argv.slice(2)) {
  let line;
  try {
    const solution = loadSolutionJSON(await fs.readFile(file, 'utf8')), checked = validate(solution, cfg, {finalGeometry: true});
    const issues = checked.issues.filter(i => i.type !== 'edge_parity');
    // `exports`: as the export reads it (exact/stage.js assess): clearances up to 0.1 mm short pass, and the paper.
    const v = verdict({...checked, issues, passed: !issues.length}), exports = v.passed && (() => { try { verifyPaper(solution, cfg); return finalMaterialAudit(solution, verifiedPaperSettings(solution, cfg)).passed; } catch { return false; } })();
    const kinds = {}; for (const i of issues) kinds[i.type] = (kinds[i.type] ?? 0) + 1;
    // The clearance shortfalls (mm below what the rule asks), the largest first.
    const short = issues.map(i => (i.required ?? cfg.nominalWidth ?? 0) - (i.distanceUpper ?? i.distanceLower ?? i.distance ?? 0)).filter(Number.isFinite).sort((x, y) => y - x).slice(0, 5).map(x => +x.toFixed(3));
    // assess's near (exact/stage.js) without the converter's edge_parity: the picture is the design itself (0 off, regions kept).
    const {kinds: others, shortfall} = issueKinds(v.issues, cfg.nominalWidth);
    if (v.passed && !exports) others.add('paper');
    line = {valid: !issues.length, exports, kinds, ...(short.length ? {short} : {}), near: [exports ? 0 : 1, others.size, shortfall, 0], others: [...others]};
  } catch (error) { line = {error: String(error.message).slice(0, 60)}; }
  console.log(JSON.stringify({id: path.basename(file).replace('.cut.json', ''), ...line}));
}
await server.close();
