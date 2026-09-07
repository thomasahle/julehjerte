/** Standalone visual evidence, including rejected and incomplete inputs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export async function writeHardPhotoReport(file) {
  const data = JSON.parse(await fs.readFile(file)), rows = data.results;
  const tested = rows.filter(r => r.runs.length), passed = tested.filter(r => r.runs.some(t => t.passed));
  const figure = (src, label) => `<figure><img loading="lazy" src="${escape(src)}" alt="${escape(label)}"><figcaption>${escape(label)}</figcaption></figure>`;
  const cards = rows.map(r => `<article data-status="${escape(r.status)}"><h2>${escape(r.label)} · ${escape(r.id)}</h2><p class="status">${escape(r.status)} · crop: ${escape(r.cropStatus)}</p>
    ${r.runs.length ? `<div class="images">${figure(`${r.id}/source.png`, 'Selected source region')}${figure(`${r.id}/crop.png`, 'Fixed rectified photograph')}</div>` : '<p>The complete motif is not visible enough to score. It remains in the inventory.</p>'}
    ${r.runs.map(t => `<section><h3>${escape(t.preset)} · ${escape(t.status)}</h3><p>${escape(t.seconds?.toFixed(2))} s total · ${escape(t.curves)} traced curves${t.independentImageError == null ? '' : ` · ${(100 * t.independentImageError).toFixed(2)}% independent image mismatch`}</p><p>${escape(t.message)}</p>
    <div class="images">${figure(`${r.id}/${t.preset}/mask.png`, 'Classified photograph before repairs')}${figure(`${r.id}/${t.preset}/target.svg`, 'Prepared boundaries')}${t.independentImageError == null ? '' : figure(`${r.id}/${t.preset}/independent-weave.png`, 'Independent render of exported curves')}</div></section>`).join('')}
    <details><summary>Coordinates and preparation</summary><pre>${escape(JSON.stringify({ effectiveQuad: r.effectiveQuad, originalPhotoQuad: r.sourceQuad, cropNote: r.cropNote, runs: r.runs.map(t => ({ preset: t.preset, settings: t.settings, preprocessing: t.preprocessing?.preprocessing })) }, null, 2))}</pre></details></article>`).join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Photographed heart reconstruction tests</title><style>
    body{font:16px/1.5 system-ui,sans-serif;background:#f6f4ef;color:#20343e;max-width:1120px;margin:32px auto;padding:0 20px}h1{line-height:1.15}article{background:white;border:1px solid #d6dddd;border-radius:12px;padding:20px;margin:24px 0}h2{margin:0}h3{margin-bottom:0}.images{display:flex;flex-wrap:wrap;gap:16px}figure{margin:12px 0;flex:0 1 256px}img{width:100%;height:256px;object-fit:contain;background:#f7f7f7}figcaption,.status{font-size:14px;color:#536570}section{border-top:1px solid #ddd}pre{overflow:auto;font-size:12px;max-height:400px}select{padding:8px;font:inherit}a{color:#006c7c}
    </style><h1>Photographed heart reconstruction tests</h1><p><strong>${passed.length} / ${tested.length} tested motifs produced an accepted pair.</strong> Inventory: ${rows.length}; unscored: ${rows.length - tested.length}.</p><p>Run ${escape(data.runId)}. ${escape(data.description)}</p><p>Acceptance requires geometry and paper checks and at most 3% disagreement with the classified photograph. Original cutting paths are unknown. Small image error does not establish accurate cropping or physical assembly.</p><p><a href="results.json">Complete measurements and source hashes</a></p><label>Show <select id="filter"><option value="all">All inputs</option><option value="validated">Accepted pairs</option><option value="failed">Failed reconstruction attempts</option><option value="incomplete">Incomplete motifs</option><option value="obscured">Obscured motifs</option></select></label>${cards}<script>document.querySelector('#filter').onchange=e=>document.querySelectorAll('article').forEach(a=>a.hidden=e.target.value!=='all'&&a.dataset.status!==e.target.value);</script></html>`;
  const destination = path.join(path.dirname(file), 'index.html');
  await fs.writeFile(destination, html);
  return destination;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(await writeHardPhotoReport(process.argv[2]));
