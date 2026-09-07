/** Export only generated, validated geometry. User SVG markup is never reused. */
import {Cubic,segmentDistance} from './bezier.js';
import {keyPoint,pointInRing} from './geometry.js';
import {curvesOf,solutionJSON} from './graph.js';
import {colorsSafe,targetSampler} from './input.js';
const n=x=>Number(x.toFixed(8));const point=p=>p.map(n).join(',');
export const escapeXML=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function curvePath(curves,transform=p=>p){return curves.length?'M '+point(transform(curves[0].p[0]))+' '+curves.map(c=>c.command(transform)).join(' '):'';}
export function boundarySVG(target){const w=target.width,[a,b]=colorsSafe(target.metadata.paperColors);return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${w}mm" viewBox="0 0 ${w} ${w}" data-heart-boundaries="true" data-phase="${target.phase}" data-paper-a="${a}" data-paper-b="${b}"><title>Processed Bézier colour boundaries</title><g fill="none" stroke="#233b37" stroke-width="0.2">${target.curves.map(c=>`<path d="${curvePath([c])}"/>`).join('')}</g></svg>`;}
/** Close the artwork against the overlap boundary by endpoint parity.
 * Sampling an infinitesimal distance inside each border interval is unreliable
 * when a fitted contour nearly touches that border. Its graph degree, however,
 * determines exactly whether the border fill must toggle. The initial fill
 * bit is fixed afterwards at an interior reference point, away from cut lines.
 * Original cubic control points are not moved by this operation.
 */
export function filledTargetPath(target){
  const w=target.width, cs=target.curves.slice(), vertices=new Map();
  const addVertex=p=>{const key=keyPoint(p,5);if(!vertices.has(key))vertices.set(key,{key,p,degree:0});return vertices.get(key);};
  for(const c of cs)for(const p of[c.p[0],c.p[3]])addVertex(p).degree++;
  for(const p of[[0,0],[w,0],[w,w],[0,w]])addVertex(p);
  const position=p=>Math.abs(p[1])<1e-6?p[0]:Math.abs(p[0]-w)<1e-6?w+p[1]:Math.abs(p[1]-w)<1e-6?3*w-p[0]:Math.abs(p[0])<1e-6?4*w-p[1]:null;
  const border=[];
  for(const v of vertices.values()){
    const s=position(v.p);
    if(s!==null)border.push({...v,s});
    else if(v.degree%2)throw new Error('An artwork boundary ends inside the overlap. Adjust tracing or crop.');
  }
  border.sort((a,b)=>a.s-b.s);
  let fill=0;
  for(let i=0;i<border.length;i++){
    const a=border[i],b=border[(i+1)%border.length];fill^=a.degree%2;
    if(fill&&a.key!==b.key)cs.push(Cubic.line(a.p,b.p));
  }
  if(fill)throw new Error('The artwork has an odd number of border endpoints.');
  const adj=new Map();
  cs.forEach((c,i)=>{for(const p of[c.p[0],c.p[3]]){const key=keyPoint(p,5);if(!adj.has(key))adj.set(key,[]);adj.get(key).push(i);}});
  if([...adj.values()].some(a=>a.length%2))throw new Error('The traced boundaries do not form closed two-colour regions. Adjust tracing or crop.');
  const used=new Set(),paths=[],rings=[];
  for(let seed=0;seed<cs.length;seed++){
    if(used.has(seed))continue;
    let current=keyPoint(cs[seed].p[0],5),start=current,curves=[];
    do{
      const id=adj.get(current).find(e=>!used.has(e));
      if(id===undefined)throw new Error('Incomplete boundary cycle.');
      used.add(id);const c=cs[id],forward=keyPoint(c.p[0],5)===current;
      curves.push(forward?c:c.reversed());current=keyPoint(forward?c.p[3]:c.p[0],5);
    }while(current!==start);
    paths.push(curvePath(curves)+' Z');
    rings.push(curves.flatMap((c,i)=>c.flatten(.01).slice(i?1:0)));
  }
  // The internal edge set fixes the picture up to a global colour reversal.
  const sample=targetSampler(target),candidates=[[.371,.413],[.613,.717],[.233,.831],[.813,.197],[.527,.293]];
  let reference=null,best=-1;
  for(const [x,y]of candidates){const p=[x*w,y*w];let gap=Infinity;for(const ring of rings)for(let j=1;j<ring.length;j++)gap=Math.min(gap,segmentDistance(p,ring[j-1],ring[j]));if(gap>best){best=gap;reference=p;}}
  let actual=0;for(const ring of rings)actual^=pointInRing(reference,ring);
  if(actual!==sample(...reference))paths.push(`M 0,0 H ${w} V ${w} H 0 Z`);
  return paths.join(' ');
}
export function targetSVG(target){const w=target.width,[a,b]=colorsSafe(target.metadata.paperColors);return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 ${w} ${w}"><title>Processed two-colour Bézier artwork</title><rect width="${w}" height="${w}" fill="${b}"/><path d="${filledTargetPath(target)}" fill="${a}" fill-rule="evenodd"/></svg>`;}
export function previewSVG(solution){const w=solution.graph.target.width,[a,b]=colorsSafe(solution.graph.target.metadata.paperColors),d=[];for(let k=0;k<2;k++)for(let i=0;i<solution.paths[k].length;i++){const cs=curvesOf(solution,k,i);d.push('M 0,0 L '+point(cs[0].p[0])+' '+cs.map(c=>c.command()).join(' ')+(k===0?` L 0,${w} Z`:` L ${w},0 Z`));}const phase=solution.graph.target.phase^(solution.paths[0].length%2)^(solution.paths[1].length%2);if(phase)d.push(`M 0,0 H ${w} V ${w} H 0 Z`);return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="760" viewBox="${-1.35*w} ${-.38*w} ${2.7*w} ${2.5*w}"><title>Woven heart reconstructed from the selected cuts</title><rect x="${-1.35*w}" y="${-.38*w}" width="${2.7*w}" height="${2.5*w}" fill="#e8eeea"/><g transform="matrix(1 1 -1 1 0 0)"><path d="M 0,${w} A ${w/2},${w/2} 0 0 1 0,0 Z" fill="${b}"/><path d="M 0,0 A ${w/2},${w/2} 0 0 1 ${w},0 Z" fill="${a}"/><path d="M 0,0 H ${w} V ${w} H 0 Z" fill="${b}"/><path d="${d.join(' ')}" fill="${a}" fill-rule="evenodd"/></g></svg>`;}
export function templateSVG(solution,family,cfg){const w=solution.graph.target.width,pw=Math.max(210,w+30),ph=Math.max(297,1.5*w+108),x=(pw-w)/2,shoulder=35+w/2,fold=shoulder+w,left=family===1,[a,b]=colorsSafe(solution.graph.target.metadata.paperColors),transform=p=>left?[p[1]+x,p[0]+shoulder]:[p[0]+x,p[1]+shoulder],title=left?`LEFT · PAPER B (${b})`:`RIGHT · PAPER A (${a})`,y=fold+13;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}mm" height="${ph}mm" viewBox="0 0 ${pw} ${ph}"><title>${title}</title><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" fill="#203932"><text x="15" y="15" font-size="5">juleflet / ${title}</text><text x="15" y="22" font-size="3.2">${left?'Turn the marked face inward.':'Keep the marked face outward.'} One template per paper colour.</text><text x="15" y="28" font-size="3.2">Overlap ${w} mm · Print at 100% / actual size. Check the calibration line.</text></g><g fill="none" stroke="#202b30" stroke-width="0.25" stroke-linecap="butt"><path d="M ${x},${fold} V ${shoulder} A ${w/2},${w/2} 0 0 1 ${x+w},${shoulder} V ${fold}"/>${solution.paths[family].map((_,i)=>`<path data-slit="${i+1}" d="${curvePath(curvesOf(solution,family,i),transform)}"/>`).join('')}<path d="M ${x},${fold} H ${x+w}" stroke-dasharray="2.5 1.5"/></g><g font-family="sans-serif" fill="#203932" font-size="3.2"><text x="15" y="${y}">FOLD on the dashed edge. Do not cut it.</text><text x="15" y="${y+6}">Cut solid lines through both folded layers.</text><text x="15" y="${y+12}">Remaining width target ${cfg.minWidth} mm; reserved spacing ${n(cfg.nominalWidth)} mm.</text><text x="15" y="${y+18}">Starting overlap colour at the notch: paper ${solution.graph.target.phase?'A':'B'}.</text><text x="15" y="${y+24}">Geometric candidate. Physical threading and paper strength are not certified.</text><text x="15" y="${y+38}">20 mm scale check</text></g><path d="M 15,${y+30} h 20 M 15,${y+28} v 4 M 35,${y+28} v 4" fill="none" stroke="#202b30" stroke-width="0.25"/></svg>`;}
function rasterPaths(map,nx,ny,h,originY,values){return values.map(value=>{let d='';for(let y=0;y<ny;y++){let x=0;while(x<nx){if(map[y*nx+x]!==value){x++;continue;}const start=x;while(x<nx&&map[y*nx+x]===value)x++;d+=`M${n(start*h)},${n(originY+y*h)}h${n((x-start)*h)}v${n(h)}h${n(-(x-start)*h)}Z`;}}return d;});}
export function materialSVG(solution,audit,family){const f=audit.families[family],w=solution.graph.target.width,[nx,ny]=f.resolution,h=f.gridSpacing,paths=rasterPaths(f.map,nx,ny,h,f.originY,[4,2,1,3]),colors=['#eadfce','#dfb35b','#98b5a5','#bd3428'];return `<svg xmlns="http://www.w3.org/2000/svg" width="430" height="900" viewBox="-8 ${-w/2-18} ${w+16} ${3*w+55}"><title>Unfolded ${family===1?'left':'right'} paper support: ${f.status}</title><rect x="-8" y="${-w/2-18}" width="${w+16}" height="${3*w+55}" fill="#faf8f4"/><g font-family="sans-serif" font-size="3.5" fill="#203932"><text x="0" y="${-w/2-9}">${family===1?'LEFT':'RIGHT'} · unfolded paper · ${f.status.toUpperCase()}</text>${paths.map((d,i)=>`<path d="${d}" fill="${colors[i]}"/>`).join('')}<path d="M0,${w}H${w}" stroke="#203932" stroke-width="0.3" stroke-dasharray="2 2"/><text x="0" y="${2.5*w+8}">Green: connected core. Amber: resolution margin.</text><text x="0" y="${2.5*w+14}">Red: detached core. Beige: local tips / non-core paper.</text><text x="0" y="${2.5*w+20}">Grid ${n(h)} mm. Guarded geometric test, not a strength proof.</text></g></svg>`;}
export function differenceSVG(audit,w){if(!audit.worst)return null;const n=audit.worst.resolution,d=rasterPaths(audit.worst.map,n,n,w/n,0,[1,2]);return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}"><title>Largest sampled valid disturbance, trial ${audit.worst.trial}</title><rect width="${w}" height="${w}" fill="#eff3ef"/><path d="${d[0]}" fill="#bd3428"/><path d="${d[1]}" fill="#dfb35b"/></svg>`;}
export function reportHTML(report,images={}){return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>juleflet · design report</title><style>body{font:16px system-ui;color:#203932;background:#faf8f4;margin:40px auto;max-width:1000px;padding:20px}img{max-width:100%}h1{font-size:36px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:24px;border:1px solid #ddd}section{display:flex;flex-wrap:wrap;gap:24px}figure{flex:1;min-width:220px;margin:0}figure svg{max-width:100%;max-height:800px}</style><h1>juleflet / design report</h1><p>Local JavaScript + HiGHS WebAssembly. This is a geometric candidate, not a physical assembly or paper-strength certificate.</p><section>${Object.entries(images).map(([title,svg])=>`<figure><h2>${escapeXML(title)}</h2>${svg||''}</figure>`).join('')}</section><h2>Settings and independent checks</h2><pre>${escapeXML(JSON.stringify(report,null,2))}</pre></html>`;}
export function resultFiles(solution,cfg,report,audit,perturbation,{allowTemplates=true}={}){const files={'cut_geometry.json':JSON.stringify(solutionJSON(solution),null,2),'report.json':JSON.stringify(report,null,2),'vector_target.svg':boundarySVG(solution.graph.target),'processed_design.svg':targetSVG(solution.graph.target),'weave_preview.svg':previewSVG(solution),'manufacturability_left.svg':materialSVG(solution,audit,1),'manufacturability_right.svg':materialSVG(solution,audit,0)};if(allowTemplates){files['template_left.svg']=templateSVG(solution,1,cfg);files['template_right.svg']=templateSVG(solution,0,cfg);const w=solution.graph.target.width,pw=Math.max(210,w+30),ph=Math.max(297,1.5*w+108);files['print_templates.html']=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>juleflet · print both templates</title><style>@page{size:${pw}mm ${ph}mm;margin:0}html,body{margin:0;padding:0;background:#eee}.sheet{width:${pw}mm;height:${ph}mm;background:white;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}svg{display:block;width:100%;height:100%}aside{font:16px system-ui;padding:20px;max-width:720px}@media print{aside{display:none}body{background:white}}</style><aside><strong>Print both templates</strong><p>Use your browser’s Print command. Choose 100% scale / actual size, no margins and no headers or footers. Check the 20 mm line before cutting. Page size: ${pw} × ${ph} mm. Geometric candidates, not physically assembly-tested.</p></aside><section class="sheet">${files['template_left.svg']}</section><section class="sheet">${files['template_right.svg']}</section></html>`;}const diff=differenceSVG(perturbation,solution.graph.target.width);if(diff)files['disturbance.svg']=diff;files['report.html']=reportHTML(report,{'Woven reconstruction':files['weave_preview.svg'],'Unfolded left sheet':files['manufacturability_left.svg'],'Unfolded right sheet':files['manufacturability_right.svg']});return files;}
