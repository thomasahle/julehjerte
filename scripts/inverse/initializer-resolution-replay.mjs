/** Compare experimental initializer policies in isolated module snapshots.
 * No production files are edited. Every run starts from photograph pixels;
 * no prior fitted geometry or saved classification is used as input.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createCanvas} from 'canvas';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {mismatch} from '../../static/inverse/core/direct/grid.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const output=args.output,policies=(args.policies||'baseline,nearby').split(',');
const sourceRef=args['source-ref']?execFileSync('git',['rev-parse','--verify','--end-of-options',args['source-ref']+'^{commit}'],{encoding:'utf8'}).trim():null;
const cases=(args.cases||'original,horizontal,vertical,puppy-half').split(';');
// A semicolon separates cases because numeric crop offsets contain commas.
if(!args.cases)cases.splice(0,cases.length,'original','horizontal','vertical','puppy-half');
assert.ok(output,'Use --output=<new directory>');
assert.ok(policies.every(p=>['baseline','replace-feature','nearby'].includes(p)));
const offsets={original:[0,0],horizontal:[1,0],vertical:[0,1]};
for(const name of cases)if(name!=='puppy-half'&&!offsets[name]){
  offsets[name]=name.split(',').map(Number);
  assert.ok(offsets[name].length===2&&offsets[name].every(Number.isFinite));
}
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.mkdir(output); // Never silently overwrite a previous experiment.
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceFolder=output+'/source';
if(sourceRef){
  const files=execFileSync('git',['ls-tree','-r','--name-only',sourceRef,'--','static/inverse'],{encoding:'utf8'}).trim().split('\n');
  for(const file of files){
    assert.ok(file.startsWith('static/inverse/'));
    const destination=sourceFolder+'/'+file.slice('static/inverse/'.length);
    await fs.mkdir(path.dirname(destination),{recursive:true});
    await fs.writeFile(destination,execFileSync('git',['show',`${sourceRef}:${file}`],{maxBuffer:16*1024*1024}));
  }
}else await fs.cp('static/inverse',sourceFolder,{recursive:true});
const {AUTOMATIC_PRESET}=await import(pathToFileURL(path.resolve(sourceFolder+'/core/presets.js')).href);
const fixtureFiles=['scripts/inverse/fixtures/photographic-near-miss-seed.json','scripts/inverse/fixtures/photographic-puppy-fit.json'];
const fixtures=await Promise.all(fixtureFiles.map(async file=>JSON.parse(await fs.readFile(file))));
const photos=[];
for(const fixture of fixtures){
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
  assert.equal(photo.fileSha256,fixture.sourceFileSha256);assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);photos.push(photo);
}
const canvas=createCanvas(Math.round(photos[1].imageWidth/2),Math.round(photos[1].imageHeight/2)),ctx=canvas.getContext('2d');
ctx.drawImage(photos[1].canvas,0,0,canvas.width,canvas.height);
const puppy={type:'pixels',rgba:ctx.getImageData(0,0,canvas.width,canvas.height).data,imageWidth:canvas.width,imageHeight:canvas.height,quad:fixtures[1].quad.map(p=>p.map(v=>v/2))};
assert.equal(sha(puppy.rgba),'c59764172b1293df526a5326bb54ba4085b73d6314f28b48e9cfc3be77006d71');
const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false},sourceHashes={},rows=[],snapshots=[];
for(const name of await fs.readdir(sourceFolder,{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){
  const file='static/inverse/'+name;sourceHashes[file]=sha(await fs.readFile(sourceFolder+'/'+name));
}
for(const file of [...fixtureFiles,'scripts/inverse/initializer-resolution-replay.mjs','scripts/inverse/export-renderer.mjs','scripts/inverse/hard-photo-data.mjs'])sourceHashes[file]=sha(await fs.readFile(file));
const ledger={method:'Fresh end-to-end image solves in isolated module copies. Baseline is the recorded source snapshot. replace-feature changes every feature-search DP grid to 98 samples. nearby adds 94/98-sample candidates only after a successful base-count near-miss rescue, preserving the original as an alternative. No acceptance threshold changes. Original-photo offsets are fixed before fitting. Four controls and six other translations are development evidence, not independent held-out motif families.',sourceRef,sourceFolder,cfg,policies,cases,fixtures,sourceHashes,snapshots,rows};
const replace=(text,old,next)=>{assert.equal(text.split(old).length,2,`Expected exactly one patch site: ${old}`);return text.replace(old,next);};
for(const policy of policies){
  const folder=output+'/'+policy;await fs.cp(sourceFolder,folder+'/inverse',{recursive:true});
  const changes={};
  if(policy!=='baseline'){
    const countsFile=folder+'/inverse/core/direct/counts.js',featuresFile=folder+'/inverse/core/direct/feature-seeds.js';
    let code=await fs.readFile(countsFile,'utf8');
    if(!code.includes('retainAlternatives=false,initializationResolution=96')){
      code=replace(code,'rounds=18,k=16,sharedWork=true,retainAlternatives=false','rounds=18,k=16,sharedWork=true,retainAlternatives=false,initializationResolution=96');
      code=replace(code,'fitter.initialize(o.counts,o.phase,{k,initial,scoreResolution:96,rounds})','fitter.initialize(o.counts,o.phase,{k,initial,resolution:initializationResolution,scoreResolution:96,rounds})');
      await fs.writeFile(countsFile,code);changes['core/direct/counts.js']=sha(code);
    }
    code=await fs.readFile(featuresFile,'utf8');
    if(policy==='replace-feature')code=replace(code,'{k,retainAlternatives:!protectFeatures&&k===16}','{k,retainAlternatives:!protectFeatures&&k===16,initializationResolution:98}');
    else{
      const needle='  if(!seeds.length){\n    // Each count/phase already tried uniform, border and separable starts.';
      code=replace(code,needle,`  if(coarseRefinement?.accepted&&seeds[0].model.counts.every((c,i)=>c===counts[i])){
    const incumbent=seeds[0],nearby=[],samplingAttempts=[];
    for(const initializationResolution of [94,98]){
      const result=initializeCounts({options:[{counts,phase:incumbent.phase}],fullProb,resolution,prob:weighted.probability,n,evidence,weights:weighted.weights,fullWeights},{initializationResolution});
      const seed=result.seeds[0];
      seed.error=mismatch(gridMask(seed.model,n,seed.phase,seed.floor),original.probability);
      seed.featuresPassed=auditImageFeatures(source,gridMask(seed.model,resolution,seed.phase,seed.floor),cfg.width,features).passed;
      const accepted=seed.featuresPassed&&seed.error<incumbent.error&&seed.error<=Math.min(.1,3*cfg.maxImageError);
      samplingAttempts.push({resolution:initializationResolution,error:seed.error,featuresPassed:seed.featuresPassed,accepted});
      if(accepted)nearby.push({...seed,seed:'feature-weighted-grid',initializationResolution});
    }
    if(nearby.length)seeds=[...nearby.sort((a,b)=>a.error-b.error),...seeds];
    report.samplingRefinement={incumbentError:incumbent.error,attempts:samplingAttempts,selectedResolution:seeds[0].initializationResolution||96};
  }
`+needle);
    }
    await fs.writeFile(featuresFile,code);changes['core/direct/feature-seeds.js']=sha(code);
  }
  // Verify every copied core module, including untouched modules and WASM.
  for(const [file,expected] of Object.entries(sourceHashes).filter(([file])=>file.startsWith('static/inverse/'))){
    const relative=file.slice('static/inverse/'.length);
    assert.equal(sha(await fs.readFile(folder+'/inverse/'+relative)),changes[relative]||expected);
  }
  snapshots.push({policy,changes});
  const {prepare,design}=await import(pathToFileURL(path.resolve(folder+'/inverse/core/engine.js')).href);
  for(const name of cases){
    const quad=name==='puppy-half'?puppy.quad:fixtures[0].quad.map(p=>p.map((v,i)=>v+offsets[name][i]));
    let prepared=prepare(name==='puppy-half'?puppy:{...photos[0],quad},cfg);
    if(name==='puppy-half')prepared=prepare({type:'mask',mask:prepared.preview.mask,resolution:prepared.preview.resolution},cfg);
    const source=prepared.target.sourceImage,maskSha256=sha(source.mask),probabilitySha256=sha(new Uint8Array(source.probability.buffer));
    const previous=rows.find(r=>r.name===name);
    if(previous){assert.equal(maskSha256,previous.maskSha256);assert.equal(probabilitySha256,previous.probabilitySha256);assert.deepEqual(quad,previous.quad);}
    const started=performance.now(),answer=await design(prepared.target,cfg),seconds=(performance.now()-started)/1000;
    const exported=answer.files['cut_geometry.json'],checks=[];
    for(const scale of [1,2]){
      const size=source.resolution*scale,mask=Uint8Array.from({length:size*size},(_,i)=>source.mask[Math.floor(Math.floor(i/size)/scale)*source.resolution+Math.floor((i%size)/scale)]);
      const rendered=await renderExportedWeave(exported,size),error=mismatch(rendered.mask,mask),features=auditFeatureFidelity({resolution:size,mask},rendered.mask,answer.report.settings);
      checks.push({resolution:size,error,features});
      if(scale===1)await fs.writeFile(folder+'/'+name+'.png',rendered.png);
    }
    const geometryFile=folder+'/'+name+'.json',bytes=typeof exported==='string'?exported:JSON.stringify(exported);
    await fs.writeFile(geometryFile,bytes);
    assert.equal(sha(source.mask),maskSha256);assert.equal(sha(new Uint8Array(source.probability.buffer)),probabilitySha256);
    const passed=answer.report.templateChecksPassed&&checks.every(c=>c.error<=answer.report.settings.maxImageError&&c.features.passed);
    rows.push({policy,name,quad,maskSha256,probabilitySha256,seconds,checks,passed,report:answer.report,geometryFile,geometrySha256:sha(bytes)});
    await fs.writeFile(output+'/results.json',JSON.stringify(ledger,null,2));
    console.log(JSON.stringify({policy,name,seconds,errors:checks.map(c=>c.error),features:checks.map(c=>c.features.passed),templateChecksPassed:answer.report.templateChecksPassed,passed,sampling:answer.report.solver.earlyFeatureInitialization?.samplingRefinement}));
  }
}
