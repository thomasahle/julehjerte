/** Reproducible, offline generator corpus. Refused inputs are reported separately
 * from invalid accepted output. Run --mode=text|figure, --font=nunito, --frame=repeat,
 * --input=ANNA or --out=tmp/generator/report.json to narrow a diagnostic run. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
const root = fileURLToPath(new URL('../../', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.length ? value.join('=') : true];
}));
const colors = { left: '#fffdf5', right: '#b72f2b' };
const read = async (file) => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const { texts, fonts: fontIds, motifs } = await read('scripts/generator/corpus.json');
const expected = new Set(await read('scripts/generator/expected.json'));
const dom = new JSDOM('');
globalThis.DOMParser = dom.window.DOMParser;
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const samples = [];
const server = await createServer({ root, configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { $lib: path.join(root, 'src/lib') } } });
try {
    const { generate } = await server.ssrLoadModule('/src/lib/generator/generate.ts');
    const { ConstructionError } = await server.ssrLoadModule('/src/lib/generator/geometry.ts');
    const { CutGeometryError } = await server.ssrLoadModule('/src/lib/inverse/toHeartDesign.ts');
    const { FIGURE_TEMPLATES, TEXT_TEMPLATES } = await server.ssrLoadModule('/src/lib/generator/templates.ts');
    const { normalizeHeartDesign, serializeHeartDesign, serializeHeartToSVG, parseHeartFromSVG } = await server.ssrLoadModule('/src/lib/utils/heartDesign.ts');
    const { inferOverlapRect } = await server.ssrLoadModule('/src/lib/utils/overlapRect.ts');
    const { findFingersWithIssues, intersectionMarginPx } = await server.ssrLoadModule('/src/lib/editor/curveIssues.ts');
    const { gridClearanceScale } = await server.ssrLoadModule('/src/lib/geometry/clearance.ts');
    const { rasterizeDesign } = await server.ssrLoadModule('/src/lib/paint/rasterize.ts');
    const { renderHeartSvgMarkup } = await server.ssrLoadModule('/src/lib/rendering/heartSvg.ts');
    const cases = [];
    if (args.mode !== 'figure')
        for (const fontId of fontIds.filter(f => !args.font || (args.font === 'others' ? f !== 'nunito' : String(args.font).split(',').includes(f)))) {
            const font = await read(`static/generator/fonts/${fontId}.json`);
            for (const text of texts.filter(t => !args.input || args.input === t))
                for (const textFrame of TEXT_TEMPLATES.filter(f => args.frame ? f === args.frame : fontId === 'nunito' || ['woven', 'air', 'repeat'].includes(f))) {
                    if (textFrame === 'repeat' && [...text.replace(/\s/g, '')].length > 10)
                        continue;
                    cases.push({ id: `text/${fontId}/${textFrame}/${JSON.stringify(text)}`, mode: 'text', input: text, fontId, template: textFrame, request: { mode: 'text', name: text, text, font, textFrame, colors } });
                }
        }
    if (args.mode !== 'text')
        for (const id of motifs.filter(m => !args.input || args.input === m)) {
            const { contours } = await read(`static/generator/motifs/${id}.json`);
            for (const template of FIGURE_TEMPLATES.filter(t => !args.frame || args.frame === t.id))
                cases.push({ id: `figure/${id}/${template.id}`, mode: 'figure', input: id, template: template.id, request: { mode: 'figure', name: id, contours, colors, frame: template.frame, style: template.style } });
        }
    if (!cases.length) throw new Error('No corpus cases matched the requested filters');
    const results = [];
    const output = path.resolve(root, args.out ?? 'tmp/generator/report.json');
    await fs.mkdir(path.dirname(output), { recursive: true });
    const save = () => fs.writeFile(output, JSON.stringify({ cases: results.length, total: cases.length, results }, null, 2) + '\n');
    for (const [index, entry] of cases.entries()) {
        const { request, ...record } = entry;
        const start = performance.now();
        let design;
        try {
            design = generate(request).design;
            record.status = 'accepted';
            record.grid = design.gridSize;
        }
        catch (error) {
            record.status = error instanceof ConstructionError || error instanceof CutGeometryError ? 'refused' : 'invalid';
            record.error = error.message;
            record.code = error.code;
        }
        record.ms = Math.round(performance.now() - start);
        if (design)
            try {
                const before = rasterizeDesign(design, 120).data;
                // Exercise both handoffs used by the product, with the editor's own spacing check.
                for (const restored of [normalizeHeartDesign(serializeHeartDesign(design)), parseHeartFromSVG(serializeHeartToSVG(design))]) {
                    if (!restored || restored.fingers.length !== design.fingers.length)
                        throw Error('Lost cuts in serialization');
                    const rect = inferOverlapRect(restored.fingers, restored.gridSize);
                    const margin = intersectionMarginPx(rect, gridClearanceScale(restored.gridSize.x, restored.gridSize.y));
                    if (findFingersWithIssues(restored.fingers, margin).size)
                        throw Error('Editor rejects restored cuts');
                    if (restored.rightCutouts?.length || restored.leftCutouts?.length)
                        throw Error('Detached cutouts');
                    const after = rasterizeDesign(restored, 120).data;
                    const mismatch = after.reduce((sum, v, i) => sum + Number(v !== before[i]), 0) / after.length;
                    if (mismatch > 0.002)
                        throw Error(`Roundtrip changes ${mismatch} of the weave`);
                }
                const representative = entry.mode === 'figure'
                    ? entry.template === 'circle-rays' || (entry.input === 'gift' && entry.template.startsWith('oval-'))
                    : entry.template === 'repeat' && ['ANNA', 'anna', 'JUL'].includes(entry.input);
                if (args.artifacts && (representative || (!expected.has(entry.id) && samples.length < 96)))
                    samples.push({ id: entry.id, svg: renderHeartSvgMarkup(design, colors, {idPrefix: 'sample-' + samples.length}) });
            }
            catch (error) {
                record.status = 'invalid';
                record.error = error.message;
            }
        if (record.status !== 'accepted' && expected.has(entry.id))
            record.regression = true;
        results.push(record);
        if (index % 10 === 0 || index === cases.length - 1) {
            await save();
            process.stdout.write(`${index + 1}/${cases.length} ${record.id} ${record.status} ${record.ms}ms\n`);
        }
    }
    const groups = {};
    for (const r of results) {
        const key = r.mode === 'text' ? `${r.fontId}/${r.template}` : r.template;
        const g = groups[key] ??= { accepted: 0, refused: 0, invalid: 0, ms: 0 };
        g[r.status]++;
        g.ms += r.ms;
    }
    process.stdout.write(JSON.stringify(groups, null, 2) + '\n');
    if (args.artifacts) {
        await fs.writeFile(output.endsWith('.json') ? output.slice(0, -5) + '.html' : output + '.html', `<!doctype html><meta charset="utf-8"><title>Generator robustness review</title><style>body{font:16px system-ui;margin:2rem;background:#f9f9f3}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:2rem}figure{margin:0;background:white;padding:1rem}svg{width:100%;height:auto}figcaption{overflow-wrap:anywhere}</style><h1>Generated samples</h1><p>Accepted geometry, with JSON and SVG roundtrips checked. These are digital checks, not physical weaving tests.</p><main>${samples.map(s => `<figure>${s.svg}<figcaption>${escape(s.id)}</figcaption></figure>`).join('')}</main>`);
    }
    if (results.some(r => r.status === 'invalid' || r.regression))
        process.exitCode = 1;
}
finally {
    await server.close();
    dom.window.close();
}
