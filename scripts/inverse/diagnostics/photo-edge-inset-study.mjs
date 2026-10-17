/** Compare photo-border treatments on fixed source coordinates. No defaults change. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {getPriority} from 'node:os';
import {createCanvas} from 'canvas';
import {readHardPhoto,hardPhotoCatalogCases} from '../hard-photo-data.mjs';
import {detectHeartCrops} from '../../../static/inverse/core/crop.js';
import {prepare,design} from '../../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../../static/inverse/core/presets.js';
import {homography,project} from '../../../static/inverse/locator/math.js';
import {borderEvidence} from '../../../static/inverse/core/direct/counts.js';
import {renderExportedWeave} from '../export-renderer.mjs';
import {referenceError} from '../../../static/inverse/core/image-reference.js';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>arg.replace(/^--/,'').split('=')));
if(!args.catalog||!args.id||!args.output)throw new Error('Use --catalog=<source catalogue> --id=<case> --output=<new directory> [--seconds=10] [--perturb=true]');
const seconds=Number(args.seconds||10);
if(!Number.isFinite(seconds)||seconds<1||seconds>180)throw new Error('Use --seconds=1..180');
if(args.perturb&&!['true','false'].includes(args.perturb))throw new Error('Use --perturb=true|false');
const sha=x=>createHash('sha256').update(x).digest('hex'),output=args.output;
const catalog=JSON.parse(await fs.readFile(args.catalog)),entry=hardPhotoCatalogCases(catalog).find(c=>c.id===args.id);
assert.ok(entry,'Unknown case');
const input=await readHardPhoto(entry),config={...AUTOMATIC_PRESET,mode:'auto',timeLimit:seconds,trials:0};
const files=new Set([args.catalog,entry.file,'scripts/inverse/diagnostics/photo-edge-inset-study.mjs','scripts/inverse/hard-photo-data.mjs','scripts/inverse/export-renderer.mjs']);
async function tree(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())await tree(file);else files.add(file);}}
await tree('static/inverse/core');await tree('static/inverse/locator');
const pins=Object.fromEntries(await Promise.all([...files].map(async file=>[file,sha(await fs.readFile(file))])));
const verify=async()=>{for(const [file,digest] of Object.entries(pins))assert.equal(sha(await fs.readFile(file)),digest,file);};
// A full-image selection is the same upload used by the import dialog; an
// explicit rough ROI is only needed when a photograph contains several hearts.
const entire=[0,0,input.imageWidth,input.imageHeight],roi=entry.roi.every((v,i)=>v===entire[i])?undefined:entry.roi;
const started=performance.now(),detection=detectHeartCrops(input,{roi}),crop=detection.candidates[0];
await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
const ledger={status:'running',case:entry.id,source:catalog.source,sourceHashes:pins,priority:getPriority(),detection,cropSeconds:(performance.now()-started)/1000,config,
 scope:'Fresh production photo-to-binary-mask-to-template comparisons. The initial automatic corners are fixed before any solve. Insets are fractions of each rectified side before classification. Ignoring a band changes importance, not target colors. No cutting paths, known slit counts or solve-selected crop coordinates are inputs. Timing is offline solve/validation/export, not browser latency. A low error against a changed mask is not evidence of improvement on the original photo.',rows:[]};
const save=()=>fs.writeFile(path.join(output,'results.json'),JSON.stringify(ledger,null,2)+'\n');
await save();
if(!crop){ledger.status='no_crop';await save();process.exitCode=1;}else{
 const square=[[0,0],[1,0],[1,1],[0,1]],corners=JSON.stringify(crop.quad),H=homography(square,crop.quad);
 const baseline=prepare({...input,quad:crop.quad},config).target.sourceImage;
 const variants=args.perturb==='true'
  ?[{name:'original'},{name:'x-plus-1',dx:1},{name:'y-plus-1',dy:1},{name:'outward-005',outward:.005}].flatMap(change=>[0,.01].map(inset=>({...change,name:change.name+(inset?'-inset-010':'-baseline'),inset})))
  :[{name:'baseline',inset:0},{name:'inset-005',inset:.005},{name:'inset-010',inset:.01},{name:'ignore-020',inset:0,ignoredBand:.02}];
 const png=(data,n,rgb=false)=>{const c=createCanvas(n,n),ctx=c.getContext('2d'),im=ctx.createImageData(n,n);for(let i=0;i<n*n;i++)im.data.set([...(rgb?data.slice(3*i,3*i+3):data[i]?[185,19,19]:[255,255,255]),255],4*i);ctx.putImageData(im,0,0);return c.toBuffer('image/png');};
 try{
  for(const v of variants){
   const dir=path.join(output,v.name);await fs.mkdir(dir);
   const center=[0,1].map(k=>crop.quad.reduce((sum,p)=>sum+p[k],0)/4);
   const perturbed=crop.quad.map(p=>p.map((value,k)=>center[k]+(value-center[k])*(1+2*(v.outward||0))+(k===0?v.dx||0:v.dy||0)));
   const matrix=homography(square,perturbed),quad=square.map(([u,w])=>project(matrix,[v.inset+(1-2*v.inset)*u,v.inset+(1-2*v.inset)*w]));
   const pre=prepare({...input,quad},config),{mask,resolution:n,validMask}=pre.preview;
   assert.equal(n,baseline.resolution);
   const weights=v.ignoredBand?Float32Array.from(mask,(_,i)=>{const x=(i%n+.5)/n,y=(Math.floor(i/n)+.5)/n;return Number(Math.min(x,y,1-x,1-y)>=v.ignoredBand);}):null;
   const target=prepare({type:'mask',mask:mask.slice(),resolution:n,...(validMask?{validMask}:{}),...(weights?{weights}:{})},config).target;
   const row={...v,quad,resolution:n,maskSha256:sha(mask),borderEvidence:borderEvidence(mask,n),classification:pre.preview.metadata.preprocessing};ledger.rows.push(row);
   await fs.writeFile(path.join(dir,'mask.png'),png(mask,n));await fs.writeFile(path.join(dir,'crop.png'),png(pre.preview.rgb,n,true));await save();
   const start=performance.now();
   try{
    const answer=await design(target,config);row.solveSeconds=(performance.now()-start)/1000;
    const exported=await renderExportedWeave(answer.files['cut_geometry.json'],n);
    row.independentError=referenceError(target.sourceImage,exported.mask);row.templateChecksPassed=answer.report.templateChecksPassed;row.slits=answer.report.slits;
    row.geometryPassed=answer.report.validation.passed;row.paperStatus=answer.report.manufacturing.status;row.missingFeatures=answer.report.imageFidelity.features.missing.length;
    // Compare every arm on the SAME physical photo region, including failures.
    // Use a finer independent raster so mapping does not add a whole source
    // pixel of nearest-neighbor displacement to an otherwise identical edge.
    const fine=await renderExportedWeave(answer.files['cut_geometry.json'],1600),inverse=homography(quad,square);
    let count=0,errors=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
     const u=(x+.5)/n,w=(y+.5)/n;if(Math.min(u,w,1-u,1-w)<.03||baseline.validMask&&!baseline.validMask[y*n+x])continue;
     const uv=project(inverse,project(H,[u,w])),xx=Math.floor(uv[0]*1600),yy=Math.floor(uv[1]*1600);
     assert.ok(xx>=0&&xx<1600&&yy>=0&&yy<1600,'Common source region must remain inside every crop');
     count++;errors+=fine.mask[yy*1600+xx]!==baseline.mask[y*n+x];
    }
    assert.ok(count>0);row.commonOriginalInterior={inset:.03,pixels:count,disagreements:errors,fraction:errors/count,reference:'Unchanged baseline classified photo, not ground truth; 1600px independent export mapped through source photograph to original rectified coordinates.'};
    await fs.writeFile(path.join(dir,'weave.png'),exported.png);
    await fs.writeFile(path.join(dir,'cut_geometry.json'),answer.files['cut_geometry.json']);
    await fs.writeFile(path.join(dir,'report.json'),JSON.stringify(answer.report,null,2)+'\n');
    console.log(JSON.stringify({name:v.name,seconds:row.solveSeconds,slits:row.slits,passed:row.templateChecksPassed,error:row.independentError.mismatchFraction,commonError:errors/count}));
   }catch(error){row.failure=error.message;row.solveSeconds=(performance.now()-start)/1000;console.log(JSON.stringify({name:v.name,failure:row.failure}));}
   assert.equal(JSON.stringify(crop.quad),corners);await save();
  }
  await verify();ledger.status='complete';await save();
 }catch(error){ledger.status='failed';ledger.failure=error.message;await save();throw error;}
}
