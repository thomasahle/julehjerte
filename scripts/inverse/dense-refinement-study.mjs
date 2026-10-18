/** Isolate count-preserving refinement after a real photograph fit.
 * Inputs are frozen benchmark crops and the fitter's own exported candidates,
 * never published cutting templates. Fixed iterations are diagnostic only.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {loadSolutionJSON,solutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {refineCurves,curvePenalty} from '../../static/inverse/core/direct/refine.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {mismatch} from '../../static/inverse/core/direct/grid.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const run=args.run||'tmp/dense-diagnosis-hard25',output=args.output||'tmp/dense-refinement-study',ids=(args.ids||'floral-checker,warped-checker,fine-checker').split(',');
await fs.mkdir(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),benchmarkBytes=await fs.readFile(run+'/results.json'),benchmark=JSON.parse(benchmarkBytes);
const sourceHashes={};for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name))sourceHashes['static/inverse/core/'+name]=hash(await fs.readFile('static/inverse/core/'+name));
sourceHashes['scripts/inverse/dense-refinement-study.mjs']=hash(await fs.readFile('scripts/inverse/dense-refinement-study.mjs'));
const report={run,benchmarkSha256:hash(benchmarkBytes),sourceHashes,method:'Same original pixels, fixed crop and slit counts. Independent continuations of a saved image-derived fit. Splitting changes regularizer sampling/normalization and initial corner recognition too; costs and shape drift are measured.',rows:[]};
await loadNumericalKernel();
for(const id of ids){
  const entry=benchmark.results.find(r=>r.id===id);assert.ok(entry);
  const previous=entry.runs.find(r=>r.preset==='automatic'),cfg=settings({...AUTOMATIC_PRESET,...previous.settings,preferMatchingSheets:false});
  const photo=await readHardPhoto(entry),crop=prepare({...photo,quad:entry.effectiveQuad},cfg),input=prepare({type:'mask',mask:crop.preview.mask,resolution:crop.preview.resolution},cfg).target,source=input.sourceImage;
  assert.equal(hash(source.mask),previous.fittingMaskSha256);
  assert.equal(hash(new Uint8Array(source.probability.buffer)),previous.fittingProbabilitySha256);
  const bytes=await fs.readFile(`${run}/${id}/automatic/cut_geometry.json`),solution=loadSolutionJSON(bytes.toString()),phase=solution.graph.target.phase?-1:1;
  const original=new CurveGraph(solution.paths.map((f,i)=>f.map((_,j)=>curvesOf(solution,i,j).map(c=>c.p))),cfg.width);
  const baseline=await renderExportedWeave(bytes.toString(),source.resolution),objective=resizeObjective(source.probability,source.resolution,256);
  for(const variant of [{name:'continue-360',split:false,resolution:360},{name:'continue-700',split:false,resolution:700},{name:'split-700',split:true,resolution:700}]){
    const start=performance.now();let maximumSplitDeviationMm=0;
    const pieces=original.controls().map(p=>{
      const curve=new Cubic(p);if(!variant.split||curve.length()<=4)return [p];
      const halves=curve.split();
      for(let j=0;j<=32;j++){const t=j/32,k=t<=.5?0:1,a=curve.point(t),b=halves[k].point(2*t-k);maximumSplitDeviationMm=Math.max(maximumSplitDeviationMm,Math.hypot(a[0]-b[0],a[1]-b[1]));}
      return halves.map(c=>c.p);
    });
    assert.ok(maximumSplitDeviationMm<1e-9,'Subdivision must retain curve positions in physical units');
    const graph=new CurveGraph(original.families.map(f=>f.map(pi=>original.paths[pi].flatMap(([e,d])=>d===1?pieces[e]:pieces[e].toReversed().map(p=>p.toReversed())))),cfg.width);
    const initial=await renderExportedWeave(solutionJSON(graph.solution(graph.points,phase,input)),source.resolution),drift=mismatch(initial.mask,baseline.mask);
    assert.ok(drift<=.001,'Subdivision raster drift must remain below 0.1%: '+drift);
    const options={...cfg,materialResolution:variant.resolution},beforePenalty=curvePenalty(original,original.points,options).loss,afterPenalty=curvePenalty(graph,graph.points,options).loss;
    let uncertain=null;
    const fit=refineCurves(graph,objective.probability,256,phase,options,{input,steps:Number(args.steps||600),rate:.035,onProgress:(r,s)=>{
      if(r.geometry&&r.paper==='uncertain'&&(!uncertain||r.score<uncertain.checkpoint.score))uncertain={checkpoint:r,geometry:solutionJSON(s)};
    }});
    let uncertainAudit=null;
    if(uncertain){
      const proposed=loadSolutionJSON(uncertain.geometry),image=await renderExportedWeave(uncertain.geometry,source.resolution),paper=materialAudit(proposed,{...cfg,materialResolution:700}).summary;
      uncertainAudit={checkpoint:uncertain.checkpoint,error:mismatch(image.mask,source.mask),paper,features:auditImageFeatures(source,image.mask)};
      await fs.writeFile(`${output}/${id}-${variant.name}-uncertain.json`,JSON.stringify(uncertain.geometry));
    }
    const result=graph.solution(fit.points,phase,input),geometry=validate(result,cfg),paper=geometry.passed?materialAudit(result,{...cfg,materialResolution:700}).summary:null,rendered=await renderExportedWeave(solutionJSON(result),source.resolution);
    const row={id,variant,uncertainAudit,baselineError:mismatch(baseline.mask,source.mask),error:mismatch(rendered.mask,source.mask),edgesBefore:original.edges.length,edgesAfter:graph.edges.length,maximumSplitDeviationMm,drift,beforePenalty,afterPenalty,geometry,paper,features:auditImageFeatures(source,rendered.mask),seconds:(performance.now()-start)/1000,history:fit.history,geometrySha256:hash(bytes),maskSha256:hash(source.mask),quad:entry.effectiveQuad};
    report.rows.push(row);await fs.writeFile(`${output}/${id}-${variant.name}.json`,JSON.stringify(solutionJSON(result)));await fs.writeFile(`${output}/${id}-${variant.name}.png`,rendered.png);
    await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...row,history:undefined,uncertainAudit:uncertainAudit&&{error:uncertainAudit.error,paper:uncertainAudit.paper.status,features:uncertainAudit.features.passed},geometry:geometry.passed,paper:paper?.status,features:row.features.passed}));
  }
}
