/** Measure rasterization sensitivity over a pinned cohort, without refitting.
 * Saved scores remain authoritative; this is a separate diagnostic.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import {renderExportedWeave} from './export-renderer.mjs';
import {referenceError} from '../../static/inverse/core/image-reference.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {auditEditablePaper} from './editable-paper-audit.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.ok(args.plan&&args.output&&Object.keys(args).every(k=>['plan','output'].includes(k)));
const hash=b=>createHash('sha256').update(b).digest('hex');
async function pinned(ref){const b=await fs.readFile(ref.path);assert.equal(hash(b),ref.sha256,ref.path);return b;}
const planBytes=await fs.readFile(args.plan),plan=JSON.parse(planBytes);
assert.equal(plan.schema,'renderer-cohort-diagnostic-plan-1');
assert.deepEqual(plan.flatnessCells,[.25,.025,.0025,.00025]);
assert.deepEqual(plan.svgScales,[1,5]);
await fs.mkdir(args.output,{recursive:false});
async function redMask(bytes){
 const image=await loadImage(bytes);assert.equal(image.width,image.height);
 const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
 const p=ctx.getImageData(0,0,image.width,image.height).data;
 return{size:image.width,data:Uint8Array.from({length:image.width**2},(_,i)=>Number(p[4*i]>p[4*i+1]+20))};
}
function differences(a,b){assert.equal(a.length,b.length);let count=0;for(let i=0;i<a.length;i++)count+=a[i]!==b[i];return count;}
const inputs=[],rows=[],sourceHashes={};
for(const file of ['scripts/inverse/renderer-cohort-diagnostic.mjs','scripts/inverse/export-renderer.mjs'])sourceHashes[file]=hash(await fs.readFile(file));
for(const group of plan.groups){
 const pipeline=JSON.parse(await pinned(group.pipeline)),ledger=JSON.parse(await pinned(group.editable));
 assert.equal(pipeline.status,'complete');
 for(const [file,sha] of Object.entries(ledger.sourceHashes)){
  assert.equal(hash(await fs.readFile(file)),sha,file);sourceHashes[file]=sha;
 }
 const selected=pipeline.rows.filter(r=>r.method===group.method&&r.assets['cut_geometry.json']&&(!group.freshOnly||!r.reusedFitFrom));
 assert.equal(selected.length,group.expectedExports);
 for(const r of selected){
  const edited=ledger.results.find(x=>x.id===r.id+'-'+group.method);assert.ok(edited?.conversionPassed);
  async function asset(name){const a=r.assets[name];assert.ok(a,name);return pinned({path:path.join(path.dirname(group.pipeline.path),a.path),sha256:a.sha256});}
  const geometry=await asset('cut_geometry.json'),target=await redMask(await asset('mask.png'));
  assert.equal(hash(geometry),edited.geometrySha256);assert.equal(hash(target.data),r.targetMaskSha256);
  assert.equal(hash(target.data),edited.maskSha256);assert.equal(target.size,r.resolution);
  const stem=path.join(path.dirname(group.editable.path),`${edited.id}-${edited.preset}`);
  const baseline=await redMask(await fs.readFile(stem+'-weave.png')),svg=await fs.readFile(stem+'.svg','utf8');
  let validMask;
  if(r.observedPixels!==target.data.length){
   validMask=Uint8Array.from(await asset('observed.bin'));
   assert.equal(validMask.length,target.data.length);assert.ok(validMask.every(v=>v===0||v===1));
   assert.equal(validMask.reduce((a,b)=>a+b,0),r.observedPixels);
  }
  const reference={mask:target.data,resolution:target.size,...(validMask?{validMask,weights:Float64Array.from(validMask)}:{})};
  assert.equal(referenceError(reference,baseline.data).mismatchPixels,edited.editableImageComparison.mismatchPixels);
  const row={group:group.name,id:r.id,geometrySha256:hash(geometry),targetMaskSha256:hash(target.data),
   editableSvgSha256:hash(svg),savedMaskSha256:hash(baseline.data),observedPixels:r.observedPixels,size:target.size,
   baseline:{exportedChecked:r.checkedPair,editableChecked:edited.completeCandidatePassed,
    exportedMismatch:r.independentImage.mismatchFraction,editableMismatch:edited.editableError,
    conversionFidelity:edited.fidelity},centre:[],svg:[]};
  rows.push(row);inputs.push({row,geometry,baseline:baseline.data,svg,reference,settings:r.report.settings,slits:r.report.slits,edited,previous:null});
 }
}
const report={schema:'renderer-cohort-diagnostic-1',status:'running',plan:{path:args.plan,sha256:hash(planBytes)},sourceHashes,
 scope:plan.scope,rows};
async function save(){await fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');}
await save();
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
try{
 for(const flatness of plan.flatnessCells){
  let transformed=false;
  const loader=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},cacheDir:path.resolve(args.output,'vite-'+flatness),
   server:{middlewareMode:true,hmr:false,ws:false},resolve:{alias:{$lib:path.resolve('src/lib')}},plugins:[{name:'diagnostic-flatness',enforce:'pre',transform(code,id){
    if(id.split('?')[0]!==path.resolve('src/lib/paint/rasterize.ts'))return;
    assert.equal(code.split('const FLATNESS_CELLS = 0.25;').length,2);transformed=true;
    return code.replace('const FLATNESS_CELLS = 0.25;',`const FLATNESS_CELLS = ${flatness};`);
   }}]});
  try{
   const {parseHeartFromSVG}=await loader.ssrLoadModule('/src/lib/utils/heartDesign.ts');
   const {rasterizeDesign}=await loader.ssrLoadModule('/src/lib/paint/rasterize.ts');
   const {inferOverlapRect}=await loader.ssrLoadModule('/src/lib/utils/overlapRect.ts');
   const {findFingersWithIssues,intersectionMarginPx}=await loader.ssrLoadModule('/src/lib/editor/curveIssues.ts');
   for(const input of inputs){
    const {row,reference,baseline,edited}=input,design=parseHeartFromSVG(input.svg,row.id+'.svg');assert.ok(design);
    const start=performance.now(),mask=rasterizeDesign(design,row.size).data,milliseconds=performance.now()-start;assert.ok(transformed);
    if(flatness===.25){
     assert.equal(differences(baseline,mask),0,'Must reproduce every saved editable mask exactly');
     const overlap=inferOverlapRect(design.fingers,design.gridSize);
     assert.deepEqual([...findFingersWithIssues(design.fingers,intersectionMarginPx(overlap))],[]);
     const physical=auditEditablePaper(design,overlap,input.settings,input.slits);
     assert.equal(physical.geometry.passed,edited.physical.geometry.passed);
     assert.equal(physical.paper?.status,edited.physical.paper?.status);
     row.geometryPaperReplay={geometryPassed:physical.geometry.passed,paperStatus:physical.paper?.status};
    }
    const image=referenceError(reference,mask),features=auditFeatureFidelity(reference,mask,input.settings);
    const physicalPassed=row.geometryPaperReplay.geometryPassed&&row.geometryPaperReplay.paperStatus==='pass';
    row.centre.push({flatnessCells:flatness,milliseconds,maskSha256:hash(mask),image,featuresPassed:features.passed,
     disagreementWithSavedEditable:differences(baseline,mask),disagreementWithPrevious:input.previous?differences(input.previous,mask):null,
     imageFeaturesAndGeometryPaperPass:image.mismatchFraction<=.03&&features.passed&&physicalPassed});
    input.previous=mask;
   }
  }finally{await loader.close();}
  await save();console.log(JSON.stringify({flatness,rows:rows.length,passes:rows.filter(r=>r.centre.at(-1).imageFeaturesAndGeometryPaperPass).length}));
 }
 for(const input of inputs){
  for(const scale of plan.svgScales){
   const n=input.row.size,result=await renderExportedWeave(input.geometry.toString(),n*scale);
   const mask=Uint8Array.from({length:n*n},(_,i)=>result.mask[(Math.floor(i/n)*scale+(scale-1)/2)*n*scale+(i%n)*scale+(scale-1)/2]);
   const image=referenceError(input.reference,mask);
   if(scale===1)assert.equal(image.mismatchFraction,input.row.baseline.exportedMismatch);
   input.row.svg.push({scale,image,disagreementWithFinestEditable:differences(input.previous,mask)});
  }
  await save();
 }
 for(const [file,sha] of Object.entries(sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
 report.status='complete';await save();
 console.log(JSON.stringify({status:'complete',rows:rows.length,output:args.output}));
}finally{dom.window.close();}
