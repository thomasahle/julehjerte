/** Preparation-only replay: the guide and original mask must stay identical.
 * Original outline SVG is now pixel-exact instead of an unused fitted graph.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createCanvas,loadImage} from 'canvas';
import {hash} from './count-strategy-data.mjs';
import {shapeCells} from '../../src/lib/paint/frame.ts';
import {prepare} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';

const arg=name=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3),reference=arg('reference')||'2243708',weightedRoot=arg('weighted')||'tmp/phase-robustness-final',browserRoot=arg('browser')||'tmp/phase-browser-final',out=arg('output')||'tmp/prepare-preview';
const show=file=>execFileSync('git',['show',`${reference}:${file}`],{encoding:'utf8'});
for(const name of ['engine.js','input.js','export.js','direct/topology.js','image-reference.js']){
  const file=`static/inverse/core/${name}`;if(hash(await fs.readFile(file))!==hash(show(file)))throw new Error(`Baseline preparation dependency changed: ${file}`);
}
const core=path.resolve('static/inverse/core'),old=show('static/inverse/core/automatic.js').replace(/from '(\.[^']+)'/g,(_,p)=>`from '${pathToFileURL(path.resolve(core,p)).href}'`),baseline=(await import('data:text/javascript;base64,'+Buffer.from(old).toString('base64'))).prepareAutomatic;
const cases=[],weighted=JSON.parse(await fs.readFile(`${weightedRoot}/results.json`));
for(const row of weighted.results.filter(r=>r.variant==='original'||r.variant==='free-noise')){
  const file=`${weightedRoot}/${row.shape}-${row.size}-weighted${row.variant==='original'?'':`-${row.variant}`}/target.png`,n=weighted.resolution,c=createCanvas(n,n),ctx=c.getContext('2d');ctx.drawImage(await loadImage(file),0,0);const rgba=ctx.getImageData(0,0,n,n).data;
  cases.push({id:`${row.shape}-${row.size}-${row.variant}`,sourceSha256:hash(await fs.readFile(file)),input:{type:'mask',resolution:n,mask:Uint8Array.from({length:n*n},(_,i)=>Number(rgba[4*i]<128)),weights:shapeCells({mode:'free',shape:'diamond',size:row.size},n)}});
}
for(const name of ['house-free-small','hat-free-small','top-hat','top-hat-independent','hat-free','house-free']){
  const file=`${browserRoot}/firefox-${name}/prepared.json`,p=JSON.parse(await fs.readFile(file));
  for(const noisy of [false,true])cases.push({id:`browser-${name}${noisy?'-noise':''}`,sourceSha256:hash(await fs.readFile(file)),input:{type:'mask',resolution:p.resolution,mask:Uint8Array.from(p.mask,(v,i)=>noisy&&!p.weights[i]?Number((i*2654435761>>>29)&1):v),weights:Float64Array.from(p.weights)}});
}
const report={reference,gitCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),method:'Serial preparation with alternating policy order. Identical source mask and fitted guide are required; original-boundary SVG sizes are reported separately.',sourceHashes:{},results:[]};
for(const file of ['static/inverse/core/automatic.js','static/inverse/core/mask-preview.js'])report.sourceHashes[file]=hash(await fs.readFile(file));
await fs.mkdir(out,{recursive:true});
for(const [i,c] of cases.entries()){
  const row={id:c.id,resolution:c.input.resolution,sourceSha256:c.sourceSha256};
  for(const policy of i%2?['current','previous']:['previous','current']){
    const at=performance.now(),p=policy==='current'?prepare(c.input,AUTOMATIC_PRESET):baseline(c.input,AUTOMATIC_PRESET,()=>{});
    row[policy]={seconds:(performance.now()-at)/1000,originalMaskSha256:hash(p.target.sourceImage.mask),guideSha256:hash(JSON.stringify({phase:p.target.boundarySeed?.phase,curves:p.target.boundarySeed?.curves.map(c=>c.p)})),previewBytes:Buffer.byteLength(p.preview.boundaries),originalBoundariesAvailable:p.preview.metadata.originalBoundariesAvailable,error:p.target.metadata.automatic.boundaryEvidenceError};
  }
  row.identicalInputAndGuide=row.previous.originalMaskSha256===row.current.originalMaskSha256&&row.previous.guideSha256===row.current.guideSha256;
  if(!row.identicalInputAndGuide)process.exitCode=1;report.results.push(row);console.log(JSON.stringify(row));
  await fs.writeFile(`${out}/results.json`,JSON.stringify(report,null,2));
}
