/** Replay exported geometry through the independent polygon-offset diagnostic.
 * --plan uses {cases:[{id,geometry:<file>,sha256,settings}]}.
 * Without --plan, use the committed seven-case photographic regression fixture.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createOffsetPaperAudit,exportedPaperPaths} from './paper-offset.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const fixture=args.plan||'scripts/inverse/fixtures/paper-offset-cases.json';
const output=args.output||'tmp/inverse-paper-offset';
const source=await fs.readFile(fixture),plan=JSON.parse(source),hash=x=>createHash('sha256').update(x).digest('hex');
await fs.mkdir(output); // Refuse to overwrite previous evidence.
const started=performance.now(),audit=await createOffsetPaperAudit();
const report={fixture,fixtureSha256:hash(source),loadSeconds:(performance.now()-started)/1000,
  method:'Independent adaptive cubic subdivision and Clipper2 round polygon offsets, six decimal precision; no raster lattice.',
  limitations:['Approximate geometric core, not a physical strength or exact topology certificate.','Continuous positive fold support differs from the lattice half-cell rule.','A disconnected component can appear and disappear as offset radius changes; bracket results are sensitivity measurements.','No fitting, mask changes, crop changes or production acceptance changes.'],cases:[]};

function svg(result,lines,width,radius){
  const shapes=result.parts.map(p=>'<path fill="'+(p.anchored?'#91b19b':'#dc5349')+'" fill-rule="evenodd" d="'+
    p.rings.map(ring=>'M '+ring.map(p=>p.join(',')).join(' L ')+' Z').join(' ')+'"/>');
  const cuts=lines.map(line=>[...line,...line.slice(0,-1).toReversed().map(([x,y])=>[x,2*width-y])]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="1200" viewBox="-5 ${-width/2-5} ${width+10} ${3*width+10}"><title>Nominal paper core; radius ${radius}</title><rect x="-5" y="${-width/2-5}" width="${width+10}" height="${3*width+10}" fill="#faf8f4"/>`+
    shapes.join('')+cuts.map(line=>'<polyline points="'+line.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#222" stroke-width=".12"/>').join('')+'</svg>';
}

for(const entry of plan.cases){
  assert.match(entry.id,/^[a-zA-Z0-9_-]+$/);
  const raw=typeof entry.geometry==='string'?await fs.readFile(entry.geometry):Buffer.from(JSON.stringify(entry.geometry));
  if(typeof entry.geometry==='string')assert.equal(hash(raw),entry.sha256);
  const data=JSON.parse(raw),cfg=entry.settings,row={id:entry.id,geometrySha256:hash(raw),settings:cfg,results:[]};
  const folder=path.join(output,entry.id);await fs.mkdir(folder);
  for(const tolerance of [.002,.0005])for(const family of [0,1]){
    const lines=exportedPaperPaths(data,family,tolerance);
    for(const delta of [-tolerance,0,tolerance]){
      const start=performance.now(),radius=cfg.nominalWidth/2+delta;
      const result=audit(lines,data.square_width_mm,radius,cfg.minFeatureArea,{arcTolerance:tolerance,includePolygons:true});
      const seconds=(performance.now()-start)/1000;
      if(tolerance===.0005&&delta===0)await fs.writeFile(path.join(folder,`paper-${family}.svg`),svg(result,lines,data.square_width_mm,radius));
      for(const part of result.parts)delete part.rings;
      row.results.push({family,tolerance,delta,seconds,...result});
    }
  }
  row.passed=row.results.every(r=>r.passed);report.cases.push(row);
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({id:row.id,passed:row.passed,nominal:row.results.filter(r=>r.tolerance===.0005&&r.delta===0).map(r=>({family:r.family,passed:r.passed,floatingArea:r.significantFloatingArea}))}));
}
