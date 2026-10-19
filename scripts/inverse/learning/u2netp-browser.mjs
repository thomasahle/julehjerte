/** Audit original photographs through production decoding, saliency input and WASM.
 * Local diagnostic server only; no application model integration or photo copies.
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
const pinned=async(file,hash)=>{const b=await fs.readFile(file);assert.equal(sha(b),hash,file);return b;};
const nativeBytes=await fs.readFile(args.native),native=JSON.parse(nativeBytes),root=path.dirname(args.native);
assert.equal(native.schema,'u2netp-export-1');assert.equal(native.status,'complete');
const plan=JSON.parse(await pinned(native.plan.path,native.plan.sha256)),protocol=plan.protocol;
for(const [file,hash] of Object.entries(plan.sourcePins))await pinned(file,hash);
const original=JSON.parse(await pinned(plan.probeManifest.path,plan.probeManifest.sha256));
assert.equal(original.status,'complete');assert.deepEqual(native.rows.map(r=>r.id),original.rows.map(r=>r.id));
const runtime=JSON.parse(await pinned(plan.runtime.path,plan.runtime.sha256)),runtimeRoot=path.dirname(plan.runtime.path);
const files=new Map([['/',{bytes:Buffer.from('<!doctype html><meta charset="utf-8"><script src="/ort.wasm.min.js"></script>'),type:'text/html'}]]);
for(const name of ['ort.wasm.min.js','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])
  files.set('/'+name,{bytes:await pinned(path.join(runtimeRoot,name),runtime.files[name].sha256),type:name.endsWith('.wasm')?'application/wasm':'text/javascript'});
files.set('/model.onnx',{bytes:await pinned(path.join(root,native.onnx.path),native.onnx.sha256),type:'application/octet-stream'});
const implementation={};
for(const [url,file,transpile] of [
  ['/input.mjs','scripts/inverse/learning/u2netp-input.mjs',false],
  ['/importImage.mjs','src/lib/paint/importImage.ts',true],['/mask','src/lib/paint/mask.ts',true]
]) {
  const bytes=await fs.readFile(file);implementation[file]=sha(bytes);
  files.set(url,{bytes:transpile?ts.transpileModule(bytes.toString(),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText:bytes,type:'text/javascript'});
}
for(const row of original.rows)files.set('/photos/'+row.id+'.jpg',{bytes:await pinned(row.file,row.photoSha256),type:'image/jpeg'});
function floats(bytes){assert.equal(bytes.length%4,0);return Float32Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(4*i));}
function difference(actual,expected,probabilities=false) {
  assert.equal(actual.length,expected.length);let max=0,changed=0,nonidentical=0;
  for(let i=0;i<actual.length;i++) {
    assert.ok(Number.isFinite(actual[i]));
    if(probabilities)assert.ok(actual[i]>=0&&actual[i]<=1);
    max=Math.max(max,Math.abs(actual[i]-expected[i]));nonidentical+=Number(actual[i]!==expected[i]);
    changed+=Number((actual[i]>.5)!==(expected[i]>.5));
  }
  return {maxAbsoluteDifference:max,nonidenticalValues:nonidentical,...(probabilities?{changedHalfThresholdPixels:changed}:{})};
}
await fs.mkdir(args.output,{recursive:false});
const result={schema:'u2netp-browser-1',status:'running',native:{path:args.native,sha256:sha(nativeBytes)},
  nativeGatesPassed:native.passed,implementation,sourceSha256:sha(await fs.readFile(new URL(import.meta.url))),rows:[],errors:[],
  scope:'Every selected original JPEG through production importer and portable skimage-equivalent input. One-thread WASM, no fine-tuning. Failed numerical gates remain visible; cohort limitations are inherited from the selection plan.'};
const manifest=structuredClone(original);manifest.status='running';manifest.fieldOrigin={kind:'frozen-upstream-saliency-browser-wasm',modelSha256:native.onnx.sha256};
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(result,null,2)+'\n');
const server=http.createServer((req,res)=>{const f=files.get(req.url);if(req.method!=='GET'||!f){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':f.type,'Cache-Control':'no-store'}).end(f.bytes);});
let browser;
try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROME?{executablePath:process.env.PLAYWRIGHT_CHROME}:{})});
  result.browser=browser.version();const page=await browser.newPage();page.on('pageerror',e=>result.errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  result.startupMilliseconds=await page.evaluate(async()=>{
    globalThis.ort.env.wasm.numThreads=1;globalThis.ort.env.wasm.proxy=false;globalThis.ort.env.wasm.wasmPaths=location.origin+'/';
    const started=performance.now();globalThis.session=await globalThis.ort.InferenceSession.create('/model.onnx',{executionProviders:['wasm']});return performance.now()-started;
  });
  for(const row of original.rows) {
    const output=await page.evaluate(async id=>{
      const {u2netpInput}=await import('/input.mjs'),{decodeImageFile}=await import('/importImage.mjs');
      const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
      const encode=values=>{
        const bytes=new Uint8Array(values.buffer,values.byteOffset,values.byteLength);
        let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
        return btoa(binary);
      };
      const blob=await(await fetch('/photos/'+id+'.jpg')).blob();
      const decoded=await decodeImageFile(new File([blob],id+'.jpg',{type:blob.type}));
      try {
        const {rgba,imageWidth:width,imageHeight:height}=decoded.input,source=new Uint8Array(width*height*3);
        for(let i=0;i<width*height;i++)for(let c=0;c<3;c++)source[3*i+c]=rgba[4*i+c];
        const started=performance.now(),input=u2netpInput(source,width,height),preprocessingMilliseconds=performance.now()-started;
        if(input.status!=='ready')throw new Error(input.status);
        globalThis.lastInput?.dispose();globalThis.lastInput=new globalThis.ort.Tensor('float32',input.tensor,[1,3,320,320]);
        const begin=performance.now(),out=await globalThis.session.run({rgb:globalThis.lastInput}),inferenceMilliseconds=performance.now()-begin;
        const result={input:encode(input.tensor),saliency:encode(out.saliency.data),dimensions:[width,height],
          decodedRGBSha256:await digest(source),inputTensorSha256:await digest(input.tensor),inferenceMilliseconds,preprocessingMilliseconds};
        out.saliency.dispose();return result;
      } finally {URL.revokeObjectURL(decoded.url);}
    },row.id);
    const saved=native.rows.find(r=>r.id===row.id),actual=floats(Buffer.from(output.saliency,'base64'));
    assert.equal(actual.length,320**2);
    const {input,saliency,...metadata}=output;
    const record={id:row.id,...metadata,sourceRgbExact:output.decodedRGBSha256===row.decodedRGBSha256&&JSON.stringify(output.dimensions)===JSON.stringify(row.dimensions),
      input:difference(floats(Buffer.from(input,'base64')),floats(await pinned(path.join(root,saved.assets.input.path),saved.assets.input.sha256))),
      vsNative:difference(actual,floats(await pinned(path.join(root,saved.assets.saliency.path),saved.assets.saliency.sha256)),true),
      vsTorch:difference(actual,floats(await pinned(path.join(path.dirname(plan.probeManifest.path),row.assets['probability.f32'].path),row.assets['probability.f32'].sha256)),true)};
    const name=row.id+'-saliency.f32',bytes=Buffer.from(saliency,'base64');await fs.writeFile(path.join(args.output,name),bytes);
    const target=manifest.rows.find(r=>r.id===row.id);target.assets={'probability.f32':{path:name,sha256:sha(bytes)}};target.inferenceSeconds=output.inferenceMilliseconds/1000;
    result.rows.push(record);await save();console.log(row.id,JSON.stringify({input:record.input,vsTorch:record.vsTorch}));
  }
  const timings=await page.evaluate(async p=>{
    const run=async()=>{const output=await globalThis.session.run({rgb:globalThis.lastInput});output.saliency.dispose();};
    for(let i=0;i<p.warmupRuns;i++)await run();const times=[];
    for(let i=0;i<p.timingRuns;i++){const started=performance.now();await run();times.push(performance.now()-started);}
    globalThis.lastInput.dispose();await globalThis.session.release();return times.sort((a,b)=>a-b);
  },protocol);
  result.warmInference={runs:timings.length,medianMilliseconds:timings[Math.floor(timings.length/2)],p90Milliseconds:timings[Math.ceil(.9*timings.length)-1]};
  result.checks={allPhotos:result.rows.length===original.rows.length,noBrowserErrors:result.errors.length===0,
    sourceRgbExact:result.rows.every(r=>r.sourceRgbExact),inputParity:result.rows.every(r=>r.input.maxAbsoluteDifference<=protocol.inputAtol),
    probabilityParity:result.rows.every(r=>r.vsTorch.maxAbsoluteDifference<=protocol.probabilityAtol&&r.vsNative.maxAbsoluteDifference<=protocol.probabilityAtol),
    halfThresholdParity:result.rows.every(r=>r.vsTorch.changedHalfThresholdPixels===0&&r.vsNative.changedHalfThresholdPixels===0)};
  result.passed=Object.values(result.checks).every(Boolean)&&native.passed;manifest.status=result.status='complete';
  await fs.writeFile(path.join(args.output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  result.artifactBytes=0;result.artifacts={};
  for(const name of await fs.readdir(args.output))if(name!=='report.json'){const bytes=await fs.readFile(path.join(args.output,name));result.artifactBytes+=bytes.length;result.artifacts[name]=sha(bytes);}
  assert.ok(result.artifactBytes<=plan.resources.browserMaxArtifactMiB*1024**2);
  await save();console.log(JSON.stringify({passed:result.passed,checks:result.checks,warmInference:result.warmInference}));
} catch(error) {result.status='failed';result.error=error.message;await save();throw error;}
finally {await browser?.close();await new Promise(r=>server.close(r));}
