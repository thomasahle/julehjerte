/** Independently inspect records made by diagnostics/checkpoint-policy-observer.
 * Usage: node scripts/inverse/checkpoint-policy-audit.mjs RECORD.json.gz [--fixed]
 * Fixed-work mode replays every clearance trajectory for all 150 requested
 * steps, then compares policies on the exact same coordinates, outside timers.
 */
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fitGrid,gridMask,gridPaths,mismatch} from '../../static/inverse/core/direct/grid.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {referenceError} from '../../static/inverse/core/image-reference.js';
import {imageFeatures,auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {settings} from '../../static/inverse/core/settings.js';
import {renderExportedWeave} from './export-renderer.mjs';

const typed={Uint8Array,Float32Array,Float64Array,Int32Array,Uint16Array,Uint32Array};
const file=process.argv[2],record=JSON.parse(gunzipSync(await fs.readFile(file)),(_key,value)=>value?.typed&&typed[value.typed]?typed[value.typed].from(value.values):value);
const result={file,revision:record.revision,fits:[],clearance:[]};
for(const [index,fit]of record.fits.entries()){
 const solution=loadSolutionJSON(fit.geometry);solution.report=fit.report.solver;
 const cfg=verifiedPaperSettings(solution,settings(fit.settings)),geometry=validate(solution,cfg,{checkImage:false,finalGeometry:true});
 const paper=finalMaterialAudit(solution,cfg),rendered=await renderExportedWeave(fit.geometry,fit.source.resolution);
 const features=auditFeatureFidelity(fit.source,rendered.mask,cfg);
 result.fits.push({index,kind:fit.kind,sourceSha256:createHash('sha256').update(fit.source.mask).digest('hex'),resolution:fit.source.resolution,
  error:referenceError(fit.source,rendered.mask).mismatchFraction,geometry:geometry.passed,issues:geometry.issues,paper:paper.status??paper.summary.status,features:features.passed,
  featureRegions:features.regions,templateChecksPassed:fit.report.templateChecksPassed,solverSeconds:fit.report.solver.seconds,
  selectedInitialization:fit.report.solver.selectedInitialization,selectedCounts:fit.report.solver.selectedCounts});
}
if(process.argv.includes('--fixed'))await loadBoundaryKernel();
for(const [index,stage]of record.clearance.entries()){
 const {options,cfg,source,selected}=stage,features=imageFeatures(source,cfg.width);
 const row={index,selected,milliseconds:stage.milliseconds,preferenceMilliseconds:stage.checkpoints.reduce((s,c)=>s+c.preferenceMilliseconds,0),completedSteps:stage.result.steps};
 if(process.argv.includes('--fixed')){
  const snapshots=[],{prob,size,counts,phase,...rest}=options;
  const started=performance.now();
  fitGrid(prob,size,counts,phase,{...rest,deadline:Infinity,preferCheckpoint:p=>{snapshots.push({...p,model:{...p.model,z:p.model.z.slice()}});return true;}});
  row.fixedMilliseconds=performance.now()-started;
  row.checkpoints=snapshots.map((p,checkpoint)=>{
   const mask=gridMask(p.model,source.resolution,p.phase,p.floor),fidelity=auditFeatureFidelity(source,mask,cfg,features),colours=auditImageFeatures(source,mask,cfg.width,features).passed;
   const graph=new CurveGraph(gridPaths(p.model,cfg.width,p.floor),cfg.width),validation=validate(graph.solution(graph.points,p.phase),cfg,{checkImage:false,finalGeometry:true});
   const featureSeed=['feature-weighted-grid','feature-preserving-grid','feature-sampling-grid','fitted-boundary-rerouting'].includes(selected.seed);
   const retained=fidelity.regions.every(r=>r.retainedFraction>=fidelity.minimumRetention);
   return{checkpoint,error:mismatch(gridMask(p.model,size,p.phase,p.floor),prob,rest.weights),sourceError:referenceError(source,mask).mismatchFraction,
    geometry:validation.passed,issues:validation.issues.map(i=>i.type),features:fidelity.passed,colours,
    oldPriority:featureSeed?Number(colours):1,newPriority:featureSeed?4*Number(fidelity.passed)+2*Number(retained)+Number(validation.passed):6+Number(validation.passed),
    sha256:createHash('sha256').update(new Uint8Array(p.model.z.buffer)).digest('hex')};
  });
  const select=key=>row.checkpoints.reduce((best,c)=>!best||c[key]>best[key]||c[key]===best[key]&&c.error<best.error?c:best,null);
  row.oldSelected=select('oldPriority');row.newSelected=select('newPriority');
  row.actualSha256=createHash('sha256').update(new Uint8Array(stage.result.model.z.buffer)).digest('hex');
  row.matchesOldFixedSelection=row.actualSha256===row.oldSelected.sha256;
  row.matchesNewFixedSelection=row.actualSha256===row.newSelected.sha256;
 }
 result.clearance.push(row);
}
const destination=file.replace(/\.json\.gz$/,'.audit.json');
await fs.writeFile(destination,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({file,destination,fits:result.fits.map(({featureRegions:_regions,issues:_issues,...r})=>r),clearance:result.clearance.map(({checkpoints:_checkpoints,...r})=>r)}));
