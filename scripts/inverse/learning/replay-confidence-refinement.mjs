/** Hold fitted topology fixed while comparing hard and continuous NN forces. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {prepare} from '../../../static/inverse/core/engine.js';
import {settings} from '../../../static/inverse/core/settings.js';
import {loadSolutionJSON,solutionJSON,curvesOf} from '../../../static/inverse/core/graph.js';
import {CurveGraph} from '../../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../../static/inverse/core/direct/refine.js';
import {matchingSummary} from '../../../static/inverse/core/direct/matching.js';
import {loadBoundaryKernel} from '../../../static/inverse/core/direct/native.js';
import {validate,sampleWeave} from '../../../static/inverse/core/validate.js';
import {finalMaterialAudit} from '../../../static/inverse/core/geometric-material.js';
import {referenceError} from '../../../static/inverse/core/image-reference.js';
import {auditFeatureFidelity,auditFeatureFidelityChange} from '../../../static/inverse/core/feature-shapes.js';
import {symmetryReport} from '../../../static/inverse/core/direct/symmetry.js';
import {templateSVG,previewSVG} from '../../../static/inverse/core/export.js';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.plan&&args.output&&Object.keys(args).every(k=>['plan','output'].includes(k)));
const hash=b=>createHash('sha256').update(b).digest('hex');
async function pinned(ref){const raw=await fs.readFile(ref.path);assert.equal(hash(raw),ref.sha256,ref.path);return raw;}
async function reference(file){return{path:file,sha256:hash(await fs.readFile(file))};}
const plan=JSON.parse(await fs.readFile(args.plan));
assert.equal(plan.schema,'native-confidence-refinement-plan-1');
assert.deepEqual(plan.methods,['hard','confidence']);assert.equal(plan.seedMethod,'hard');
assert.equal(plan.refinement.steps,160);assert.equal(plan.refinement.checkpointEvery,40);
assert.equal(plan.refinement.rate,.008);assert.equal(plan.refinement.selection,'mask');
const parent=JSON.parse(await pinned(plan.pipeline)),inputs=JSON.parse(await pinned(plan.input));
const fields=JSON.parse(await pinned(plan.fieldAudit));
assert.equal(parent.status,'complete');assert.equal(fields.status,'complete');
assert.equal(parent.targetMode,'native');assert.equal(parent.probeManifestSha256,plan.input.sha256);
assert.equal(fields.run.sha256,plan.pipeline.sha256);
assert.deepEqual(inputs.rows.map(r=>r.id),plan.expectedDevelopmentCases);
for(const [file,sha] of Object.entries(parent.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
const root=path.dirname(plan.pipeline.path),inputRoot=path.dirname(plan.input.path);
const started=performance.now(),sourceHashes={...parent.sourceHashes};
sourceHashes[new URL(import.meta.url).pathname]=hash(await fs.readFile(new URL(import.meta.url)));
const report={
 schema:'material-pair-pipeline-1',experiment:'native-confidence-refinement-1',status:'running',
 plan:await reference(args.plan),seedPipeline:plan.pipeline,fieldAudit:plan.fieldAudit,
 sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 configuration:parent.configuration,methods:plan.methods,targetMode:'native',
 probeManifestSha256:plan.input.sha256,sourceHashes,rows:[],
 scope:plan.scope,refinement:plan.refinement,
 order:'Rotate arms by photo index. Same seed geometry and 160 steps; no count search or clock cutoff. solveSeconds below measures only this additional continuation.',
};
await fs.mkdir(args.output);
async function save(){await fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');}
function checkTime(){assert.ok(performance.now()-started<plan.resources.maximumWallSeconds*1000,'Study wall-time cap');}
async function checkResources(){
 checkTime();const disk=await fs.statfs(args.output);
 assert.ok(disk.bavail*disk.bsize>=plan.resources.minimumFreeGiB*1024**3,'Free disk limit');
 const seen=new Set();let bytes=0;
 for(const name of await fs.readdir(args.output,{recursive:true})){
  const stat=await fs.stat(path.join(args.output,name));if(!stat.isFile())continue;
  const key=stat.dev+':'+stat.ino;if(seen.has(key))continue;seen.add(key);bytes+=stat.size;
 }
 assert.ok(bytes<plan.resources.maximumUniqueArtifactMiB*1024**2,'Artifact cap');
 report.uniqueArtifactBytes=bytes;
}
async function asset(row,name){
 const ref=row.assets[name];assert.ok(ref,name);
 const file=path.resolve(root,ref.path);assert.ok(file.startsWith(path.resolve(root)+path.sep));
 return{file,raw:await pinned({path:file,sha256:ref.sha256}),ref};
}
function floatField(raw,n){
 assert.equal(raw.length,n*n*4);
 return Float32Array.from({length:n*n},(_,i)=>raw.readFloatLE(4*i));
}
function floatHash(values){
 const raw=Buffer.alloc(values.length*4);
 for(let i=0;i<values.length;i++)raw.writeFloatLE(values[i],4*i);
 return hash(raw);
}
function nested(solution){
 return solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(c=>c.p)));
}
await save();
await loadBoundaryKernel();
try{
 for(const [index,entry] of inputs.rows.entries()){
  const pair=Object.fromEntries(plan.methods.map(method=>[method,parent.rows.find(r=>r.id===entry.id&&r.method===method)]));
  assert.ok(Object.values(pair).every(Boolean));const seed=pair[plan.seedMethod];
  const order=[...plan.methods.slice(index%2),...plan.methods.slice(0,index%2)];
  let common;
  if(seed.selectedCrop){
   assert.ok(seed.independentImage);const n=seed.resolution;
   const file=path.resolve(inputRoot,entry.assets.hard.mask.path);assert.ok(file.startsWith(path.resolve(inputRoot)+path.sep));
   const mask=new Uint8Array(await pinned({path:file,sha256:entry.assets.hard.mask.sha256}));
   assert.equal(mask.length,n*n);assert.equal(hash(mask),seed.targetMaskSha256);
   const validMask=seed.assets['observed.bin']?new Uint8Array((await asset(seed,'observed.bin')).raw):undefined;
   const cfg=settings(seed.report.settings);
   const input=prepare({type:'mask',mask,resolution:n,validMask},{...cfg,invert:false,removeSpecks:0,fillHoles:0}).target;
   assert.equal(hash(input.sourceImage.mask),seed.targetMaskSha256);
   assert.equal(floatHash(input.sourceImage.probability),seed.targetProbabilitySha256);
   const probability=floatField((await asset(pair.confidence,'fitting-probability.bin')).raw,n);
   assert.equal(floatHash(probability),pair.confidence.targetProbabilitySha256);
   for(let i=0;i<mask.length;i++)if(!validMask||validMask[i]){
    assert.equal(Number(probability[i]>.5),mask[i],'Native checkpoint masks must agree exactly');
   }
   const geometry=await asset(seed,'cut_geometry.json'),initial=loadSolutionJSON(geometry.raw.toString()),paths=nested(initial);
   const rendered=await renderExportedWeave(geometry.raw.toString(),n);
   assert.equal(referenceError(input.sourceImage,rendered.mask).mismatchFraction,seed.independentImage.mismatchFraction);
   const matching=matchingSummary(initial);
   common={n,cfg,input,probability,geometry,initial,paths,rendered,matching};
  }else assert.ok(Object.values(pair).every(r=>r.status==='crop-unresolved'));
  for(const method of order){
   const row={id:entry.id,method,targetMode:'native',source:seed.source,sourceSha256:seed.sourceSha256,
    assets:{},cropStatus:seed.cropStatus,supported:seed.supported,cropReused:true,
    ...(seed.selectedCrop?{selectedCrop:seed.selectedCrop,resolution:seed.resolution,
     targetMaskSha256:seed.targetMaskSha256,observedPixels:seed.observedPixels}:{}),
    seedMethod:plan.seedMethod,originalSolveSeconds:seed.solveSeconds};
   report.rows.push(row);
   const folder=path.join(args.output,entry.id+'-'+method);await fs.mkdir(folder);
   const store=async(name,raw)=>{
    const file=path.join(folder,name);await fs.writeFile(file,raw);
    row.assets[name]={path:path.relative(args.output,file),sha256:hash(raw)};
   };
   const link=async(from,name,destination=name)=>{
    const value=await asset(from,name),file=path.join(folder,destination);
    await fs.link(value.file,file);row.assets[destination]={path:path.relative(args.output,file),sha256:value.ref.sha256};
   };
   try{
    await link(seed,'detection.json');
    if(!common){row.status='crop-unresolved';continue;}
    const {n,cfg,input,probability,geometry,initial,paths,rendered,matching}=common,source=input.sourceImage;
    for(const name of ['crop.png','mask.png',...(seed.assets['observed.bin']?['observed.bin']:[])])await link(seed,name);
    await link(seed,'cut_geometry.json','seed_geometry.json');await link(seed,'woven.png','seed_woven.png');
    row.targetProbabilitySha256=pair[method].targetProbabilitySha256;
    if(method==='confidence'){
     await link(pair.confidence,'fitting-probability.bin');
     row.nativeConfidence=pair.confidence.nativeConfidence;
    }
    row.seed={geometrySha256:geometry.ref.sha256,maskError:seed.independentImage.mismatchFraction,
     checkedPair:seed.checkedPair,counts:initial.paths.map(f=>f.length),phase:initial.graph.target.phase,
     matching,configurationSha256:hash(JSON.stringify(cfg))};
    const graph=new CurveGraph(structuredClone(paths),cfg.width),before=graph.points.slice(),fixed=graph.fixed.slice();
    assert.deepEqual(graph.nested(),paths,'Reconstruction must not move initial controls');
    assert.ok(graph.edges.length<=500,'Bound this diagnostic to the existing cohort');
    const phase=initial.graph.target.phase?-1:1;
    const rebuilt=await renderExportedWeave(solutionJSON(graph.solution(graph.points,phase,input)),n);
    assert.deepEqual(rebuilt.mask,rendered.mask,'Initial exported weave must replay exactly');
    const fitTarget=method==='hard'?source.probability:probability;
    assert.equal(floatHash(fitTarget),row.targetProbabilitySha256);
    const began=performance.now();
    const fit=refineCurves(graph,fitTarget,n,phase,cfg,{
     input,steps:plan.refinement.steps,checkpointEvery:plan.refinement.checkpointEvery,
     rate:plan.refinement.rate,selection:plan.refinement.selection,
     weights:source.weights,identicalSheets:matching.identical,paperAudit:finalMaterialAudit,
     onProgress:()=>checkTime(),
    });
    row.solveSeconds=(performance.now()-began)/1000;
    assert.equal(fit.steps,160);assert.equal(fit.computedSteps,160);assert.equal(fit.skippedSteps,0);
    assert.deepEqual(graph.points,before);assert.deepEqual(graph.fixed,fixed);
    const solution=graph.solution(fit.points,phase,input),selected=solutionJSON(solution);
    assert.deepEqual(solution.paths.map(f=>f.length),row.seed.counts);assert.equal(selected.phase,row.seed.phase);
    const check=validate(solution,cfg,{finalGeometry:true}),paper=finalMaterialAudit(solution,cfg);
    const engineMask=sampleWeave(solution,n),engineImage=referenceError(source,engineMask),engineFeatures=auditFeatureFidelity(source,engineMask,cfg);
    const templateChecksPassed=check.passed&&paper.passed&&engineFeatures.passed&&engineImage.mismatchFraction<=cfg.maxImageError;
    const independent=await renderExportedWeave(selected,n),afterMatching=matchingSummary(solution);
    if(matching.identical)assert.ok(afterMatching.identical,'Retain the existing matching-sheet constraint');
    row.independentImage=referenceError(source,independent.mask);
    row.independentFeatures=auditFeatureFidelity(source,independent.mask,cfg);
    row.featureChange=auditFeatureFidelityChange(source,rendered.mask,independent.mask,cfg);
    row.checkedPair=templateChecksPassed&&row.independentFeatures.passed&&row.independentImage.mismatchFraction<=cfg.maxImageError;
    row.status=row.checkedPair?'checked-derived-mask':'review-required';
    row.seedImageChange=row.independentImage.mismatchFraction-row.seed.maskError;
    row.report={settings:cfg,templateExportAllowed:true,templateChecksPassed,
     slits:{left:solution.paths[1].length,right:solution.paths[0].length},
     validation:check,manufacturing:paper.summary,symmetry:symmetryReport(solution,cfg.symmetry),
     imageError:engineImage,imageFidelity:{passed:engineFeatures.passed&&engineImage.mismatchFraction<=cfg.maxImageError,features:engineFeatures},
     solver:{algorithm:'fixed-topology-confidence-continuation',steps:fit.steps,computedSteps:fit.computedSteps,
      skippedSteps:fit.skippedSteps,history:fit.history,matching:afterMatching},
     assurance:{physicalAssemblyTested:false,originalArtworkGroundTruth:false,freshEndToEndSolve:false}};
    await store('cut_geometry.json',JSON.stringify(selected,null,2)+'\n');
    await store('woven.png',independent.png);
    for(const [name,family] of [['template_left.svg',1],['template_right.svg',0]])
     await store(name,templateSVG(solution,family,cfg,{reviewNote:'Experimental continuation; inspect its validation report.'}));
    await store('weave_preview.svg',previewSVG(solution));
    assert.equal(hash(source.mask),row.targetMaskSha256);
    assert.equal(floatHash(source.probability),seed.targetProbabilitySha256);
    assert.equal(floatHash(probability),pair.confidence.targetProbabilitySha256);
   }catch(error){
    row.status='failed';row.error=error.message;
    // A failed invariant invalidates the experiment, rather than becoming an
    // ordinary hard photo that disappears from the reported denominator.
    if(error.code==='ERR_ASSERTION')throw error;
   }finally{
    await save();console.log(JSON.stringify({id:row.id,method,status:row.status,error:row.independentImage?.mismatchFraction,seconds:row.solveSeconds}));
   }
  }
  await checkResources();
 }
 for(const [file,sha] of Object.entries(sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
 report.summary=Object.fromEntries(plan.methods.map(method=>{
  const rows=report.rows.filter(r=>r.method===method);
  return[method,{attempted:rows.length,crops:rows.filter(r=>r.selectedCrop).length,
   supported:rows.filter(r=>r.supported).length,checkedPairs:rows.filter(r=>r.checkedPair).length}];
 }));
 report.status='complete';report.seconds=(performance.now()-started)/1000;await checkResources();await save();
 console.log(JSON.stringify(report.summary));
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
