/** One frozen candidate through production JPEG import, portable input and WASM.
 * Keep failed gates visible; outputs can still support diagnostic pipeline replays.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import ts from 'typescript';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['native','output']);
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(p));
const pinned=async(p,hash)=>{const b=await fs.readFile(p);assert.equal(sha(b),hash,p);return b;};
const nativeBytes=await fs.readFile(args.native),native=JSON.parse(nativeBytes),root=path.dirname(args.native);
assert.equal(native.schema,'preserved-candidate-probe-1');assert.equal(native.status,'complete');
const plan=JSON.parse(await pinned(native.plan.path,native.plan.sha256));
const runtime=JSON.parse(await pinned(plan.runtime.path,plan.runtime.sha256)),runtimeRoot=path.dirname(plan.runtime.path);
const cpu=JSON.parse(await pinned(path.join(root,'probe/manifest.json'),native.artifacts['probe/manifest.json']));
assert.equal(cpu.status,'complete');const protocol=plan.protocol;assert.equal(protocol.threads,1);
const files=new Map([['/',{bytes:Buffer.from('<!doctype html><meta charset="utf-8"><script src="/ort.wasm.min.js"></script>'),type:'text/html'}]]);
for(const name of ['ort.wasm.min.js','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])
 files.set('/'+name,{bytes:await pinned(path.join(runtimeRoot,name),runtime.files[name].sha256),type:name.endsWith('.wasm')?'application/wasm':'text/javascript'});
files.set('/model.onnx',{bytes:await pinned(path.join(root,native.onnx.path),native.onnx.sha256),type:'application/octet-stream'});
const implementation={};
for(const [url,file,transpile] of [
 ['/input.mjs','scripts/inverse/learning/photo-input.mjs',false],
 ['/importImage.mjs','src/lib/paint/importImage.ts',true],['/mask','src/lib/paint/mask.ts',true]
]){
 const bytes=await fs.readFile(file);implementation[file]=sha(bytes);
 files.set(url,{bytes:transpile?ts.transpileModule(bytes.toString(),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText:bytes,type:'text/javascript'});
}
for(const row of cpu.rows)files.set('/photos/'+row.id+'.jpg',{bytes:await pinned(row.file,row.photoSha256),type:'image/jpeg'});
function difference(actual,expected){
 assert.equal(actual.length,expected.length);let max=0,changed=0;
 for(let i=0;i<actual.length;i++){
  assert.ok(Number.isFinite(actual[i])&&actual[i]>=0&&actual[i]<=1);
  max=Math.max(max,Math.abs(actual[i]-expected[i]));changed+=Number((actual[i]>=.5)!==(expected[i]>=.5));
 }
 return{maxAbsoluteDifference:max,changedHalfThresholdPixels:changed};
}
const field=async asset=>{const b=await pinned(path.join(root,'probe',asset.path),asset.sha256);assert.equal(b.length,256**2*4);return Float32Array.from({length:256**2},(_,i)=>b.readFloatLE(4*i));};
await fs.mkdir(args.output,{recursive:false});await fs.mkdir(path.join(args.output,'probe'));
const result={schema:'preserved-candidate-browser-1',status:'running',native:{path:args.native,sha256:sha(nativeBytes)},
 nativeGatesPassed:native.passed,implementation,sourceSha256:sha(await fs.readFile(new URL(import.meta.url))),photos:[],errors:[],
 scope:'Original selected JPEGs through actual production importer and portable input. One-thread browser WASM; failed parity gates are retained and prevent release.'};
const manifest=structuredClone(cpu);manifest.status='running';manifest.methods=['wasm'];
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(result,null,2)+'\n');
const server=http.createServer((req,res)=>{const f=files.get(req.url);if(req.method!=='GET'||!f){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':f.type,'Cache-Control':'no-store'}).end(f.bytes);});
let browser;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROME?{executablePath:process.env.PLAYWRIGHT_CHROME}:{})});
 result.browser=browser.version();const page=await browser.newPage();page.on('pageerror',e=>result.errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 result.startupMilliseconds=await page.evaluate(async()=>{
  globalThis.ort.env.wasm.numThreads=1;globalThis.ort.env.wasm.proxy=false;globalThis.ort.env.wasm.wasmPaths=location.origin+'/';
  const started=performance.now();globalThis.session=await globalThis.ort.InferenceSession.create('/model.onnx',{executionProviders:['wasm']});return performance.now()-started;
 });
 for(const row of cpu.rows){
  const output=await page.evaluate(async id=>{
   const {photoInput}=await import('/input.mjs'),{decodeImageFile}=await import('/importImage.mjs');
   const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
   const blob=await(await fetch('/photos/'+id+'.jpg')).blob();
   const decoded=await decodeImageFile(new File([blob],id+'.jpg',{type:blob.type}));
   try{
    const {rgba,imageWidth:width,imageHeight:height}=decoded.input,source=new Uint8Array(width*height*3);
    for(let i=0;i<width*height;i++)for(let c=0;c<3;c++)source[3*i+c]=rgba[4*i+c];
    const started=performance.now(),input=photoInput(source,width,height),preprocessingMilliseconds=performance.now()-started;
    const values=new Float32Array(3*256**2);
    for(let i=0;i<256**2;i++)for(let c=0;c<3;c++)values[c*256**2+i]=input.rgb[3*i+c]/255;
    globalThis.lastInput?.dispose();globalThis.lastInput=new globalThis.ort.Tensor('float32',values,[1,3,256,256]);
    const begin=performance.now(),out=await globalThis.session.run({rgb:globalThis.lastInput}),milliseconds=performance.now()-begin;
    const bytes=new Uint8Array(out.probabilities.data.buffer,out.probabilities.data.byteOffset,out.probabilities.data.byteLength);
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const result={data:btoa(binary),dimensions:[width,height],decodedRGBSha256:await digest(source),
     inputRgbSha256:await digest(input.rgb),inputTensorSha256:await digest(values),milliseconds,preprocessingMilliseconds};
    out.probabilities.dispose();return result;
   }finally{URL.revokeObjectURL(decoded.url);}
  },row.id);
  const raw=Buffer.from(output.data,'base64');assert.equal(raw.length,2*256**2*4);
  const {data,...metadata}=output;
  const record={id:row.id,...metadata,dimensionsExact:JSON.stringify(output.dimensions)===JSON.stringify(row.dimensions),
   sourceRgbExact:output.decodedRGBSha256===row.decodedRGBSha256,inputRgbExact:output.inputRgbSha256===row.inputRgbSha256,
   inputTensorExact:output.inputTensorSha256===row.inputTensorSha256,heads:[]};
  const target=manifest.rows.find(r=>r.id===row.id);target.assets={wasm:{}};delete target.rgb;
  for(const [channel,head] of ['body','material'].entries()){
   const bytes=raw.subarray(channel*256**2*4,(channel+1)*256**2*4),actual=Float32Array.from({length:256**2},(_,i)=>bytes.readFloatLE(4*i));
   record.heads.push({head,vsTorch:difference(actual,await field(row.assets.torch[head])),vsNative:difference(actual,await field(row.assets.onnx[head]))});
   const name=row.id+'-'+head+'.f32';await fs.writeFile(path.join(args.output,'probe',name),bytes);target.assets.wasm[head]={path:name,sha256:sha(bytes)};
  }
  result.photos.push(record);await save();console.log(row.id,JSON.stringify(record.heads));
 }
 const timings=await page.evaluate(async p=>{
  const run=async()=>{const out=await globalThis.session.run({rgb:globalThis.lastInput});out.probabilities.dispose();};
  for(let i=0;i<p.warmupRuns;i++)await run();const times=[];
  for(let i=0;i<p.timingRuns;i++){const started=performance.now();await run();times.push(performance.now()-started);}
  globalThis.lastInput.dispose();await globalThis.session.release();return times.sort((a,b)=>a-b);
 },protocol);
 result.warmInference={runs:timings.length,medianMilliseconds:(timings[(timings.length-1)>>1]+timings[timings.length>>1])/2,p90Milliseconds:timings[Math.ceil(.9*timings.length)-1]};
 result.checks={allPhotos:result.photos.length===cpu.rows.length,noBrowserErrors:result.errors.length===0,
  sourceRgbExact:result.photos.every(r=>r.sourceRgbExact&&r.dimensionsExact),inputRgbExact:result.photos.every(r=>r.inputRgbExact&&r.inputTensorExact),
  probabilityParity:result.photos.every(r=>r.heads.every(h=>h.vsTorch.maxAbsoluteDifference<=protocol.probabilityAtol&&h.vsNative.maxAbsoluteDifference<=protocol.probabilityAtol)),
  halfThresholdParity:result.photos.every(r=>r.heads.every(h=>h.vsTorch.changedHalfThresholdPixels===0&&h.vsNative.changedHalfThresholdPixels===0))};
 result.passed=Object.values(result.checks).every(Boolean)&&native.passed;manifest.status=result.status='complete';
 await fs.writeFile(path.join(args.output,'probe/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 result.artifacts={};result.artifactBytes=0;
 for(const name of await fs.readdir(path.join(args.output,'probe'))){const b=await fs.readFile(path.join(args.output,'probe',name));result.artifacts['probe/'+name]=sha(b);result.artifactBytes+=b.length;}
 assert.ok(result.artifactBytes<=plan.resources.browserMaxArtifactMiB*1024**2);
 await save();console.log(JSON.stringify({passed:result.passed,checks:result.checks,warmInference:result.warmInference}));
 if(!result.passed)process.exitCode=1;
}catch(error){result.status='failed';result.error=error.message;await save();throw error;}
finally{await browser?.close();await new Promise(r=>server.close(r));}
