/** Compare every initialized candidate with the committed pre-cache engine.
 * Prepared crops and masks are fixed; no fitted cutting paths enter either run.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {cpus} from 'node:os';
import {createCanvas,loadImage} from 'canvas';
import {readCase,hash} from './count-strategy-data.mjs';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {initializationMask,sourceWeights} from '../../static/inverse/core/image-reference.js';
import {initializeCounts,borderEvidence,countHypotheses} from '../../static/inverse/core/direct/counts.js';
import {orbitObjective,orbitMean,symmetryOrbit} from '../../static/inverse/core/direct/symmetry.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {shapeCells} from '../../src/lib/paint/frame.ts';

const arg=name=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3);
const corpus=arg('corpus')||'tmp/initialization-corpus',weightedRoot=arg('weighted')||'tmp/phase-robustness-final',browserRoot=arg('browser')||'tmp/phase-browser-final',out=arg('output')||'tmp/initialization-image',reference=arg('reference')||'2243708';
const direct=path.resolve('static/inverse/core/direct'),url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const show=file=>execFileSync('git',['show',`${reference}:${file}`],{encoding:'utf8'});
// The baseline gets its original initializer and count search. All numerical
// dependencies must still equal that commit, so this cannot silently compare
// two callers of a helper changed after the reference was recorded.
for(const name of ['grid.js','math.js','image-objective.js','symmetry.js']){
  const file=`static/inverse/core/direct/${name}`;if(hash(await fs.readFile(file))!==hash(show(file)))throw new Error(`Baseline dependency changed: ${file}`);
}
const baselineInit=url(show('static/inverse/core/direct/initialize.js').replace(/from '(\.[^']+)'/g,(_,p)=>`from '${pathToFileURL(path.resolve(direct,p)).href}'`));
const baselineCounts=url(show('static/inverse/core/direct/counts.js').replace(/from '(\.[^']+)'/g,(_,p)=>`from '${p==='./initialize.js'?baselineInit:pathToFileURL(path.resolve(direct,p)).href}'`));
const baseline=(await import(baselineCounts)).initializeCounts;
const manifest=JSON.parse(await fs.readFile(`${corpus}/manifest.json`)),weighted=JSON.parse(await fs.readFile(`${weightedRoot}/results.json`));
const cases=manifest.cases.map(e=>({id:e.id,group:e.group,sourceSha256:e.preparedSha256,load:async()=>({source:(await readCase(corpus,e)).sourceImage,cfg:settings(manifest.settings)})}));
for(const row of weighted.results){
  const suffix=row.variant==='original'?'':`-${row.variant}`,file=`${weightedRoot}/${row.shape}-${row.size}-weighted${suffix}/target.png`;
  cases.push({id:`${row.shape}-${row.size}-${row.variant}`,group:'weighted',sourceSha256:hash(await fs.readFile(file)),load:async()=>{
    const n=weighted.resolution,c=createCanvas(n,n),ctx=c.getContext('2d');ctx.drawImage(await loadImage(file),0,0);
    const rgba=ctx.getImageData(0,0,n,n).data,mask=Uint8Array.from({length:n*n},(_,i)=>Number(rgba[4*i]<128));
    return{source:{mask,probability:Float32Array.from(mask),resolution:n,weights:shapeCells({mode:'free',shape:'diamond',size:row.size},n)},cfg:settings({...AUTOMATIC_PRESET,timeLimit:10,trials:0})};
  }});
}
for(const name of ['house-free-small','hat-free-small','top-hat','top-hat-independent','hat-free','house-free']){
  const dir=`${browserRoot}/firefox-${name}`,file=`${dir}/prepared.json`;
  cases.push({id:`browser-${name}`,group:'uploaded-mask',sourceSha256:hash(await fs.readFile(file)),load:async()=>{
    const p=JSON.parse(await fs.readFile(file)),report=JSON.parse(await fs.readFile(`${dir}/engine-report.json`));
    return{source:{resolution:p.resolution,mask:Uint8Array.from(p.mask),probability:Float32Array.from(p.mask),weights:Float64Array.from(p.weights)},cfg:settings(report.settings)};
  }});
}
const context=({source,cfg})=>{
  const weights=sourceWeights(source),orbit=symmetryOrbit(cfg.symmetry),full=orbitObjective(source.probability,source.resolution,orbit,weights),n=Math.min(256,source.resolution),small=resizeObjective(full.probability,source.resolution,n,full.weights),rawGuide=weights?Float64Array.from(initializationMask(source)):null,guideProb=rawGuide&&orbit?orbitMean(rawGuide,source.resolution,orbit):rawGuide,evidence=borderEvidence(guideProb||full.probability,source.resolution);
  return{options:countHypotheses({prob:small.probability,n,cfg,evidence,weights:small.weights}),fullProb:full.probability,resolution:source.resolution,prob:small.probability,n,evidence,weights:small.weights,fullWeights:full.weights,guideProb};
};
const summarize=s=>({counts:s.model.counts,k:s.model.k,phase:s.phase,floor:s.floor,error:s.error,geometrySha256:hash(Buffer.from(s.model.z.buffer,s.model.z.byteOffset,s.model.z.byteLength)),rounds:s.initializationRounds,terminations:s.initializationTerminations,seedKind:s.seedKind});
const report={reference,gitCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runtime:process.version,cpu:cpus()[0]?.model,manifestSha256:hash(await fs.readFile(`${corpus}/manifest.json`)),method:'Fixed sources, every count/phase/layout, alternating policy order, serial replay. Coordinates, scores, initialization rounds, termination reasons and selected seed order must match exactly. Baseline numerical dependencies are checked against the reference commit.',sourceHashes:{},results:[]};
for(const name of await fs.readdir('static/inverse/core/direct'))if(name.endsWith('.js'))report.sourceHashes[name]=hash(await fs.readFile(`static/inverse/core/direct/${name}`));
await fs.mkdir(out,{recursive:true});
for(const [i,e] of cases.entries()){
  const input=context(await e.load()),row={id:e.id,group:e.group,sourceSha256:e.sourceSha256};
  for(const policy of i%2?['current','previous']:['previous','current']){
    const start=performance.now(),result=(policy==='current'?initializeCounts:baseline)(input);
    row[policy]={seconds:(performance.now()-start)/1000,seeds:result.seeds.map(summarize)};
  }
  row.identical=JSON.stringify(row.current.seeds)===JSON.stringify(row.previous.seeds);row.speedup=1-row.current.seconds/row.previous.seconds;
  report.results.push(row);console.log(JSON.stringify({id:row.id,identical:row.identical,previous:row.previous.seconds,current:row.current.seconds,speedup:row.speedup}));
  if(!row.identical)process.exitCode=1;
  await fs.writeFile(`${out}/results.json`,JSON.stringify(report,null,2));
}
