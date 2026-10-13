/** Render the completed diagnostic without changing its crops or scores. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function writeMaterialReport(file){
 const report=JSON.parse(await fs.readFile(file));
 if(report.schema!=='woven-heart-photo-material-study-1'||report.status!=='complete')throw new Error('A completed source-material study is required.');
 const image=(src,label)=>`<figure><img src="${escape(src)}" alt="${escape(label)}"><figcaption>${escape(label)}</figcaption></figure>`;
 const cards=report.rows.map(r=>{
  const c=r.classified,e=r.exported,prefix=r.id+'-'+r.crop;
  return `<article data-case="${escape(r.id)}" data-crop="${escape(r.crop)}" data-method="${escape(r.method)}"><h2>${escape(r.id)} · ${escape(r.crop)} · ${escape(r.method||'no crop')}</h2><p>${escape(r.provenance)}</p>
   ${c?`<p>Source samples: <strong>${c.correct}/${c.total}</strong> after classification${e?`, <strong>${e.correct}/${e.total}</strong> after export`:''}. Excluded by crop: <strong>${c.outsideCrop}/${c.total}</strong>. ${r.maskDisagreement==null?'':`Exported mask disagreement: <strong>${(100*r.maskDisagreement).toFixed(3)}%</strong>. Numerical checks: <strong>${r.numericalPass?'pass':'fail'}</strong>.`}</p>`:`<p>No crop: ${r.review?.total||0} observations remain unavailable and in the denominator.</p>`}
   ${r.error?`<p>${escape(r.error)}</p>`:''}
   <div class="images">${image(r.id+'-samples.png','Original photo samples: cyan = red paper; magenta = white paper')}${c?image(prefix+'/rgb.png','Fixed rectified photograph'):''}${r.assets?.['mask.png']?image(r.assets['mask.png'].path,'Classified mask; dark = mask value 1'):''}${r.assets?.['woven.png']?image(r.assets['woven.png'].path,'Independent render of exported curves; dark = mask value 1'):''}</div>
   ${c?`<table><thead><tr><th>Reviewed region</th><th>Crop excludes</th><th>Classification matches</th><th>Export matches</th></tr></thead><tbody>${c.groups.map(g=>`<tr><td>${escape(g.id)}</td><td>${g.outsideCrop}/${g.total}</td><td>${g.correct}/${g.total}</td><td>${e?e.groups.find(q=>q.id===g.id).correct+'/'+g.total:'unavailable'}</td></tr>`).join('')}</tbody></table>`:''}
  </article>`;
 }).join('');
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Source-photo material review</title><style>body{font:15px/1.5 system-ui;margin:24px;background:#f7f5ef;color:#243139}h1{font-size:26px}article{padding:20px;margin:20px 0;background:white;border:1px solid #ccd4d6}.images{display:flex;gap:12px;flex-wrap:wrap}figure{width:280px;margin:0}img{width:280px;height:280px;object-fit:contain}figcaption{font-size:12px}table{border-collapse:collapse;margin-top:16px}td,th{padding:5px 18px 5px 0;text-align:left}p{max-width:1150px}</style><h1>Source-photo material review</h1><p>Sparse assistant-reviewed development observations, not complete artwork or cutting-path ground truth. No observation enters the fitter. Cropped-out and unavailable observations stay in the denominator. One phase is inferred from classification and then fixed for export. Passing the numerical checks does not establish that the original photograph was preserved.</p><p><a href="report.json">Complete evidence</a></p>${cards}</html>`;
 const destination=path.join(path.dirname(file),'index.html');await fs.writeFile(destination,html);return destination;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(await writeMaterialReport(process.argv[2]));
