/** Fixed photograph-only inputs. Baseline errors are used only after fitting. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {cpus} from 'node:os';
import {createCanvas,loadImage} from 'canvas';
import {prepare,design,finish} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {DIRECT_PRESET} from '../../src/lib/inverse/presets.js';
import {auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {renderExportedWeave} from './export-renderer.mjs';

const catalog=JSON.parse(await fs.readFile('scripts/inverse/fixtures/hunodan/speed-crops.json'));
const baseline=JSON.parse(await fs.readFile('docs/inverse/HUNODAN-VALIDATION.json'));
const experiment=process.env.INVERSE_SPEED_MODULE;
const fitter=experiment?(await import(pathToFileURL(experiment).href)).fitDirect:null;
const cfg={...DIRECT_PRESET,timeLimit:Number(process.env.INVERSE_SPEED_SECONDS||10),trials:0,earlyStop:false,...JSON.parse(process.env.INVERSE_SPEED_SETTINGS||'{}')};
const out=process.env.INVERSE_SPEED_OUT||`tmp/inverse-speed/${new Date().toISOString().replace(/[:.]/g,'-')}`;
await fs.mkdir(out,{recursive:true});
const results=[],hash=v=>createHash('sha256').update(v).digest('hex');
const engineSha256={};
for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){
  const file=`static/inverse/core/${name}`;engineSha256[file]=hash(await fs.readFile(file));
}
if(experiment)engineSha256[experiment]=hash(await fs.readFile(experiment));
const report={experiment:experiment||'production',cfg,engineSha256,baselineSha256:hash(await fs.readFile('docs/inverse/HUNODAN-VALIDATION.json')),criteria:'Each prepare + solve + validate + export <=10 seconds; independent error <= that case’s validated release error; unchanged geometry, strict paper and substantial feature checks. Decode and independent external replay are timed separately.',runtime:process.version,platform:process.platform,cpu:cpus()[0]?.model,results};
for(const e of catalog.cases){
  if(process.env.INVERSE_HUNODAN_IDS&&!process.env.INVERSE_HUNODAN_IDS.split(',').includes(e.id))continue;
  const r={id:e.id};results.push(r);
  try{
    const decoded=performance.now(),bytes=await fs.readFile(e.source);if(hash(bytes)!==e.sourceSha256)throw new Error('Source photograph checksum differs');
    const im=await loadImage(bytes),[x,y,x1,y1]=e.photoROI,c=createCanvas(x1-x,y1-y),ctx=c.getContext('2d');ctx.drawImage(im,-x,-y);
    const input={type:'pixels',imageWidth:c.width,imageHeight:c.height,rgba:ctx.getImageData(0,0,c.width,c.height).data,quad:e.quad};
    if(hash(input.rgba)!==e.decodedPixelsSha256)throw new Error('Decoded photograph pixels differ from frozen baseline');
    r.decodeSeconds=(performance.now()-decoded)/1000;
    const start=performance.now(),p=prepare(input,cfg),prepared=performance.now();r.prepareSeconds=(prepared-start)/1000;
    const answer=fitter?finish(await fitter(p.target,settings(cfg)),settings(cfg)):await design(p.target,cfg);
    r.seconds=(performance.now()-start)/1000;r.solver=answer.report.solver;r.postprocessSeconds=answer.report.postprocessSeconds;
    r.exportAllowed=answer.report.templateExportAllowed;
    const replayStart=performance.now(),woven=await renderExportedWeave(answer.files['cut_geometry.json'],p.preview.resolution);
    r.error=woven.mask.reduce((s,v,i)=>s+Number(v!==p.preview.mask[i]),0)/woven.mask.length;
    r.features=auditImageFeatures(p.target.sourceImage,woven.mask,cfg.width||100);r.externalReplaySeconds=(performance.now()-replayStart)/1000;
    r.baselineError=baseline.results.find(b=>b.id===e.id).independentImageError;
    r.qualityPassed=r.exportAllowed&&r.features.passed&&r.error<=r.baselineError+1e-12;r.speedPassed=r.seconds<=10;r.passed=r.qualityPassed&&r.speedPassed;
    const dir=`${out}/${e.id}`;await fs.mkdir(dir,{recursive:true});
    for(const[name,data]of Object.entries(answer.files))await fs.writeFile(`${dir}/${name}`,data);
    await fs.writeFile(`${dir}/independent.png`,woven.png);
  }catch(error){r.passed=false;r.failure=error.message;r.failureReport=error.report;}
  console.log(e.id,JSON.stringify({seconds:r.seconds,error:r.error,baseline:r.baselineError,quality:r.qualityPassed,passed:r.passed,failure:r.failure}));
  await fs.writeFile(`${out}/results.json`,JSON.stringify(report,null,2));
}
console.log(out);
