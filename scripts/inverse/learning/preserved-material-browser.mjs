/** Bounded offline WASM parity/latency check; no website or model deployment. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.ok(args.plan&&args.output&&Object.keys(args).every(k=>['plan','output'].includes(k)));
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(p));
async function pinned(asset){const b=await fs.readFile(asset.path);assert.equal(sha(b),asset.sha256,asset.path);return b;}
const planBytes=await fs.readFile(args.plan),plan=JSON.parse(planBytes);
assert.equal(plan.schema,'preserved-material-browser-plan-1');
const parent=JSON.parse(await pinned(plan.parent));assert.equal(parent.passed,true);
const parentRoot=path.dirname(plan.parent.path),cpuProbe=await read(path.join(parentRoot,'probe/manifest.json'));
assert.equal(sha(await fs.readFile(path.join(parentRoot,'probe/manifest.json'))),parent.artifacts['probe/manifest.json']);
const exportPlan=JSON.parse(await pinned(parent.plan)),training=JSON.parse(await pinned(exportPlan.training));
const reference=JSON.parse(await pinned(plan.referenceProbe));
const runtime=JSON.parse(await pinned(plan.runtime)),runtimeRoot=path.dirname(plan.runtime.path);
const protocol=plan.protocol;assert.equal(protocol.threads,1);assert.equal(protocol.threshold,.5);
const files=new Map(),labels=new Map(),inputs=new Map(training.inputs.map(r=>[r.id,r]));
files.set('/',{bytes:Buffer.from('<!doctype html><meta charset="utf-8"><title>Offline heart ONNX check</title><script src="/ort.wasm.min.js"></script>'),type:'text/html'});
for(const name of ['ort.wasm.min.js','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])
 files.set('/'+name,{bytes:await pinned({path:path.join(runtimeRoot,name),sha256:runtime.files[name].sha256}),type:name.endsWith('.wasm')?'application/wasm':'text/javascript'});
for(const entry of training.labelAudits){
 const manifest=await read(path.join(entry.directory,'manifest.json'));
 for(const row of manifest.instances){
  assert.ok(!labels.has(row.id));labels.set(row.id,row);
  files.set('/rgb/'+row.id+'.png',{bytes:await pinned({path:path.join(entry.directory,row.assets.rgb.path),sha256:row.assets.rgb.sha256}),type:'image/png'});
 }
}
for(const fold of parent.folds)files.set('/'+fold.id+'.onnx',{bytes:await pinned({path:path.join(parentRoot,fold.onnx.path),sha256:fold.onnx.sha256}),type:'application/octet-stream'});
const floatField=async(root,asset)=>{
 const bytes=await pinned({path:path.join(root,asset.path),sha256:asset.sha256});assert.equal(bytes.length,256**2*4);
 return Float32Array.from({length:256**2},(_,i)=>bytes.readFloatLE(i*4));
};
function compare(actual,expected){
 assert.equal(actual.length,expected.length);let maximum=0,changed=0;
 for(let i=0;i<actual.length;i++){
  assert.ok(Number.isFinite(actual[i])&&actual[i]>=0&&actual[i]<=1);
  maximum=Math.max(maximum,Math.abs(actual[i]-expected[i]));changed+=Number((actual[i]>=.5)!==(expected[i]>=.5));
 }
 return{maxAbsoluteDifference:maximum,changedHalfThresholdPixels:changed};
}
await fs.mkdir(args.output,{recursive:false});await fs.mkdir(path.join(args.output,'probe'));
const result={schema:'preserved-material-browser-result-1',status:'running',plan:{path:args.plan,sha256:sha(planBytes)},
 sourceSha256:sha(await fs.readFile(new URL(import.meta.url))),folds:[],photos:[],errors:[],scope:protocol.scope};
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(result,null,2)+'\n');
const server=http.createServer((req,res)=>{
 const file=files.get(req.url);
 if(req.method!=='GET'||!file){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':file.type,'Content-Length':file.bytes.length,'Cache-Control':'no-store'}).end(file.bytes);
});
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 result.browser=browser.version();const page=await browser.newPage();
 page.on('pageerror',e=>result.errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const manifest=structuredClone(cpuProbe);manifest.methods=['wasm'];manifest.scope=protocol.scope;
 await page.evaluate(p=>{
  globalThis.ort.env.wasm.numThreads=p.threads;globalThis.ort.env.wasm.proxy=p.proxy;
  globalThis.ort.env.wasm.wasmPaths=location.origin+'/';
 },protocol);
 for(const fold of parent.folds){
  const startup=await page.evaluate(async({id,executionProviders})=>{
   const started=performance.now();
   globalThis.heartSession=await globalThis.ort.InferenceSession.create('/'+id+'.onnx',{executionProviders});
   return performance.now()-started;
  },{id:fold.id,executionProviders:protocol.executionProviders});
  for(const id of fold.heldOutIds){
   const output=await page.evaluate(async id=>{
    const img=new Image();img.src='/rgb/'+id+'.png';await img.decode();
    if(img.width!==256||img.height!==256)throw new Error('Unexpected RGB dimensions');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const rgba=ctx.getImageData(0,0,256,256).data;
    const rgb=new Uint8Array(256*256*3),nchw=new Float32Array(rgb.length);
    for(let i=0;i<256*256;i++)for(let c=0;c<3;c++){rgb[3*i+c]=rgba[4*i+c];nchw[c*256*256+i]=rgb[3*i+c]/255;}
    const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
    globalThis.heartInput=new globalThis.ort.Tensor('float32',nchw,[1,3,256,256]);
    const started=performance.now(),out=await globalThis.heartSession.run({rgb:globalThis.heartInput}),elapsed=performance.now()-started;
    const bytes=new Uint8Array(out.probabilities.data.buffer,out.probabilities.data.byteOffset,out.probabilities.data.byteLength);
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const response={data:btoa(binary),decodedRGBSha256:await digest(rgb),inputSha256:await digest(nchw),milliseconds:elapsed};
    out.probabilities.dispose();return response;
   },id);
   assert.equal(output.decodedRGBSha256,inputs.get(id).rgbSha256);
   const raw=Buffer.from(output.data,'base64');assert.equal(raw.length,2*256**2*4);
   const row={id,fold:fold.id,inputSha256:output.inputSha256,decodedRGBSha256:output.decodedRGBSha256,milliseconds:output.milliseconds,heads:[]};
   const target=manifest.rows.find(r=>r.id===id),cpu=cpuProbe.rows.find(r=>r.id===id),old=reference.rows.find(r=>r.id===id);
   assert.equal(target.photoSha256,old.photoSha256);target.assets={wasm:{}};
   for(const [c,head] of ['body','material'].entries()){
    const bytes=raw.subarray(c*256**2*4,(c+1)*256**2*4),actual=Float32Array.from({length:256**2},(_,i)=>bytes.readFloatLE(4*i));
    const cpuField=await floatField(path.join(parentRoot,'probe'),cpu.assets.onnx[head]);
    const oldField=await floatField(path.dirname(plan.referenceProbe.path),old.assets['preserved-body'][head]);
    row.heads.push({head,vsNativeOnnx:compare(actual,cpuField),vsArchivedTorch:compare(actual,oldField)});
    const file=id+'-'+head+'.f32';await fs.writeFile(path.join(args.output,'probe',file),bytes);
    target.assets.wasm[head]={path:file,sha256:sha(bytes)};
   }
   result.photos.push(row);await save();console.log(id,JSON.stringify(row.heads));
  }
  const times=await page.evaluate(async p=>{
   const run=async()=>{const out=await globalThis.heartSession.run({rgb:globalThis.heartInput});out.probabilities.dispose();};
   for(let i=0;i<p.warmupRuns;i++)await run();const times=[];
   for(let i=0;i<p.timingRuns;i++){const started=performance.now();await run();times.push(performance.now()-started);}
   await globalThis.heartSession.release();globalThis.heartInput.dispose();return times;
  },protocol);
  times.sort((a,b)=>a-b);
  result.folds.push({id:fold.id,sessionStartupMilliseconds:startup,warmInference:{runs:times.length,
   medianMilliseconds:(times[(times.length-1)>>1]+times[times.length>>1])/2,p90Milliseconds:times[Math.ceil(.9*times.length)-1]}});
 }
 assert.deepEqual([...result.photos.map(r=>r.id)].sort(),exportPlan.ids.slice().sort());
 result.checks={inputRgbExact:true,allPhotos:true,noBrowserErrors:!result.errors.length,
  probabilityParity:result.photos.every(r=>r.heads.every(h=>h.vsNativeOnnx.maxAbsoluteDifference<=protocol.probabilityAtol&&h.vsArchivedTorch.maxAbsoluteDifference<=protocol.probabilityAtol)),
  archivedHalfThresholdParity:result.photos.every(r=>r.heads.every(h=>!h.vsArchivedTorch.changedHalfThresholdPixels))};
 result.passed=Object.values(result.checks).every(Boolean);result.status='complete';manifest.exportPlan=result.plan;
 await fs.writeFile(path.join(args.output,'probe/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 result.artifacts={};result.artifactBytes=0;
 for(const name of await fs.readdir(path.join(args.output,'probe'))){
  const b=await fs.readFile(path.join(args.output,'probe',name));result.artifactBytes+=b.length;result.artifacts['probe/'+name]=sha(b);
 }
 assert.ok(result.artifactBytes<=plan.resources.maxArtifactBytes);
 await save();console.log(JSON.stringify({passed:result.passed,checks:result.checks,folds:result.folds}));
 assert.equal(result.passed,true);
}catch(error){result.status='failed';result.error=error.message;await save();throw error;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
