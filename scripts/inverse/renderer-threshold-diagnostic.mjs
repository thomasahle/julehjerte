/** Compare saved exported cuts across coverage and pixel-centre renderers.
 * Research only: no geometry edits, refits or acceptance-limit changes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {createServer} from 'vite';
import {renderExportedWeave} from './export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.ok(['run','editable','id','output'].every(k=>args[k])&&Object.keys(args).every(k=>['run','editable','id','output'].includes(k)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const pipelineBytes=await fs.readFile(path.join(args.run,'report.json')),pipeline=JSON.parse(pipelineBytes);
assert.equal(pipeline.status,'complete');
const row=pipeline.rows.find(r=>r.id===args.id&&r.method==='fallback');assert.ok(row&&!row.reusedFitFrom);
const editableBytes=await fs.readFile(path.join(args.editable,'results.json')),ledger=JSON.parse(editableBytes);
const edited=ledger.results.find(r=>r.id===args.id+'-fallback');assert.ok(edited?.conversionPassed);
for(const [file,sha] of Object.entries(ledger.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
async function asset(name){const a=row.assets[name],bytes=await fs.readFile(path.join(args.run,a.path));assert.equal(hash(bytes),a.sha256,name);return bytes;}
async function redMask(bytes){
 const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
 const p=ctx.getImageData(0,0,image.width,image.height).data;
 return{size:image.width,data:Uint8Array.from({length:image.width*image.height},(_,i)=>Number(p[4*i]>p[4*i+1]+20))};
}
const geometry=await asset('cut_geometry.json'),target=await redMask(await asset('mask.png')),n=target.size;
assert.equal(hash(target.data),row.targetMaskSha256);assert.equal(row.observedPixels,n*n,'This diagnostic requires a fully observed square');
const current=(await redMask(await fs.readFile(path.join(args.editable,args.id+'-fallback-automatic-weave.png')))).data;
function difference(a,b){assert.equal(a.length,b.length);let count=0;for(let i=0;i<a.length;i++)count+=a[i]!==b[i];return count;}
assert.equal(difference(target.data,current),edited.editableImageComparison.mismatchPixels);
const report={schema:'renderer-threshold-diagnostic-1',scope:'Saved geometry only. Finer rasterizers are diagnostic, not replacement release scores.',
 inputs:{pipeline:{path:path.join(args.run,'report.json'),sha256:hash(pipelineBytes)},editable:{path:path.join(args.editable,'results.json'),sha256:hash(editableBytes)},id:args.id,geometrySha256:hash(geometry),maskSha256:hash(target.data)},
 sourceHashes:{[new URL(import.meta.url).pathname]:hash(await fs.readFile(new URL(import.meta.url))),...ledger.sourceHashes},size:n,
 baseline:{svgMismatchPixels:row.independentImage.mismatchPixels,editableMismatchPixels:edited.editableImageComparison.mismatchPixels,conversionFidelity:edited.fidelity},coverage:[],centre:[]};
await fs.mkdir(args.output,{recursive:false});
for(const scale of [1,3,5]){
 const result=await renderExportedWeave(geometry.toString(),n*scale),centre=Uint8Array.from({length:n*n},(_,i)=>result.mask[(Math.floor(i/n)*scale+(scale-1)/2)*n*scale+(i%n)*scale+(scale-1)/2]);
 if(scale===1)assert.equal(difference(target.data,centre),row.independentImage.mismatchPixels);
 report.coverage.push({scale,method:scale===1?'Half-coverage threshold at target resolution':'Centre subpixel of odd supersampling; shrinking coverage window approximates a centre test',mismatchPixels:difference(target.data,centre),disagreementWithEditable:difference(current,centre)});
}
const rasterFile=path.resolve('src/lib/paint/rasterize.ts');
for(const flatness of [.25,.025,.0025]){
 let transformed=false;
 const loader=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},cacheDir:path.resolve(args.output,'vite-'+flatness),
  server:{middlewareMode:true,hmr:false,ws:false},resolve:{alias:{$lib:path.resolve('src/lib')}},plugins:[{name:'diagnostic-flatness',enforce:'pre',transform(code,id){
   if(id.split('?')[0]!==rasterFile)return;
   assert.equal(code.split('const FLATNESS_CELLS = 0.25;').length,2);transformed=true;
   return code.replace('const FLATNESS_CELLS = 0.25;',`const FLATNESS_CELLS = ${flatness};`);
  }}]});
 try{
  const {convertCutGeometry}=await loader.ssrLoadModule('/src/lib/inverse/toHeartDesign.ts'),{rasterizeDesign}=await loader.ssrLoadModule('/src/lib/paint/rasterize.ts');
  const design=convertCutGeometry(geometry.toString(),{name:'diagnostic',tolerance:0,preserveShared:true,enforce:{curve:'off',lobe:'off',lobes:'off'}}).design;
  const data=rasterizeDesign(design,n).data;assert.ok(transformed);
  if(flatness===.25)assert.equal(difference(current,data),0,'Default unsimplified mask must reproduce the saved editable mask');
  report.centre.push({flatnessCells:flatness,mismatchPixels:difference(target.data,data),disagreementWithEditable:difference(current,data)});
 }finally{await loader.close();}
}
await fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({baseline:report.baseline,coverage:report.coverage,centre:report.centre}));
