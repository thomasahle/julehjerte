/** Audit production JPEG import against Pillow RGB, then the neural input.
 * One browser, no inference, solver, photo copies or network downloads.
 * --probe=... --catalog=... --fixtures=... --output=... (all required).
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['catalog','fixtures','output','probe']);
const sha=b=>createHash('sha256').update(b).digest('hex');
const pinned=async(file,hash)=>{const b=await fs.readFile(file);assert.equal(sha(b),hash,file);return b;};
const inputs={};
for(const name of ['probe','catalog','fixtures']){
 const bytes=await fs.readFile(args[name]);inputs[name]={path:args[name],sha256:sha(bytes),value:JSON.parse(bytes)};
}
assert.equal(inputs.fixtures.value.schema,'photo-decoding-fixtures-1');
const rows=inputs.probe.value.rows.map(row=>{
 const asset=inputs.catalog.value.assets.find(a=>a.sha256===row.originalPhotoSha256);
 assert.ok(asset);assert.equal(asset.format,'JPEG');
 return{id:row.id,kind:'development-photo',source:asset.localPath,sourceSha256:asset.sha256,
  reference:row.file,referenceSha256:row.photoSha256,dimensions:row.dimensions,decodedRGBSha256:row.decodedRGBSha256};
}).concat(inputs.fixtures.value.rows.map(row=>({...row,kind:'orientation-fixture'})));
assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
const files=new Map([['/',{bytes:Buffer.from('<!doctype html><meta charset="utf-8">'),type:'text/html'}]]);
const implementation={};
for(const [url,file,transpile] of [
 ['/input.mjs','scripts/inverse/learning/photo-input.mjs',false],
 ['/importImage.mjs','src/lib/paint/importImage.ts',true],
 ['/mask','src/lib/paint/mask.ts',true]
]){
 const bytes=await fs.readFile(file);implementation[file]=sha(bytes);
 const code=transpile?ts.transpileModule(bytes.toString(),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText:bytes;
 files.set(url,{bytes:code,type:'text/javascript'});
}
for(const row of rows){
 assert.ok(row.dimensions[0]*row.dimensions[1]<=24e6);
 for(const [suffix,file,hash,type] of [
  ['jpg',row.source,row.sourceSha256,'image/jpeg'],['png',row.reference,row.referenceSha256,'image/png']
 ])files.set('/'+row.id+'.'+suffix,{bytes:await pinned(file,hash),type});
}
await fs.mkdir(args.output,{recursive:false});
const report={schema:'photo-decoding-results-1',status:'running',inputs:Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,{path:v.path,sha256:v.sha256}])),implementation,
 scriptSha256:sha(await fs.readFile(new URL(import.meta.url))),rows:[],errors:[],scope:'Actual production decodeImageFile and portable neural preprocessing against independent Pillow RGB. No inference or fitted quality measurement.'};
const save=()=>fs.writeFile(args.output+'/report.json',JSON.stringify(report,null,2)+'\n');
const server=http.createServer((req,res)=>{const f=files.get(req.url);if(req.method!=='GET'||!f){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':f.type,'Cache-Control':'no-store'}).end(f.bytes);});
let browser;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROME?{executablePath:process.env.PLAYWRIGHT_CHROME}:{})});
 report.browser=browser.version();const page=await browser.newPage();
 page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 for(const row of rows){
  const result=await page.evaluate(async id=>{
   const {photoInput}=await import('/input.mjs'),{decodeImageFile}=await import('/importImage.mjs');
   const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
   const decode=async type=>{
    const blob=await (await fetch('/'+id+'.'+type)).blob();
    const image=await decodeImageFile(new File([blob],id+'.'+type,{type:blob.type}));
    try{
     const {rgba,imageWidth:width,imageHeight:height}=image.input,rgb=new Uint8Array(width*height*3);
     for(let i=0;i<rgb.length/3;i++)for(let k=0;k<3;k++)rgb[3*i+k]=rgba[4*i+k];
     return{rgb,width,height};
    }finally{URL.revokeObjectURL(image.url);}
   };
   const jpeg=await decode('jpg'),png=await decode('png');
   const difference=(a,b)=>{
    if(a.length!==b.length)return null;
    let sum=0,max=0,changed=0;
    for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);sum+=d;max=Math.max(max,d);changed+=Number(d>0);}
    return{max,mean:sum/a.length,changedChannels:changed,channels:a.length};
   };
   return{jpegDimensions:[jpeg.width,jpeg.height],pngDimensions:[png.width,png.height],
    jpegRgbSha256:await digest(jpeg.rgb),pngRgbSha256:await digest(png.rgb),sourceDifference:difference(jpeg.rgb,png.rgb),
    inputDifference:difference(photoInput(jpeg.rgb,jpeg.width,jpeg.height).rgb,photoInput(png.rgb,png.width,png.height).rgb)};
  },row.id);
  assert.equal(result.pngRgbSha256,row.decodedRGBSha256,'Lossless reference decode changed');
  assert.deepEqual(result.jpegDimensions,row.dimensions);assert.deepEqual(result.pngDimensions,row.dimensions);
  report.rows.push({...row,...result});await save();
 }
 assert.deepEqual(report.errors,[]);
 report.summary={cases:rows.length,photos:rows.filter(r=>r.kind==='development-photo').length,orientationFixtures:rows.filter(r=>r.kind==='orientation-fixture').length,
  exactSource:report.rows.filter(r=>r.sourceDifference.changedChannels===0).length,exactInputs:report.rows.filter(r=>r.inputDifference.changedChannels===0).length,
  maxInputChannelDifference:Math.max(...report.rows.map(r=>r.inputDifference.max))};
 report.passed=report.summary.exactSource===rows.length&&report.summary.exactInputs===rows.length;
 report.status='complete';await save();console.log(JSON.stringify(report.summary));
 assert.ok(report.passed,'Browser JPEG decoding differs from Pillow; inspect before any model release.');
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
finally{await browser?.close();await new Promise(r=>server.close(r));}
