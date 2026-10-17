import { benchmarkArtifactEntries } from './benchmark-artifacts.mjs';
/** Replay image-derived diagnostic starts with ordinary physical checks.
 * Initialization timings are recorded separately, not hidden in solve timings.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare,finish} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {fitDirect} from '../../static/inverse/core/direct/fit.js';
import {imageFeatures,auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {mismatch} from '../../static/inverse/core/direct/grid.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const sourceDir=args.seeds||'tmp/bird-initialization-study',output=args.output||'tmp/bird-refinement-study';
const ids=(args.ids||'unweighted-0,missing-16-1,missing-64-2,eye-16-0,eye-64-1').split(',');
const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-bird-fit.json')),catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
const photo=await readHardPhoto(catalogue.source),cfg=settings({...AUTOMATIC_PRESET,timeLimit:Number(args.seconds||25),trials:0,earlyStop:false,preferMatchingSheets:false});
const crop=prepare({...photo,quad:fixture.quad},cfg),input=prepare({type:'mask',mask:crop.preview.mask,resolution:400},cfg).target,source=input.sourceImage;
const hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(source.mask),fixture.maskSha256);
const bytes=await fs.readFile(sourceDir+'/seeds.json'),seeds=JSON.parse(bytes),initialization=JSON.parse(await fs.readFile(sourceDir+'/results.json'));
assert.equal(initialization.fixture.maskSha256,fixture.maskSha256);
const sourceHashes={};for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){const file='static/inverse/core/'+name;sourceHashes[file]=hash(await fs.readFile(file));}
sourceHashes['scripts/inverse/bird-refinement-study.mjs']=hash(await fs.readFile('scripts/inverse/bird-refinement-study.mjs'));
await fs.mkdir(output,{recursive:true});const results=[],features=imageFeatures(source,cfg.width);
for(const id of ids){
 const entry=seeds.find(s=>s.id===id);assert.ok(entry,'Unknown initializer '+id);
 const start=performance.now(),row={id,initializer:entry.summary,policy:entry.policy,initializationSweepSeconds:initialization.rows.find(r=>r.policy.name===entry.policy.name).seconds};results.push(row);
 try{
  const solution=await fitDirect(input,cfg,()=>{},{countSearch:()=>({seeds:[{...entry.seed,error:entry.summary.error,model:{...entry.seed.model,z:Float64Array.from(entry.seed.model.z)},seed:'diagnostic-'+id}],report:{strategy:'isolated image-derived diagnostic start',id}})});
  const answer=finish(solution,cfg),rendered=await renderExportedWeave(answer.files['cut_geometry.json'],400);
  row.seconds=(performance.now()-start)/1000;row.error=mismatch(rendered.mask,source.mask);row.features=auditImageFeatures(source,rendered.mask,cfg.width,features);row.geometry=answer.report.validation;row.paper=answer.report.manufacturing;row.passed=answer.report.templateChecksPassed&&row.features.passed&&row.error<=.03;row.solver=answer.report.solver;
  const dir=output+'/'+id;await fs.mkdir(dir,{recursive:true});for(const [file,data]of benchmarkArtifactEntries(answer.files))await fs.writeFile(dir+'/'+file,data);await fs.writeFile(dir+'/woven.png',rendered.png);
 }catch(error){row.errorMessage=error.message;row.failure=error.report;row.seconds=(performance.now()-start)/1000;}
 await fs.writeFile(output+'/results.json',JSON.stringify({fixture,cfg,seedFileSha256:hash(bytes),sourceHashes,method:'Each precomputed image-derived grid initializes a fresh fit; its full 128-hypothesis sweep time is separate. Other production fallback and cleanup policies remain enabled. No target/reference cutting paths.',results},null,2));
 console.log(JSON.stringify({id,seconds:row.seconds,error:row.error,features:row.features?.regions.map(r=>r.retainedFraction),geometry:row.geometry?.passed,paper:row.paper?.status,passed:row.passed,failure:row.errorMessage}));
}
