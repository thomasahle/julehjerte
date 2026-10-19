/** Compare actual full-photo Canvas preprocessing with the training RGB input. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.ok(args.plan&&args.output&&Object.keys(args).every(k=>['plan','output'].includes(k)));
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(p));
const pinned=async a=>{const b=await fs.readFile(a.path);assert.equal(sha(b),a.sha256,a.path);return b;};
const planBytes=await fs.readFile(args.plan),plan=JSON.parse(planBytes);
assert.equal(plan.schema,'photo-browser-preprocessing-plan-1');
assert.equal(plan.protocol.resolution,256);assert.equal(plan.protocol.threads,1);
const inputs={};for(const [k,a] of Object.entries(plan.inputs))inputs[k]=JSON.parse(await pinned(a));
const native=inputs.native,reference=inputs.reference,probe=inputs.probe;
assert.equal(native.passed,true);assert.ok(reference.checks.inputRgbExact&&reference.checks.allPhotos);
assert.equal(reference.artifacts['probe/manifest.json'],plan.inputs.probe.sha256);
const exportPlan=JSON.parse(await pinned(native.plan)),training=JSON.parse(await pinned(exportPlan.training));
const files=new Map(),labels=new Map();
const add=async(url,asset,type)=>files.set(url,{bytes:await pinned(asset),type});
files.set('/',{bytes:Buffer.from('<!doctype html><meta charset="utf-8"><script src="/ort.wasm.min.js"></script>'),type:'text/html'});
for(const name of ['ort.wasm.min.js','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])
 await add('/'+name,{path:path.join(path.dirname(plan.inputs.runtime.path),name),sha256:inputs.runtime.files[name].sha256},name.endsWith('.wasm')?'application/wasm':'text/javascript');
for(const entry of training.labelAudits)for(const row of (await read(path.join(entry.directory,'manifest.json'))).instances){
 assert.ok(!labels.has(row.id));labels.set(row.id,row);
 await add('/reference/'+row.id+'.png',{path:path.join(entry.directory,row.assets.rgb.path),sha256:row.assets.rgb.sha256},'image/png');
}
for(const row of probe.rows){
 await add('/photo/'+row.id+'.png',{path:row.file,sha256:row.photoSha256},'image/png');
 const [w,h]=row.dimensions,scale=256/Math.max(w,h),offset=[(256-w*scale)/2,(256-h*scale)/2];
 assert.equal(labels.get(row.id).transform.scale,scale);assert.deepEqual(labels.get(row.id).transform.offset,offset);
 const window=[-offset[0]/scale,-offset[1]/scale,(256-offset[0])/scale,(256-offset[1])/scale];
 assert.ok(window.every((v,i)=>Math.abs(v-row.window[i])<1e-9));
}
for(const fold of native.folds)await add('/'+fold.id+'.onnx',{path:path.join(path.dirname(plan.inputs.native.path),fold.onnx.path),sha256:fold.onnx.sha256},'application/octet-stream');
await fs.mkdir(args.output,{recursive:false});await fs.mkdir(path.join(args.output,'probe'));
const report={schema:'photo-browser-preprocessing-results-1',status:'running',plan:{path:args.plan,sha256:sha(planBytes)},sourceSha256:sha(await fs.readFile(new URL(import.meta.url))),rows:[],errors:[],scope:plan.protocol.scope};
const manifest=structuredClone(probe);manifest.methods=['canvas-wasm'];manifest.scope=plan.protocol.scope;manifest.exportPlan=report.plan;
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
const server=http.createServer((req,res)=>{const f=files.get(req.url);if(req.method!=='GET'||!f){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':f.type,'Content-Length':f.bytes.length,'Cache-Control':'no-store'}).end(f.bytes);});
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 report.browser=browser.version();const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await page.evaluate(()=>{globalThis.ort.env.wasm.numThreads=1;globalThis.ort.env.wasm.proxy=false;globalThis.ort.env.wasm.wasmPaths=location.origin+'/';});
 for(const fold of native.folds){
  await page.evaluate(async id=>{globalThis.session=await globalThis.ort.InferenceSession.create('/'+id+'.onnx',{executionProviders:['wasm']});},fold.id);
  for(const id of fold.heldOutIds){
   const input=probe.rows.find(r=>r.id===id),old=reference.photos.find(r=>r.id===id);assert.equal(old.fold,fold.id);
   const result=await page.evaluate(async({id,protocol})=>{
    const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
    const encode=b=>{let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);};
    const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality=protocol.smoothing;return{c,ctx};};
    const rgb=c=>{const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data,b=new Uint8Array(c.width*c.height*3);for(let i=0;i<b.length/3;i++)for(let k=0;k<3;k++)b[3*i+k]=a[4*i+k];return b;};
    const photo=new Image();photo.src='/photo/'+id+'.png';await photo.decode();
    const original=canvas(photo.width,photo.height);original.ctx.drawImage(photo,0,0);const sourceSha256=await digest(rgb(original.c));
    const archived=new Image();archived.src='/reference/'+id+'.png';await archived.decode();
    const ref=canvas(256,256);ref.ctx.drawImage(archived,0,0);const before=rgb(ref.c);
    const start=performance.now(),scale=256/Math.max(photo.width,photo.height),ox=(256-photo.width*scale)/2,oy=(256-photo.height*scale)/2;
    const pre=canvas(scale<1?Math.ceil(photo.width*scale):photo.width,scale<1?Math.ceil(photo.height*scale):photo.height);
    pre.ctx.drawImage(photo,0,0,pre.c.width,pre.c.height);
    const out=canvas(256,256);out.ctx.fillStyle='rgb('+protocol.fillRGB.join(',')+')';out.ctx.fillRect(0,0,256,256);
    out.ctx.drawImage(pre.c,ox,oy,photo.width*scale,photo.height*scale);const after=rgb(out.c),preprocessingMs=performance.now()-start;
    const infer=async bytes=>{const nchw=new Float32Array(3*256**2);for(let i=0;i<256**2;i++)for(let c=0;c<3;c++)nchw[c*256**2+i]=bytes[3*i+c]/255;
     const tensor=new globalThis.ort.Tensor('float32',nchw,[1,3,256,256]);const start=performance.now();const result=await globalThis.session.run({rgb:tensor});const ms=performance.now()-start;
     const data=result.probabilities.data.slice();result.probabilities.dispose();tensor.dispose();return{data,ms,inputSha256:await digest(nchw)};};
    const a=await infer(before),b=await infer(after);let total=0,maximum=0,changed=0;
    for(let i=0;i<before.length;i++){const d=Math.abs(before[i]-after[i]);total+=d;maximum=Math.max(maximum,d);changed+=Number(d!==0);}
    const heads=[];for(let c=0;c<2;c++){let maximum=0,total=0,changed=0;for(let i=c*256**2;i<(c+1)*256**2;i++){const d=Math.abs(a.data[i]-b.data[i]);maximum=Math.max(maximum,d);total+=d;changed+=Number((a.data[i]>=.5)!==(b.data[i]>=.5));}heads.push({head:['body','material'][c],maxAbsoluteDifference:maximum,meanAbsoluteDifference:total/256**2,changedHalfThresholdPixels:changed});}
    return{dimensions:[photo.width,photo.height],sourceSha256,referenceRgbSha256:await digest(before),referenceInputSha256:a.inputSha256,referenceOutputSha256:await digest(a.data),inputSha256:b.inputSha256,rgbSha256:await digest(after),rgbDifference:{maxAbsoluteDifference:maximum,meanAbsoluteDifference:total/before.length,changedChannels:changed},heads,preprocessingMs,inferenceMs:b.ms,data:encode(new Uint8Array(b.data.buffer)),preview:out.c.toDataURL('image/png').split(',')[1]};
   },{id,protocol:plan.protocol});
   assert.deepEqual(result.dimensions,input.dimensions);assert.equal(result.sourceSha256,input.decodedRGBSha256);
   assert.equal(result.referenceRgbSha256,old.decodedRGBSha256);assert.equal(result.referenceInputSha256,old.inputSha256);
   const expected=[];for(const head of ['body','material'])expected.push(await pinned({path:path.join(path.dirname(plan.inputs.probe.path),input.assets.wasm[head].path),sha256:input.assets.wasm[head].sha256}));
   assert.equal(result.referenceOutputSha256,sha(Buffer.concat(expected)),'Reference WASM replay changed');
   const raw=Buffer.from(result.data,'base64');assert.equal(raw.length,2*256**2*4);
   const target=manifest.rows.find(r=>r.id===id);target.assets={'canvas-wasm':{}};
   for(const [c,head] of ['body','material'].entries()){
    const bytes=raw.subarray(c*256**2*4,(c+1)*256**2*4),name=id+'-'+head+'.f32';
    for(let i=0;i<bytes.length;i+=4){const p=bytes.readFloatLE(i);assert.ok(Number.isFinite(p)&&p>=0&&p<=1);}
    await fs.writeFile(path.join(args.output,'probe',name),bytes);target.assets['canvas-wasm'][head]={path:name,sha256:sha(bytes)};
   }
   const png=Buffer.from(result.preview,'base64');await fs.writeFile(path.join(args.output,'probe',id+'-rgb.png'),png);
   delete result.data;delete result.preview;report.rows.push({id,fold:fold.id,...result});await save();console.log(id,JSON.stringify(result.heads));
  }
  await page.evaluate(()=>globalThis.session.release());
 }
 assert.deepEqual(report.rows.map(r=>r.id).sort(),probe.rows.map(r=>r.id).sort());assert.equal(report.errors.length,0);
 report.status='complete';report.referenceReplayExact=true;
 report.summary={photos:report.rows.length,exactRgbInputs:report.rows.filter(r=>r.rgbDifference.changedChannels===0).length,
  heads:['body','material'].map((head,c)=>({head,changedHalfThresholdPixels:report.rows.reduce((s,r)=>s+r.heads[c].changedHalfThresholdPixels,0),maxAbsoluteDifference:Math.max(...report.rows.map(r=>r.heads[c].maxAbsoluteDifference))}))};
 await fs.writeFile(path.join(args.output,'probe/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 report.artifactBytes=0;report.artifacts={};for(const name of await fs.readdir(path.join(args.output,'probe'))){const b=await fs.readFile(path.join(args.output,'probe',name));report.artifactBytes+=b.length;report.artifacts['probe/'+name]=sha(b);}
 assert.ok(report.artifactBytes<=plan.resources.maxArtifactBytes);await save();console.log(JSON.stringify(report.summary));
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
