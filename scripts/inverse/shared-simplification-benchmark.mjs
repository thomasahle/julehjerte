/** Replay final cleanup on existing fitted curves. These templates are audit
 * inputs only; separate fresh-fit benchmarks still start from images/grids. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {loadSolutionJSON,solutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {matchingSummary} from '../../static/inverse/core/direct/matching.js';
import {symmetryReport} from '../../static/inverse/core/direct/symmetry.js';
import {finalizeSharedSimplification} from '../../static/inverse/core/direct/shared-simplification.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {renderExportedWeave} from './export-renderer.mjs';

const out=process.env.INVERSE_SIMPLIFY_OUT||'tmp/shared-simplification-fixed';
const dirs={hunodan:process.env.INVERSE_SIMPLIFY_HUNODAN||'tmp/kernel-equality-hunodan',weighted:process.env.INVERSE_SIMPLIFY_WEIGHTED||'tmp/kernel-equality-weighted',browser:process.env.INVERSE_SIMPLIFY_BROWSER||'tmp/kernel-equality-browser'};
const cases=[],hash=b=>createHash('sha256').update(b).digest('hex');
for(const [group,dir]of Object.entries(dirs)){
 const report=JSON.parse(await fs.readFile(`${dir}/results.json`));
 for(const r of report.results){
  if(group==='browser'&&!r.name.startsWith('top-hat'))continue;
  const id=group==='hunodan'?r.id:group==='browser'?`${r.browser}-${r.name}`:`${r.shape}-${r.size}-${r.strategy}${r.variant==='original'?'':`-${r.variant}`}`;
  cases.push({id,group,file:`${dir}/${id}/cut_geometry.json`,symmetry:group==='browser'&&r.name==='top-hat-anti'?{antiTranspose:true}:group==='browser'&&r.name==='top-hat'?{transpose:true}:{}});
 }
}
await fs.mkdir(out,{recursive:true});await loadNumericalKernel();
const sourceHashes={};for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){const file='static/inverse/core/'+name;sourceHashes[file]=hash(await fs.readFile(file));}
sourceHashes['scripts/inverse/shared-simplification-benchmark.mjs']=hash(await fs.readFile('scripts/inverse/shared-simplification-benchmark.mjs'));
const report={runtime:process.version,cpu:cpus()[0]?.model,sourceHashes,method:'The original exported geometry supplies the reference weave, not an optimizer initialization. Time includes the complete cleanup and its acceptance checks. Original loading, creation of the 400-cell reference mask, independent 800-cell exported rendering, comparison and subsequent paper checks are outside the timer. Exact binary export equality and fractional coverage drift <0.005 percentage points are required. Cut endpoints, matching templates, requested symmetry, geometry and paper gates must remain valid. A declined simplification is unchanged, not a failed design.',results:[]};
for(const entry of cases){
 const row={id:entry.id,group:entry.group,input:entry.file};report.results.push(row);
 try{
  const bytes=await fs.readFile(entry.file);row.inputSha256=hash(bytes);
  const before=loadSolutionJSON(bytes.toString()),cfg=settings({...AUTOMATIC_PRESET,symmetry:entry.symmetry});
  before.graph.target.sourceImage={resolution:400,mask:sampleWeave(before,400)};
  const snapshot=JSON.stringify(solutionJSON(before)),start=performance.now(),after=finalizeSharedSimplification(before,cfg);row.seconds=(performance.now()-start)/1000;
  row.beforeSegments=before.graph.edges.length;row.afterSegments=after.graph.edges.length;row.cleanup=after.report.finalSharedSimplification??null;
  row.beforePathSegments=before.paths.flat().reduce((s,p)=>s+p.length,0);row.afterPathSegments=after.paths.flat().reduce((s,p)=>s+p.length,0);
  const a=await renderExportedWeave(snapshot,800),b=await renderExportedWeave(solutionJSON(after),800);
  row.exportMaskChanged=a.mask.reduce((s,v,i)=>s+Number(v!==b.mask[i]),0);row.coverageDrift=b.coverage.reduce((s,v,i)=>s+Math.abs(v-a.coverage[i]),0)/b.coverage.length;
  row.beforeMatching=matchingSummary(before).identical;row.afterMatching=matchingSummary(after).identical;row.symmetry=symmetryReport(after,entry.symmetry);
  row.geometry=validate(after,cfg,{checkImage:false}).passed;row.paper=materialAudit(after,cfg).passed;
  row.originalUnchanged=snapshot===JSON.stringify(solutionJSON(before));row.endpointsUnchanged=true;
  for(let f=0;f<2;f++)for(let i=0;i<before.paths[f].length;i++){
   const x=curvesOf(before,f,i),y=curvesOf(after,f,i);
   if(JSON.stringify([x[0].p[0],x.at(-1).p[3]])!==JSON.stringify([y[0].p[0],y.at(-1).p[3]]))row.endpointsUnchanged=false;
  }
  row.passed=row.originalUnchanged&&row.endpointsUnchanged&&row.exportMaskChanged===0&&row.coverageDrift<.00005&&row.geometry&&row.paper&&(!row.beforeMatching||row.afterMatching)&&row.symmetry.requested.length===row.symmetry.honoured.length;
  if(row.cleanup?.applied){await fs.mkdir(`${out}/${row.id}`,{recursive:true});await fs.writeFile(`${out}/${row.id}/cut_geometry.json`,JSON.stringify(solutionJSON(after),null,2)+'\n');await fs.writeFile(`${out}/${row.id}/before.png`,a.png);await fs.writeFile(`${out}/${row.id}/after.png`,b.png);}
 }catch(error){row.failure=error.stack;row.passed=false;}
 if(!row.passed)process.exitCode=1;
 console.log(JSON.stringify(row));await fs.writeFile(`${out}/results.json`,JSON.stringify(report,null,2)+'\n');
}
if(!cases.length)throw new Error('No cleanup cases selected');
