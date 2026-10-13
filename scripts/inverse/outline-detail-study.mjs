/** Fixed-input diagnosis of missing outline detail and blocked refinement.
 * Replay a pinned fitter, then compare independent parameterization changes.
 * No saved fit or ground-truth template enters the fresh baseline solve.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {outlineDetailPlan} from '../../static/inverse/core/direct/outline-details.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.output,'Use --output=<new directory>');
const output=args.output,sourceRef=execFileSync('git',['rev-parse','--verify','--end-of-options',(args['source-ref']||'4fc1c2d')+'^{commit}'],{encoding:'utf8'}).trim();
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceHashes={};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
for(const file of execFileSync('git',['ls-tree','-r','--name-only',sourceRef,'--','static/inverse'],{encoding:'utf8'}).trim().split('\n')){
  assert.ok(file.startsWith('static/inverse/'));
  const bytes=execFileSync('git',['show',sourceRef+':'+file],{maxBuffer:16*1024*1024}),destination=output+'/inverse/'+file.slice('static/inverse/'.length);
  await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes);sourceHashes[file]=hash(bytes);
}
// Snapshot only selected stages, without changing their optimization choices.
// Serialization overhead may still affect a time-bounded baseline; report it.
const replace=(s,a,b)=>{assert.equal(s.split(a).length,2,`Changed instrumentation site: ${a}`);return s.replace(a,b);};
await fs.writeFile(output+'/inverse/diagnostic.js',"import {solutionJSON} from './core/graph.js'; export const snapshots=[]; export const capture=(name,s)=>snapshots.push({name,geometry:JSON.stringify(solutionJSON(s))});");
const patches={};
for(const file of ['fit.js','finalize.js']){
  const p=output+'/inverse/core/direct/'+file;let code="import {capture} from '../../diagnostic.js';\n"+await fs.readFile(p,'utf8');
  if(file==='fit.js'){
    const needle='    const prepared={clear,graph,protectedObjective,objectiveProb,objectiveWeights,refinementCfg,verification};';
    code=replace(code,needle,"    capture('clearance-'+selected.seed,graph.solution(graph.points,clear.phase,input));\n"+needle);
    code=replace(code,'  const addCandidate=c=>{',"  const addCandidate=c=>{\n    capture('refinement-'+c.seed,c.graph.solution(c.points,c.phase,input));");
  }else{
    code=replace(code,'  cfg=verifiedPaperSettings(solution,cfg);',"  capture('pre-finalization',solution);\n  cfg=verifiedPaperSettings(solution,cfg);");
    for(const name of ['independent','matching','repaired','shared','primitives','aligned','simplified','result']){
      const line=code.split('\n').find(l=>l.startsWith('  const '+name+'='));assert.ok(line,name);
      code=replace(code,line,line+`\n  capture('final-${name}',${name});`);
    }
  }
  await fs.writeFile(p,code);patches['core/direct/'+file]=hash(code);
}
const load=file=>import(pathToFileURL(path.resolve(output+'/inverse/'+file)).href);
const {prepare,design}=await load('core/engine.js'),{settings}=await load('core/settings.js'),{AUTOMATIC_PRESET}=await load('core/presets.js');
const {snapshots}=await load('diagnostic.js'),{Cubic}=await load('core/bezier.js'),{CurveGraph}=await load('core/direct/curves.js');
const {loadSolutionJSON,solutionJSON,curvesOf}=await load('core/graph.js'),{validate}=await load('core/validate.js'),{materialAudit}=await load('core/material.js');
const {refineCurves,curvePenalty}=await load('core/direct/refine.js'),{resizeObjective}=await load('core/direct/image-objective.js'),{mismatch}=await load('core/direct/grid.js');
const fixtureFile='scripts/inverse/fixtures/photographic-near-miss-seed.json',fixture=JSON.parse(await fs.readFile(fixtureFile));
const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
assert.equal(photo.fileSha256,fixture.sourceFileSha256);assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
const quad=fixture.quad.map(([x,y])=>[x,y+1]),cfg=settings({...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false}),input=prepare({...photo,quad},cfg).target,source=input.sourceImage;
assert.equal(hash(source.mask),fixture.translations.vertical.maskSha256);assert.equal(hash(new Uint8Array(source.probability.buffer)),fixture.translations.vertical.probabilitySha256);
const toolHashes={};
for(const file of [fixtureFile,'scripts/inverse/outline-detail-study.mjs','scripts/inverse/hard-photo-data.mjs','scripts/inverse/export-renderer.mjs','static/inverse/core/direct/outline-details.js'])toolHashes[file]=hash(await fs.readFile(file));
const start=performance.now(),answer=await design(input,cfg),baselineSeconds=(performance.now()-start)/1000;
snapshots.push({name:'export',geometry:answer.files['cut_geometry.json']});
const rows=[],report={sourceRef,sourceHashes,patches,toolHashes,cfg,quad,baselineSeconds,maskSha256:hash(source.mask),probabilitySha256:hash(new Uint8Array(source.probability.buffer)),baselineReport:answer.report,
  method:'Fresh fixed-photo baseline in an instrumented pinned source copy. Independent fixed-iteration continuations begin from its own exported pair. Exact subdivision changes sampling and regularizer normalization, measured separately. The manual sun window [60,50,230,225] is used only for reporting, never as an optimization input. This is one repeatedly inspected development image.',rows};
async function record(name,encoded,extra={}){
  const bytes=typeof encoded==='string'?encoded:JSON.stringify(encoded),solution=loadSolutionJSON(bytes),checks=[];
  for(const scale of [1,2]){
    const n=400*scale,reference=Uint8Array.from({length:n*n},(_,i)=>source.mask[Math.floor(Math.floor(i/n)/scale)*400+Math.floor((i%n)/scale)]),rendered=await renderExportedWeave(bytes,n);
    let wrong=0;for(let y=50*scale;y<225*scale;y++)for(let x=60*scale;x<230*scale;x++)wrong+=reference[y*n+x]!==rendered.mask[y*n+x];
    checks.push({resolution:n,error:mismatch(rendered.mask,reference),sunWindowError:wrong/(175*170*scale*scale)});
    if(scale===1)await fs.writeFile(output+'/'+name+'.png',rendered.png);
  }
  const geometry=validate(solution,cfg,{checkImage:false}),paper=geometry.passed?materialAudit(solution,cfg).summary:null;
  const row={name,checks,geometry,paper,geometrySha256:hash(bytes),...extra};rows.push(row);await fs.writeFile(output+'/'+name+'.json',bytes);
  await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({name,checks,geometry:geometry.passed,paper:paper?.status,seconds:row.seconds}));return row;
}
for(const [i,snapshot]of snapshots.entries())await record('stage-'+i+'-'+snapshot.name,snapshot.geometry);
const initial=loadSolutionJSON(answer.files['cut_geometry.json']),phase=initial.graph.target.phase?-1:1;
const original=new CurveGraph(initial.paths.map((family,f)=>family.map((_,i)=>curvesOf(initial,f,i).map(c=>c.p))),cfg.width);
const originalRaster=await renderExportedWeave(solutionJSON(original.solution(original.points,phase,input)),400);
const objective=resizeObjective(Float64Array.from(source.mask),400,400),steps=Number(args.steps||160);assert.ok(Number.isInteger(steps)&&steps>0&&steps<=1000);
for(const variant of [{name:'same',split:false,freeze:false},{name:'subdivide',split:true,freeze:false},{name:'fixed-border',split:false,freeze:true},{name:'subdivide-fixed-border',split:true,freeze:true},{name:'residual-detail',detail:true}]){
  let graph,maxSplitDeviationMm=0,plan;
  if(variant.detail){plan=outlineDetailPlan(original,original.points,phase,source,cfg);assert.ok(plan);graph=plan.graph;}
  else{
    const split=c=>{
      if(!variant.split||c.length()<=2*cfg.minWidth)return [c.p];
      const halves=c.split();for(let j=0;j<=32;j++){const t=j/32,k=t<=.5?0:1,a=c.point(t),b=halves[k].point(2*t-k);maxSplitDeviationMm=Math.max(maxSplitDeviationMm,Math.hypot(a[0]-b[0],a[1]-b[1]));}
      return halves.flatMap(split);
    };
    const pieces=original.controls().map(p=>split(new Cubic(p)));
    graph=new CurveGraph(original.families.map(f=>f.map(pi=>original.paths[pi].flatMap(([e,d])=>d===1?pieces[e]:pieces[e].toReversed().map(p=>p.toReversed())))),cfg.width);
    if(variant.freeze)for(let i=0;i<graph.points.length;i+=2)if(Math.min(graph.points[i],graph.points[i+1],cfg.width-graph.points[i],cfg.width-graph.points[i+1])<4*cfg.minWidth)graph.fixed[i]=graph.fixed[i+1]=1;
    assert.ok(maxSplitDeviationMm<1e-10);
  }
  const beforePenalty=curvePenalty(original,original.points,cfg).loss,afterPenalty=curvePenalty(graph,graph.points,cfg).loss;
  const initialRaster=await renderExportedWeave(solutionJSON(graph.solution(graph.points,phase,input)),400),initialRasterDrift=mismatch(initialRaster.mask,originalRaster.mask);
  // Independent antialiasing can cross the binary threshold after an exact
  // split; report that drift separately from any optimization improvement.
  assert.ok(initialRasterDrift<=.001,'Initial subdivision changed more than 0.1% of the independent raster');
  const started=performance.now(),fit=refineCurves(graph,objective.probability,400,phase,{...cfg,preferMatchingSheets:false},{input,steps,rate:.035,skipRepeatedRollbacks:true});
  await record(variant.name,solutionJSON(graph.solution(fit.points,phase,input)),{seconds:(performance.now()-started)/1000,variant,plan:plan?.report,steps:fit.steps,computedSteps:fit.computedSteps,edges:graph.edges.length,initialRasterDrift,maxSplitDeviationMm:variant.detail?null:maxSplitDeviationMm,beforePenalty,afterPenalty,checkpoints:fit.history});
}
assert.equal(hash(source.mask),report.maskSha256);assert.equal(hash(new Uint8Array(source.probability.buffer)),report.probabilitySha256);
