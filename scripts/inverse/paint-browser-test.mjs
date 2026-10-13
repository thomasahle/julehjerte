/** Production Mal → image/mask → worker solve → editable SVG/PDF replay. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer as createHTTPServer} from 'node:http';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import {createCanvas,loadImage} from 'canvas';
import {motifFixture,topHatFixture,chordFrameFixture} from './motif-fixture.mjs';
import {treeMask} from './tree-fixture.mjs';
import {heartPhoto} from './crop-fixture.mjs';
import {catalogue,readPhoto} from './web-photo-data.mjs';
import {readHardPhoto} from './hard-photo-data.mjs';
import {prepare} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {auditEditablePaper} from './editable-paper-audit.mjs';
import {featureComponentMetrics} from './feature-component-metrics.mjs';
import {auditFeatureFidelity,auditFeatureFidelityChange} from '../../static/inverse/core/feature-shapes.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {installPaintObservation,collectPaintObservation} from './paint-observer.mjs';
import {stopIntervention,installStopObservation,exerciseStop} from './stop-browser-hooks.mjs';

const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let origin=process.env.INVERSE_TEST_URL||'http://localhost:5200';
const upstreamOrigin=origin;
const disableNumericalKernel=process.env.INVERSE_TEST_DISABLE_NUMERICAL_KERNEL==='1';
const names=(process.env.INVERSE_TEST_BROWSERS||'chromium,firefox,webkit').split(',');
const cases=(process.env.INVERSE_TEST_CASES||'star,hat,house,circle,hunodan,top-hat,top-hat-preferred,top-hat-independent,top-hat-anti').split(',');
const output=process.env.INVERSE_TEST_OUTPUT||`tmp/paint-browser/${new Date().toISOString().replace(/[:.]/g,'-')}`;
const repeats=Number(process.env.INVERSE_TEST_REPEATS||1);
const stopMode=process.env.INVERSE_TEST_STOP||null;
const viewport=process.env.INVERSE_TEST_MOBILE==='1'?{width:390,height:844}:{width:1440,height:1100};
assert.ok(Number.isInteger(repeats)&&repeats>=1&&repeats<=10,'Replay count must be between 1 and 10.');
const engineReference=process.env.INVERSE_TEST_ENGINE_REFERENCE?execFileSync('git',['rev-parse','--verify','--end-of-options',process.env.INVERSE_TEST_ENGINE_REFERENCE+'^{commit}'],{encoding:'utf8'}).trim():null;
const referenceFiles=new Map(),referenceSourceHashes={},referenceRequestCounts={};
assert.ok(!stopMode||!engineReference,'Stop interventions and a reference-engine replay are separate experiments.');
const intervention=stopMode?await stopIntervention(stopMode,origin):null;
let interventionArmed=Boolean(intervention);
let referenceServer=null;
if(engineReference){
 // Read the static snapshot before starting any browser timer. The page and
 // editor stay current; reports explicitly identify the substituted engine.
 const files=execFileSync('git',['ls-tree','-r','--name-only',engineReference,'--','static/inverse/core','static/inverse/worker.js','static/inverse/worker-bootstrap.js','static/inverse/worker-controller.js','static/inverse/compute-worker.js'],{encoding:'utf8'}).trim().split('\n');
 for(const file of files){const bytes=execFileSync('git',['show',`${engineReference}:${file}`],{maxBuffer:16*1024*1024});referenceFiles.set('/'+file.replace(/^static\//,''),bytes);referenceSourceHashes[file]=createHash('sha256').update(bytes).digest('hex');}
}
if(engineReference||intervention){
 // Firefox worker imports can bypass Playwright route overrides. Serve the
 // reference bytes over HTTP so every worker uses the actual snapshot.
 referenceServer=createHTTPServer(async(request,response)=>{
  try{
   const url=new URL(request.url,upstreamOrigin);
   if(url.origin!==new URL(upstreamOrigin).origin){response.writeHead(400);response.end();return;}
   const bytes=interventionArmed?intervention.files.get(url.pathname):referenceFiles.get(url.pathname);
   if(bytes){
    referenceRequestCounts[url.pathname]=(referenceRequestCounts[url.pathname]||0)+1;
    response.writeHead(200,{'Content-Type':url.pathname.endsWith('.wasm')?'application/wasm':url.pathname.endsWith('.json')?'application/json':'text/javascript','Cache-Control':'no-store'});
    response.end(bytes);return;
   }
   const upstream=await fetch(url,{redirect:'manual'}),headers={'Content-Type':upstream.headers.get('content-type')||'application/octet-stream','Cache-Control':'no-store'};
   const location=upstream.headers.get('location');if(location)headers.Location=location.replace(upstreamOrigin,origin);
   response.writeHead(upstream.status,headers);response.end(Buffer.from(await upstream.arrayBuffer()));
  }catch(error){response.writeHead(502);response.end(String(error));}
 });
 await new Promise((resolve,reject)=>{referenceServer.once('error',reject);referenceServer.listen(0,'127.0.0.1',resolve);});
 origin=`http://127.0.0.1:${referenceServer.address().port}`;
}
await fs.mkdir(output,{recursive:true});
const loader=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},cacheDir:path.resolve(output,'vite-cache'),server:{middlewareMode:true,hmr:false,ws:false},resolve:{alias:{$lib:path.resolve('src/lib')}}});
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
const {parseHeartFromSVG}=await loader.ssrLoadModule('/src/lib/utils/heartDesign.ts');
const {findFingersWithIssues,intersectionMarginPx}=await loader.ssrLoadModule('/src/lib/editor/curveIssues.ts');
const {inferOverlapRect}=await loader.ssrLoadModule('/src/lib/utils/overlapRect.ts');
const {rasterizeDesign}=await loader.ssrLoadModule('/src/lib/paint/rasterize.ts');
const {frameMismatch}=await loader.ssrLoadModule('/src/lib/paint/frame.ts');
const {resample,maskMismatch}=await loader.ssrLoadModule('/src/lib/paint/mask.ts');
const {convertCutGeometry}=await loader.ssrLoadModule('/src/lib/inverse/toHeartDesign.ts');
const {conversionFidelity}=await loader.ssrLoadModule('/src/lib/inverse/conversionFidelity.ts');
const results=[];
const report={origin,upstreamOrigin,gitCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runtime:process.version,disableNumericalKernel,repeats,engineReference,referenceSourceHashes,referenceRequestCounts,stopMode,viewport,intervention:intervention&&{hashes:intervention.hashes,method:intervention.method},
 timingVersion:2,timingMethod:'Page-clock timestamps from the Find click, worker requests/replies and the first visible, enabled Open in Draw button. DOM readiness is not a paint timestamp. Result capture and artifact writes happen afterward and have separate Node-clock durations. Version 1 solveAndConversionSeconds included harness capture and artifact writes and is not directly comparable.',
 harnessSourceHashes:{},workspaceSourceHashes:{},results};
for(const file of['scripts/inverse/paint-browser-test.mjs','scripts/inverse/paint-observer.mjs','scripts/inverse/motif-fixture.mjs','scripts/inverse/tree-fixture.mjs','scripts/inverse/crop-fixture.mjs','scripts/inverse/web-photo-data.mjs','scripts/inverse/hard-photo-data.mjs','scripts/inverse/editable-paper-audit.mjs','scripts/inverse/feature-component-metrics.mjs','scripts/inverse/fixtures/photographic-bird-fit.json','scripts/inverse/fixtures/photographic-leaf-routing.json','scripts/inverse/fixtures/photographic-checkerboard-fits.json','scripts/inverse/stop-browser-hooks.mjs'])report.harnessSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
for(const file of['static/inverse/worker.js','static/inverse/worker-bootstrap.js','static/inverse/worker-controller.js','static/inverse/compute-worker.js','static/inverse/core/engine.js','static/inverse/core/stopped.js','static/inverse/core/progress.js'])report.workspaceSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
for(const file of ['static/inverse/core/feature-recovery.js','static/inverse/core/solver.js','static/inverse/core/routing.js','static/inverse/core/crop.js','static/inverse/locator/locator.js','static/inverse/locator/fields.js','static/inverse/locator/math.js','static/inverse/locator/palette.js','static/inverse/locator/anchored.js','static/inverse/locator/grid-refine.js'])report.workspaceSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
for(const file of ['static/inverse/core/automatic.js','static/inverse/core/input.js','static/inverse/core/image-reference.js','static/inverse/core/image-features.js','static/inverse/core/direct/image-objective.js','static/inverse/core/direct/prefer-matching.js','static/inverse/core/direct/symmetry.js','src/lib/inverse/engine.ts','static/inverse/core/direct/finalize.js','static/inverse/core/direct/topology.js','static/inverse/core/direct/fit.js','static/inverse/core/direct/share.js','static/inverse/core/direct/initialize.js','static/inverse/core/direct/counts.js','static/inverse/core/direct/feature-seeds.js','static/inverse/core/direct/feature-details.js','static/inverse/core/direct/outline-details.js','static/inverse/core/direct/polish.js','static/inverse/core/direct/matching.js','src/lib/inverse/toHeartDesign.ts','src/lib/inverse/simplifyCurves.ts','src/lib/editor/curveIssues.ts','src/lib/components/paint/PaintPage.svelte'])report.workspaceSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
report.workspaceSourceHashes['src/lib/inverse/conversionFidelity.ts']=createHash('sha256').update(await fs.readFile('src/lib/inverse/conversionFidelity.ts')).digest('hex');
report.workspaceSourceHashes['static/inverse/core/feature-shapes.js']=createHash('sha256').update(await fs.readFile('static/inverse/core/feature-shapes.js')).digest('hex');
for(const file of ['source.json','native.png','downsample.png']){const name='scripts/inverse/fixtures/flower-resolution/'+file;report.harnessSourceHashes[name]=createHash('sha256').update(await fs.readFile(name)).digest('hex');}
report.workspaceSourceHashes['static/inverse/core/self-returns.js']=createHash('sha256').update(await fs.readFile('static/inverse/core/self-returns.js')).digest('hex');
for(const file of ['scripts/inverse/fixtures/photographic-anchor-perturbation.json','scripts/inverse/fixtures/photographic-anchor-perturbation.png','scripts/inverse/fixtures/faded-frame-mask.json','scripts/inverse/fixtures/faded-frame-mask.png'])report.harnessSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
report.workspaceSourceHashes['static/inverse/core/self-intersections.js']=createHash('sha256').update(await fs.readFile('static/inverse/core/self-intersections.js')).digest('hex');
report.workspaceSourceHashes['static/inverse/core/direct/grid.js']=createHash('sha256').update(await fs.readFile('static/inverse/core/direct/grid.js')).digest('hex');
report.harnessSourceHashes['scripts/inverse/fixtures/photographic-gift-fit.json']=createHash('sha256').update(await fs.readFile('scripts/inverse/fixtures/photographic-gift-fit.json')).digest('hex');
report.harnessSourceHashes['scripts/inverse/fixtures/browser-puppy-half-mask.json']=createHash('sha256').update(await fs.readFile('scripts/inverse/fixtures/browser-puppy-half-mask.json')).digest('hex');
report.harnessSourceHashes['scripts/inverse/fixtures/photographic-puppy-fit.json']=createHash('sha256').update(await fs.readFile('scripts/inverse/fixtures/photographic-puppy-fit.json')).digest('hex');
report.harnessSourceHashes['scripts/inverse/fixtures/photographic-near-miss-seed.json']=createHash('sha256').update(await fs.readFile('scripts/inverse/fixtures/photographic-near-miss-seed.json')).digest('hex');
for(const name of ['junctions.js','border.js','geometry.js','material.js','validate.js','settings.js']){const file=`static/inverse/core/${name}`;report.workspaceSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');}
report.harnessSourceHashes['scripts/inverse/fixtures/maple-comparison.json']=createHash('sha256').update(await fs.readFile('scripts/inverse/fixtures/maple-comparison.json')).digest('hex');
report.harnessSourceHashes['scripts/inverse/fixtures/sloth-rejected-routing.json']=createHash('sha256').update(await fs.readFile('scripts/inverse/fixtures/sloth-rejected-routing.json')).digest('hex');
report.harnessSourceHashes['scripts/inverse/fixtures/sloth-clearance-routing.json']=createHash('sha256').update(await fs.readFile('scripts/inverse/fixtures/sloth-clearance-routing.json')).digest('hex');
report.workspaceSourceHashes['static/inverse/core/direct/rejected-routing.js']=createHash('sha256').update(await fs.readFile('static/inverse/core/direct/rejected-routing.js')).digest('hex');
for(const file of ['static/inverse/core/direct/refine.js','static/inverse/core/direct/clamped-features.js','static/inverse/core/direct/primitive-selection.js','static/inverse/core/direct/primitives.js','static/inverse/core/direct/shared-simplification.js','static/inverse/core/direct/curves.js','static/inverse/core/direct/curve-topology.js','static/inverse/core/direct/short-returns.js'])report.workspaceSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
for(const file of ['src/lib/components/editor/SymmetryRows.svelte','src/lib/components/ui/toggle-group/toggle-group.svelte','src/lib/components/paint/FramePanel.svelte','src/lib/components/paint/MaskToolPanel.svelte','src/lib/i18n/translations.ts','src/lib/components/paint/FindCutsPanel.svelte'])report.workspaceSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
try{
 for(const browserName of names){
  const browser=await browsers[browserName].launch({headless:true});
  try{for(let repeat=0;repeat<repeats;repeat++)for(const name of cases){
   interventionArmed=Boolean(intervention);
   const chordMode=name==='chord-frame-sym'?'sym':name==='chord-frame-anti'?'anti':null;
   const slothShift={'sloth-x-shift-mask':'x-plus-1','sloth-y-shift-mask':'y-minus-1'}[name];
   const flowerMask=['flower-native-mask','flower-downsample-mask'].includes(name),anchorMask=name==='anchor-spatial-mask',fadedFrameMask=name==='faded-frame-mask',slothMask=name==='sloth-routing-mask'||Boolean(slothShift);
   const unequalLobes=name==='unequal-lobes',webPhoto=name.startsWith('web-'),hardPhoto=name.startsWith('hard-'),photoMask=flowerMask||anchorMask||fadedFrameMask||slothMask||['near-miss-mask','near-miss-shift-mask','near-miss-y-shift-mask','near-miss-diagonal-mask','leaf-mask','maple-leaf-mask','bird-mask','bird-shift-mask','bird-y-shift-mask','gift-mask','puppy-shift-mask','floral-checker-mask','warped-checker-mask','fine-checker-mask'].includes(name),photograph=unequalLobes||webPhoto||hardPhoto||name==='hunodan'||name.startsWith('hunodan-');
   const topHat=['top-hat','top-hat-preferred','top-hat-independent','top-hat-anti','top-hat-free-small'].includes(name),small=name.endsWith('-free-small'),free=topHat||name.endsWith('-free')||small,frameSize=small?.64:.84;
   const dir=path.join(output,`${browserName}-${name}${repeats>1?`-repeat-${repeat+1}`:''}`);await fs.mkdir(dir,{recursive:true});
   const row={browser:browserName,browserVersion:browser.version(),name,...(repeats>1?{repeat:repeat+1}:{}),pageErrors:[]};results.push(row);
   const referenceStart={...referenceRequestCounts};
   const context=await browser.newContext({viewport,acceptDownloads:true});
   let page;
   try{
    await context.route('**/*',route=>{
     const url=new URL(route.request().url());
     if(disableNumericalKernel&&url.pathname.endsWith('/inverse/core/direct/native/boundary.wasm')){row.blockedKernelRequests=(row.blockedKernelRequests||0)+1;return route.abort();}
     return url.origin===new URL(origin).origin?route.continue():route.abort();
    });
    page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
    // Observe the real worker; no target, seed, count or fitted geometry is
    // supplied to it by this test. Capture what the visitor actually solved.
    await page.addInitScript(installPaintObservation);
    if(stopMode)await page.addInitScript(installStopObservation);
    await page.goto(`${origin}/en/editor/paint/`);
    // The root layout sets the inline paper colours in onMount. Production
    // can finish loading its HTML before dynamic imports attach the handlers.
    await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--paper-left')!=='');
    const button=label=>page.getByRole('button',{name:label,exact:true}).first();
    const symmetry=async()=>{
     const rows={};
     for(const [key,label]of[['curve','Within curve symmetry'],['lobe','Within lobe symmetry'],['lobes','Between lobes symmetry']]){
      const selected=await page.getByRole('radiogroup',{name:label,exact:true}).getByRole('radio',{checked:true}).innerText();
      rows[key]=selected.trim().toLowerCase();assert.ok(['off','sym','anti'].includes(rows[key]));
     }
     return rows;
    };
    const matchingBox=page.locator('input[aria-describedby="matching-sheets-hint"]');
    assert.equal(await matchingBox.isChecked(),true,'Matching is preferred before any mask is imported.');
    if(name==='top-hat-independent'){
     await page.locator('details.advanced > summary').click();
     await matchingBox.uncheck();await button('Reset').click();
     assert.equal(await matchingBox.isChecked(),true,'Reset restores the default matching preference.');
     await matchingBox.uncheck();await page.locator('details.advanced > summary').click();
    }
    if(name==='star')await button('Try the star').click();
    else{
     const file=path.join(dir,'input.png');
     if(hardPhoto){
      const half=name.endsWith('-half'),id=half?name.slice(5,-5):name.slice(5);
      const data=JSON.parse(await fs.readFile('scripts/inverse/photo-cases.json')),entry=data.cases.find(c=>c.id===id);assert.ok(entry,`Unknown hard photograph ${name}`);
      const photo=await readHardPhoto(entry);
      if(half){
       const c=createCanvas(Math.round(photo.imageWidth/2),Math.round(photo.imageHeight/2));c.getContext('2d').drawImage(photo.canvas,0,0,c.width,c.height);
       await fs.writeFile(file,c.toBuffer('image/png'));
       row.inputPerturbation={kind:'half-resolution',width:c.width,height:c.height,pixelsSha256:createHash('sha256').update(c.getContext('2d').getImageData(0,0,c.width,c.height).data).digest('hex')};
      }else await fs.copyFile(entry.file,file);
      row.sourcePhoto={id:entry.id,sha256:photo.fileSha256,decodedPixelsSha256:photo.rgbaSha256};
     }else if(photoMask){
      // Hold crop/classification fixed to isolate the real worker and editor
      // path. Upload pixels, never saved cutting paths or a fitting seed.
      let fixture,photo,fixedMask;
      if(slothMask){
       const file=slothShift?'scripts/inverse/fixtures/sloth-clearance-routing.json':'scripts/inverse/fixtures/sloth-rejected-routing.json',bytes=await fs.readFile(file),catalog=JSON.parse(bytes),data=slothShift?catalog.cases.find(c=>c.id===slothShift):catalog;
       const resizedHashes={'x-plus-1':'3e296fe2d3c49167d74ce59a20654efc12ef37e12fbc2f6cff21ee3cce036ff4','y-minus-1':'2904b2fd0ca28a4ba23f0bf1cd24424f67965f059a22e0f48306615eb46df047'};
       fixture={sourceCase:data.caseId||data.id,quad:null,maskSha256:data.maskSha256,paintImport:{resolution:400,
        method:'The unchanged 250-pixel upload is resized to the paint canvas at destination-cell centers. This browser target differs from the native-resolution routing diagnostic.',
        maskSha256:resizedHashes[slothShift]||'f76e4c8a4a16d227f13d36d1feeee4fb84681b35d128c6ab4b14bb3f775a47b7'}};
       fixedMask=new Uint8Array(data.resolution**2);for(const[start,length]of data.maskRuns)fixedMask.fill(1,start,start+length);
       row.sourceMaskFixture={file,sha256:createHash('sha256').update(bytes).digest('hex'),scope:'Classified pixels only; saved rejected routing proposals are not supplied to the worker.'};
      }else if(fadedFrameMask){
       const data=JSON.parse(await fs.readFile('scripts/inverse/fixtures/faded-frame-mask.json')),entry=data.classification;
       photo=await readHardPhoto({file:entry.file,sha256:entry.sha256,width:entry.resolution,height:entry.resolution});
       const binary=Uint8Array.from({length:entry.resolution**2},(_,i)=>Number(photo.rgba[i*4]<128));
       fixture={sourceCase:data.id,quad:null,maskSha256:createHash('sha256').update(binary).digest('hex')};
      }else if(name==='maple-leaf-mask'){
       const data=JSON.parse(await fs.readFile('scripts/inverse/fixtures/maple-comparison.json'));
       fixture={...data,sourceCase:data.case};
       const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));photo=await readHardPhoto(catalogue.source);
      }else if(anchorMask){
       fixture={...JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-anchor-perturbation.json')),quad:null};
       photo=await readHardPhoto({file:fixture.maskFile,sha256:fixture.imageSha256,width:fixture.resolution,height:fixture.resolution});
      }else if(['near-miss-mask','near-miss-shift-mask','near-miss-y-shift-mask','near-miss-diagonal-mask'].includes(name)){
       fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-near-miss-seed.json'));
       if(name!=='near-miss-mask'){const shift=fixture.translations[name==='near-miss-diagonal-mask'?'negative-diagonal':name==='near-miss-y-shift-mask'?'vertical':'horizontal'];fixture={...fixture,...shift,quad:fixture.quad.map(p=>p.map((v,axis)=>v+shift.offset[axis]))};}
       const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
      }else if(flowerMask){
       const data=JSON.parse(await fs.readFile('scripts/inverse/fixtures/flower-resolution/source.json')),entry=data.cases.find(c=>c.variant===name.slice(7,-5));
       assert.ok(entry);fixture={...entry,quad:null,sourceCase:name.slice(0,-5)};
       photo=await readHardPhoto({file:entry.rectifiedPhoto,sha256:entry.sha256,width:400,height:400});
      }else{
       const data=JSON.parse(await fs.readFile(name==='leaf-mask'?'scripts/inverse/fixtures/photographic-leaf-routing.json':['bird-shift-mask','bird-y-shift-mask'].includes(name)?'scripts/inverse/fixtures/photographic-bird-fit.json':name==='puppy-shift-mask'?'scripts/inverse/fixtures/photographic-puppy-fit.json':['bird-mask','gift-mask'].includes(name)?`scripts/inverse/fixtures/photographic-${name.slice(0,-5)}-fit.json`:'scripts/inverse/fixtures/photographic-checkerboard-fits.json'));
       fixture=data.cases?{sourceCatalogue:data.sourceCatalogue,...data.cases.find(c=>c.sourceCase===name.slice(0,-5))}:data;
       if(name==='bird-shift-mask')fixture={...fixture,quad:fixture.quad.map(([x,y])=>[x+1,y]),maskSha256:'bc122e4659773ece5abab69eae4934c528c8eba8feda8c0aa92d5e6ba86afe91'};
       if(name==='bird-y-shift-mask')fixture={...fixture,quad:fixture.quad.map(([x,y])=>[x,y+1]),maskSha256:'877e2d912dc8bc574c99154dc5a3de16a8d675c899f022c4a517f9216618dd72'};
       if(name==='puppy-shift-mask')fixture={...fixture,quad:fixture.quad.map(([x,y])=>[x+1,y]),maskSha256:'a96eea21b65604e2a7b9b93d6823cdd58937bebd66fceeb80e9a1f5c2812c1cc'};
       const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));photo=await readHardPhoto(catalogue.source||catalogue.cases.find(c=>c.id===fixture.sourceCase));
      }
      const mask=fixedMask||prepare({...photo,quad:fixture.quad},AUTOMATIC_PRESET).preview.mask;
      assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
      const n=Math.sqrt(mask.length),c=createCanvas(n,n),ctx=c.getContext('2d'),pixels=ctx.createImageData(n,n);
      for(let i=0;i<mask.length;i++)pixels.data.set(mask[i]?[185,19,19,255]:[255,255,255,255],4*i);
      ctx.putImageData(pixels,0,0);await fs.writeFile(file,c.toBuffer('image/png'));
      row.sourcePhoto={id:fixture.sourceCase,sha256:photo?.fileSha256??null,quad:fixture.quad,fixedMaskSha256:fixture.maskSha256,...(fixture.paintImport?{paintImport:fixture.paintImport}:{})};
     }else if(webPhoto){
      const data=await catalogue(),entry=data.cases.find(c=>c.id===name.slice(4));assert.ok(entry,`Unknown photograph ${name}`);
      const photo=data.photos.find(p=>p.id===entry.photo),input=await readPhoto(photo),roi=entry.roi||[0,0,input.imageWidth,input.imageHeight],c=createCanvas(roi[2]-roi[0],roi[3]-roi[1]),ctx=c.getContext('2d'),pixels=ctx.createImageData(input.imageWidth,input.imageHeight);
      pixels.data.set(input.rgba);ctx.putImageData(pixels,-roi[0],-roi[1]);await fs.writeFile(file,c.toBuffer('image/png'));row.sourcePhoto={id:photo.id,sha256:photo.sha256,roi:entry.roi};
     }else if(unequalLobes){
      await fs.writeFile(file,heartPhoto({colours:['#ba151a','#f5f2ef'],lobeDepths:[.75,.4]}).canvas.toBuffer('image/png'));
     }else if(photograph){
      const metadata=JSON.parse(await fs.readFile('scripts/inverse/fixtures/hunodan/speed-crops.json'));
      const e=name==='hunodan'?metadata.cases[0]:metadata.cases.find(e=>e.id===name.slice('hunodan-'.length));assert.ok(e,`Unknown photograph ${name}`);
      const [x,y,x1,y1]=e.photoROI,im=await loadImage(e.source),c=createCanvas(x1-x,y1-y);c.getContext('2d').drawImage(im,-x,-y);await fs.writeFile(file,c.toBuffer('image/png'));
     }else if(name==='noisy-tree'){
      const mask=treeMask({noisyEdges:[0,3]}),c=createCanvas(400,400),ctx=c.getContext('2d'),pixels=ctx.createImageData(400,400);
      for(let i=0;i<mask.length;i++)pixels.data.set(mask[i]?[190,20,20,255]:[255,255,255,255],4*i);
      ctx.putImageData(pixels,0,0);await fs.writeFile(file,c.toBuffer('image/png'));
     }else if(name==='noisy-checker'){
      const c=createCanvas(400,400),ctx=c.getContext('2d');
      // Unequal strip widths prevent automatic symmetry folding from removing
      // the defect before the worker sees it. All nominal strips are wide.
      const xx=[0,72,176,296,400],yy=[0,96,212,332,400];
      for(let y=0;y<4;y++)for(let x=0;x<4;x++){ctx.fillStyle=(x+y)%2?'#be1414':'#ffffff';ctx.fillRect(xx[x],yy[y],xx[x+1]-xx[x],yy[y+1]-yy[y]);}
      ctx.fillStyle='#be1414';ctx.fillRect(190,0,10,2);
      await fs.writeFile(file,c.toBuffer('image/png'));
     }else await fs.writeFile(file,chordMode?chordFrameFixture(chordMode):topHat?topHatFixture(200,{quarterTurns:name==='top-hat-anti'?1:0}):free?motifFixture(name.replace(/-free(?:-small)?$/,'')).original:motifFixture(name).png);
     await button('Import picture').click();await page.locator('input[type=file]').setInputFiles(file);
     if(!photograph)await button('The whole picture').click();
     else await page.locator('button.corner').nth(3).waitFor();
     await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Use as mask'&&!b.disabled));
     await page.screenshot({path:path.join(dir,'import.png'),fullPage:true});
     await button('Use as mask').click();
     if(free){
      await page.getByRole('radio',{name:'Free',exact:true}).click();
      if(!small){await page.locator('#paint-frame-size').focus();await page.locator('#paint-frame-size').press('End');}
      assert.equal(await page.locator('#paint-frame-size').inputValue(),String(frameSize*100));
      if(name==='top-hat-independent'||name==='top-hat-preferred')await page.getByRole('radiogroup',{name:'Between lobes symmetry',exact:true}).getByRole('radio',{name:'Off',exact:true}).click();
      if(name==='top-hat-anti')await page.getByRole('radiogroup',{name:'Between lobes symmetry',exact:true}).getByRole('radio',{name:'Anti',exact:true}).click();
     }
    }
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Find the cuts'&&!b.disabled));
    if(chordMode)await page.getByRole('radiogroup',{name:'Within curve symmetry',exact:true}).getByRole('radio',{name:chordMode==='sym'?'Sym':'Anti',exact:true}).click();
    row.matchingRequested=await matchingBox.isChecked();
    assert.equal(row.matchingRequested,name!=='top-hat-independent','Import and symmetry changes must preserve the preference.');
    row.requestedSymmetry=await symmetry();
    if(name==='top-hat-independent'||name==='top-hat-preferred'){
     await page.getByRole('button',{name:'Undo',exact:true}).click();
     assert.equal(await matchingBox.isChecked(),row.matchingRequested,'Undoing symmetry must preserve the fitting preference.');
     await page.getByRole('button',{name:'Redo',exact:true}).click();
     assert.equal(await matchingBox.isChecked(),row.matchingRequested,'Redoing symmetry must preserve the fitting preference.');
     assert.deepEqual(await symmetry(),row.requestedSymmetry);
    }
    if(name==='top-hat-anti'){
     assert.equal(row.requestedSymmetry.lobes,'anti');
     // Selecting the active radio must not clear the primitive's selection
     // while leaving the solver's symmetry model unchanged. Exercise pointer
     // and keyboard input, and prove ordinary mode changes still work.
     for(const label of['Within curve symmetry','Within lobe symmetry','Between lobes symmetry','Border','Brush','Paints with']){
      const group=page.getByRole('radiogroup',{name:label,exact:true}),selected=group.getByRole('radio',{checked:true}),word=await selected.getAttribute('aria-label')||(await selected.innerText()).trim(),radio=group.getByRole('radio',{name:word,exact:true});
      await radio.click();assert.equal(await radio.getAttribute('aria-checked'),'true');
      await radio.press('Space');assert.equal(await radio.getAttribute('aria-checked'),'true');
      assert.equal(await group.getByRole('radio',{checked:true}).count(),1);
     }
     const between=page.getByRole('radiogroup',{name:'Between lobes symmetry',exact:true});
     await between.getByRole('radio',{name:'Off',exact:true}).click();assert.equal(await between.getByRole('radio',{name:'Off',exact:true}).getAttribute('aria-checked'),'true');
     await between.getByRole('radio',{name:'Anti',exact:true}).click();assert.equal(await between.getByRole('radio',{name:'Anti',exact:true}).getAttribute('aria-checked'),'true');
     assert.deepEqual(await symmetry(),row.requestedSymmetry);
     row.symmetryControlChecks={paint:true};
    }
    await button('Find the cuts').click();
    if(stopMode)await exerciseStop(page,stopMode,{disarm:()=>{interventionArmed=false;},dir});
    await page.waitForFunction(()=>{const qa=window.__paintQA;return qa.error||qa.marks&&qa.marks.ready!==null||qa.result&&document.querySelector('[role=alert]');},{},{timeout:190000});
    const captureStart=performance.now(),observed=await page.evaluate(collectPaintObservation);
    row.captureSeconds=(performance.now()-captureStart)/1000;
    assert.equal(observed.error,null,JSON.stringify(observed.error));
    assert.ok(observed.marks&&observed.marks.ready!==null,'A successful solve must make Open in Draw ready.');
    row.timings=observed.timings;row.pageMarks=observed.marks;
    if(stopMode){
     row.stop=await page.evaluate(()=>window.__stopQA);
     const keep=stopMode==='keep'||stopMode==='keep-finer'||stopMode==='keep-detail';
     assert.equal(Boolean(observed.result.report.stoppedEarly),keep);
     if(keep){
      assert.equal(row.stop.stopId,row.stop.resultId,'Stop must resolve the existing solve request.');
      row.stopToReadySeconds=(row.pageMarks.ready-row.stop.stopSent)/1000;
      assert.ok(row.stopToReadySeconds<10,`Stop waited ${row.stopToReadySeconds} s despite a retained checkpoint.`);
      assert.ok(observed.result.report.alternatives.length>0);
      assert.deepEqual(JSON.parse(observed.result.files['report.json']).alternatives,observed.result.report.alternatives);
      assert.match(await page.locator('.summary[role=status]').innerText(),/Best result from the stopped search/);
      if(stopMode==='keep-finer'||stopMode==='keep-detail'){
       assert.equal(observed.result.report.settings.materialResolution,700);
       assert.equal(observed.result.report.solver.paperVerification.source,'retained-checkpoint');
       assert.equal(observed.result.report.templateChecksPassed,true);
      }
     }
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    for(const [key,value]of Object.entries(row.timings))assert.ok(Number.isFinite(value)&&value>=0,`${key}: ${value}`);
    const phases=Object.entries(row.timings).filter(([key])=>key!=='clickToReadySeconds').reduce((sum,[,value])=>sum+value,0);
    assert.ok(Math.abs(phases-row.timings.clickToReadySeconds)<1e-7,'Page-clock phases must sum to DOM readiness.');
    const writeStart=performance.now();
    await fs.writeFile(path.join(dir,'prepared.json'),JSON.stringify(observed.prepared));
    await fs.writeFile(path.join(dir,'engine-report.json'),JSON.stringify(observed.result.report,null,2));
    await fs.writeFile(path.join(dir,'cut_geometry.json'),observed.result.files['cut_geometry.json']);
    row.artifactWriteSeconds=(performance.now()-writeStart)/1000;
    row.reportedFitSeconds=observed.result.report.solver.seconds;
    if(engineReference){
     row.referenceEngineRequests={};
     for(const file of['/inverse/core/solver.js','/inverse/core/direct/topology.js']){
      row.referenceEngineRequests[file]=(referenceRequestCounts[file]||0)-(referenceStart[file]||0);
      assert.ok(row.referenceEngineRequests[file]>0,`The reference server must deliver ${file} to this worker.`);
     }
    }
    if(observed.crop?.candidates?.[0]){
     const crop=observed.crop.candidates[0];
     row.detectedCrop={quad:crop.quad,status:crop.status,locatorVersion:crop.locator.version,lobeRefinement:crop.locator.lobeRefinement};
    }
    if(unequalLobes){
     assert.equal(row.detectedCrop?.lobeRefinement?.accepted,true,'The actual upload must refine the unequal caps.');
     const expected=[[190,80],[275,155],[190,230],[105,155]];
     row.cornerError=Math.max(...row.detectedCrop.quad.map((p,i)=>Math.hypot(p[0]-expected[i][0],p[1]-expected[i][1])));
     assert.ok(row.cornerError<3,`Known overlap displacement: ${row.cornerError}`);
     assert.deepEqual(observed.result.report.slits,{left:3,right:3});
    }
    row.solveSettings=observed.solveSettings;
    row.matchingPreference=observed.result.report.solver.matchingPreference;
    row.primitiveSelection=observed.result.report.solver.finalPrimitiveSelection;
    row.curvePrimitiveSelection=observed.result.report.solver.finalCurvePrimitiveSelection;
    assert.equal(observed.solveSettings.preferMatchingSheets,row.matchingRequested,'The preference must reach the worker.');
    if(Object.values(row.requestedSymmetry).every(v=>v==='off'))assert.equal(row.matchingPreference.enabled,row.matchingRequested,'No-symmetry solves must honour the independent matching preference.');
    if(name==='top-hat-preferred')assert.equal(row.matchingPreference.identical,true,'A reusable hat template must be found without forcing mask symmetry.');
    row.engineError=observed.result.report.imageError.mismatchFraction;
    row.selectedCounts=observed.result.report.solver.selectedCounts;
    row.extraGridComparisons=observed.result.report.solver.extraGridComparisons;
    row.earlyFeatureInitialization=observed.result.report.solver.earlyFeatureInitialization;
    row.featureInitialization=observed.result.report.solver.featureInitialization;
    row.samplingRecovery=observed.result.report.solver.samplingRecovery;
    row.featureRecovery=observed.result.report.solver.featureRecovery;
    row.templateChecksPassed=observed.result.report.templateChecksPassed;
    row.missingFeatures=observed.result.report.imageFidelity?.features.missing;
    if(anchorMask&&!engineReference){
     assert.deepEqual(row.selectedCounts,[4,4]);assert.ok(row.engineError<.025);
    }
    if(flowerMask&&!engineReference){
     assert.deepEqual(row.selectedCounts,[3,3]);assert.ok(row.engineError<.01);
    }
    if(fadedFrameMask&&!engineReference){
     assert.equal(row.earlyFeatureInitialization?.trigger,'weak-region');
     assert.equal(row.earlyFeatureInitialization.stage,'after-recovery');
     assert.ok(row.engineError<.025);
    }
    if(photoMask){
     assert.equal(createHash('sha256').update(Uint8Array.from(observed.prepared.mask)).digest('hex'),row.sourcePhoto.paintImport?.maskSha256??row.sourcePhoto.fixedMaskSha256);
     if(row.sourcePhoto.paintImport)assert.equal(observed.prepared.resolution,row.sourcePhoto.paintImport.resolution);
     if(!engineReference){
      if(name==='near-miss-mask')assert.equal(row.featureInitialization?.coarseRefinement?.accepted,true,'The real worker must exercise the near-miss initialization refinement.');
      if(name==='near-miss-shift-mask')assert.equal(row.featureInitialization?.alternativeRefinement?.accepted,true,'The real worker must reuse the previously discarded three-cut start.');
      if(['near-miss-y-shift-mask','near-miss-diagonal-mask'].includes(name))assert.equal(row.samplingRecovery?.scheduled,1,'The real worker must try the sampling fallback after the ordinary fit fails.');
      assert.equal(row.templateChecksPassed,true,'Source features must survive the actual worker and final checks.');
      assert.equal(row.missingFeatures.length,0);assert.ok(row.engineError<.03);
     }
    }
    if(hardPhoto||photoMask){
     row.featureNoticeVisible=await page.getByText('Some details of the motif are missing. Compare the template with the mask.',{exact:true}).isVisible();
     assert.equal(row.featureNoticeVisible,row.missingFeatures.length>0,'The page must show the feature failure even below its ordinary percentage warning.');
     if(name==='hard-flettede-puppy-half'){
      const frozen=JSON.parse(await fs.readFile('scripts/inverse/fixtures/browser-puppy-half-mask.json'));
      row.classifiedMaskSha256=createHash('sha256').update(Uint8Array.from(observed.prepared.mask)).digest('hex');
      assert.equal(row.classifiedMaskSha256,frozen.maskSha256,'Template improvements must use the same browser-classified pixels');
      assert.deepEqual(row.detectedCrop.quad,frozen.detectedCrop.quad,'The automatic crop remains fixed in this fitting regression');
     }
     if(['hard-flettede-puppy','hard-flettede-puppy-half','hard-flettede-stonehenge','hard-flettede-viking'].includes(name)&&!engineReference){
      assert.equal(row.templateChecksPassed,true,'The actual uploaded photograph must retain its interior features and pass the template checks.');
      assert.equal(row.missingFeatures.length,0);
      assert.ok(row.engineError<(name.startsWith('hard-flettede-puppy')?.018:.03));
     }
    }
    row.numericalBackend=observed.result.report.solver.numericalBackend?.backend;
    row.paperKernels=observed.result.report.solver.paperKernels;
    row.boundaryKernels=observed.result.report.solver.boundaryKernels;
    if(disableNumericalKernel){assert.ok(row.blockedKernelRequests>0,'The real worker must attempt the blocked kernel request.');assert.equal(row.numericalBackend,'javascript');}
    assert.equal(Boolean(observed.prepared.weights),free,'Free-border importance weights must reach the real worker.');
    assert.equal(observed.result.report.validation.passed,true);
    assert.equal(observed.result.report.manufacturing.status,'pass');
    if(name==='maple-leaf-mask'&&!engineReference){
     assert.equal(row.templateChecksPassed,true);
     assert.deepEqual(observed.result.report.slits,{left:3,right:3});
     assert.ok(row.engineError<.012);
     assert.ok(observed.result.report.solver.extraGridComparisons.some(r=>r.reason==='simpler-layout'&&r.selectedCounts?.every(n=>n===3)),
      'The later simpler layout must reach the real worker and editable export.');
    }
    if(name==='web-bibel-checker-3'&&!engineReference){
     assert.deepEqual(observed.result.report.slits,{left:2,right:2},'Conflicting photo borders must not hide the better simpler finalist.');
     assert.equal(observed.result.report.templateChecksPassed,true);
     assert.ok(row.engineError<.02,'The simpler pair must still explain the uploaded mask.');
    }
    if(name==='web-danish-tree-red'&&!engineReference){
     assert.equal(observed.result.report.solver.featureRecovery?.refinementSeedAvailable,true);
     assert.equal(observed.result.report.solver.featureRecovery.gridMismatchTrigger,true);
     assert.equal(row.templateChecksPassed,true);
     assert.equal(row.missingFeatures.length,0);
     assert.ok(await page.getByText(/The pattern is close, but not exact:/).isVisible());
     assert.ok(row.engineError<.025,'The recovered tree must improve on the discarded-routing result.');
     assert.ok(row.timings.clickToReadySeconds<12,'A one-pixel crop fringe must not trigger another minute of grid retries.');
    }
    if(name==='web-danish-tree-green'){
     assert.equal(observed.result.report.solver.coarseTopologyInitialization?.accepted,true,'The uploaded photograph must exercise coarse routing.');
     assert.equal(observed.result.report.templateChecksPassed,true);
     assert.deepEqual(observed.result.report.slits,{left:3,right:3});
     assert.equal(row.matchingPreference.enabled,true);
     assert.equal(row.matchingPreference.status,'image_bound_exceeds_allowance');
     assert.equal(row.matchingPreference.identical,false,'Preference cannot override the one-point limit.');
    }
    if(name==='web-danish-tree-group-right'&&!engineReference){
     assert.equal(observed.result.report.solver.featureRecovery?.borderSeedRetry,true);
     assert.deepEqual(observed.result.report.slits,{left:3,right:3});
     assert.equal(row.templateChecksPassed,true);assert.equal(row.missingFeatures.length,0);
     assert.ok(row.engineError<.025,'An edge-profile initialization must still match the original uploaded mask.');
     assert.ok(row.timings.clickToReadySeconds<12,'The fallback should return without exhausting the long browser search.');
    }
    if(name==='noisy-checker'||name==='noisy-tree'){
     const {mask,resolution:n}=observed.prepared;
     let top=0,bottom=0;for(let x=1;x<n;x++){top+=mask[x]!==mask[x-1];bottom+=mask[(n-1)*n+x]!==mask[(n-1)*n+x-1];}
     assert.deepEqual([top,bottom],[5,3],'The uploaded defect must reach the worker unchanged.');
     row.borderRecovery=observed.result.report.solver.topologyInitialization?.borderRecovery;
     if(name==='noisy-tree')assert.equal(row.borderRecovery?.accepted,true,'The real worker must recover the perturbed tree border.');
     assert.deepEqual(observed.result.report.slits,{left:3,right:3});
     assert.equal(observed.result.report.templateChecksPassed,true);
    }
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Open in Draw')||document.querySelector('[role=alert]'),{},{timeout:15000});
    assert.equal(await button('Open in Draw').count(),1,await page.locator('body').innerText());
    const summary=await page.locator('.summary[role=status]').innerText();
    const shown=summary.match(free?/([\d.]+)% different in the motif/:/([\d.]+)% different from the mask/);
    assert.ok(shown,summary);row.displayedError=Number(shown[1])/100;
    row.honouredSymmetry=await symmetry();
    if(chordMode){
     assert.ok(observed.result.report.symmetry.honoured.includes('withinCurve:'+chordMode));
     assert.equal(row.honouredSymmetry.curve,chordMode,'Conversion must preserve the requested chord symmetry.');
    }
    if(name==='top-hat-anti'){
     assert.ok(observed.result.report.symmetry.honoured.includes('antiTranspose'),'The final engine curves must retain anti-transposition.');
     assert.equal(row.honouredSymmetry.lobes,'anti','Conversion must retain the requested between-lobes setting.');
    }
    await page.screenshot({path:path.join(dir,'result.png'),fullPage:true});
    await button('Open in Draw').click();await page.waitForURL('**/en/editor/?from=session');
    await button('Export SVG').waitFor();
    if(name==='top-hat-anti'){
     const radio=page.getByRole('radiogroup',{name:'Between lobes symmetry',exact:true}).getByRole('radio',{name:'Anti',exact:true});
     await radio.click();assert.equal(await radio.getAttribute('aria-checked'),'true');
     await radio.press('Space');assert.equal(await radio.getAttribute('aria-checked'),'true');
     row.symmetryControlChecks.draw=true;
    }
    assert.doesNotMatch(await page.locator('body').innerText(),/curves must not cross/i);
    const pending=page.waitForEvent('download');await button('Export SVG').click();
    const svgFile=path.join(dir,'editable.svg');await(await pending).saveAs(svgFile);
    const design=parseHeartFromSVG(await fs.readFile(svgFile,'utf8'),'editable.svg');assert.ok(design);
    assert.deepEqual([...findFingersWithIssues(design.fingers,intersectionMarginPx(inferOverlapRect(design.fingers,design.gridSize)))],[]);
    // A shared engine span must remain one exact span on both editable sheets.
    // Area-error checks alone can miss the long hairline seams in the hat bug.
    const geometry=JSON.parse(observed.result.files['cut_geometry.json']),overlap=inferOverlapRect(design.fingers,design.gridSize);
    if(chordMode){
     // Measure every downloaded control directly, in the SVG coordinate
     // frame, independently of the engine's projector and symmetry reporter.
     let worst=0;
     for(const finger of design.fingers){
      const cut=finger.segments,first=cut[0].p0,last=cut.at(-1).p3,dx=last.x-first.x,dy=last.y-first.y,mx=(first.x+last.x)/2,my=(first.y+last.y)/2;
      for(let j=0;j<cut.length;j++)for(let k=0;k<4;k++){
       const p=cut[j]['p'+k],q=cut[cut.length-1-j]['p'+(3-k)],along=((q.x-mx)*dx+(q.y-my)*dy)/(dx*dx+dy*dy);
       const x=chordMode==='anti'?2*mx-q.x:q.x-2*along*dx,y=chordMode==='anti'?2*my-q.y:q.y-2*along*dy;
       worst=Math.max(worst,Math.hypot(p.x-x,p.y-y)*100/overlap.width);
      }
     }
     row.exportedChordDeviationMm=worst;assert.ok(worst<1e-6,'Downloaded curves must retain chord symmetry.');
    }
    row.engineSegments=Object.keys(geometry.curves).length;
    row.editableSegments=design.fingers.reduce((sum,f)=>sum+f.segments.length,0);
    row.sharedSimplification=observed.result.report.solver?.finalSharedSimplification;
    const canonical=p=>[p,p.toReversed()].map(c=>c.flat().map(v=>Math.round(v*1e6)).join(',')).sort()[0];
    const shared=new Set(geometry.A_overlap_paths.flatMap(p=>p.map(r=>r.curve)));
    const common=[...new Set(geometry.B_overlap_paths.flatMap(p=>p.map(r=>r.curve)))].filter(id=>shared.has(id));
    const editable=['left','right'].map(lobe=>new Set(design.fingers.filter(f=>f.lobe===lobe).flatMap(f=>f.segments.map(s=>canonical([s.p0,s.p1,s.p2,s.p3].map(p=>[(p.x-overlap.left)*100/overlap.width,(p.y-overlap.top)*100/overlap.height]))))));
    for(const id of common)for(const family of editable)assert.ok(family.has(canonical(geometry.curves[id].control_points)),`Shared span ${id} diverged during conversion/export`);
    row.sharedSpans=common.length;
    if(topHat){
     // Measure geometric length: a clean small hat has four long shared
     // curves, while subdivision gives the larger hat dozens of spans.
     row.sharedLengthMm=common.reduce((sum,id)=>sum+new Cubic(geometry.curves[id].control_points).length(),0);
     const minimumSharedLength=small?80:name==='top-hat-independent'?60:200;
     assert.ok(row.sharedLengthMm>minimumSharedLength,'The hat must retain its long exact shared cuts.');
    }
    const rendered=rasterizeDesign(design,200).data,wanted=resample(Uint8Array.from(observed.prepared.mask),observed.prepared.resolution,200);
    row.wholeOriginalError=maskMismatch(rendered,wanted);
    const regions=free?frameMismatch(rendered,wanted,200,{mode:'free',shape:'diamond',size:frameSize}):null;
    row.editableError=regions?.inside??row.wholeOriginalError;
    if(regions)row.borderChange=regions.outside;
    // Keep the historical 200-cell score, but measure the accuracy gate against
    // the actual solved mask. Nearest-neighbour downsampling moves edge pixels
    // and can turn a 0.3% source error into 0.6% at a different sampling phase.
    const resolution=observed.prepared.resolution,sourceMask=Uint8Array.from(observed.prepared.mask),sourceRendered=rasterizeDesign(design,resolution).data;
    row.sourceResolution=resolution;
    if(hardPhoto||photoMask){
     row.editableFeatures=auditFeatureFidelity({mask:sourceMask,resolution},sourceRendered,observed.result.report.settings);
     row.featureComponents=featureComponentMetrics({mask:sourceMask,resolution},sourceRendered);
     if(['bird-mask','bird-shift-mask','bird-y-shift-mask'].includes(name)&&!stopMode){
      const eye=row.featureComponents.find(f=>f.centerMm[0]<30);
      assert.equal(eye.touchesBorder,false,'The exported eye must remain separate from the background');
      assert.ok(eye.componentIoU>(name==='bird-mask'?.8:.45),'The editable eye must retain its measured shape after simplification');
     }
     if(['hard-flettede-puppy-half','puppy-shift-mask'].includes(name)&&row.templateChecksPassed){
      const opening=row.featureComponents.find(f=>f.sourceAreaMm2<30);
      assert.ok(opening,'The classified smaller photograph must contain the opening');
      assert.equal(opening.touchesBorder,false,'A reported success must preserve a separate opening');
      assert.ok(opening.componentIoU>(name==='puppy-shift-mask'?.6:.5),'Retaining pixels inside an inflated region is insufficient');
     }
     if(row.missingFeatures.length)assert.equal(row.templateChecksPassed,false,'Low mean error cannot certify a pair with lost source regions.');
     assert.equal(row.editableFeatures.passed,!row.missingFeatures.length,'SVG conversion must preserve the observed feature outcome.');
    }
    if(unequalLobes){
     let differing=0;
     for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++)differing+=sourceRendered[y*resolution+x]!==Number((Math.floor(x/resolution*4)+Math.floor(y/resolution*4))%2===0);
     row.originalArtworkError=differing/resolution**2;
     assert.ok(row.originalArtworkError<.05,`Original checker artwork disagreement: ${row.originalArtworkError}`);
    }
    row.sourceEditableError=free?frameMismatch(sourceRendered,sourceMask,resolution,{mode:'free',shape:'diamond',size:frameSize}).inside:maskMismatch(sourceRendered,sourceMask);
    row.physical=auditEditablePaper(design,overlap,observed.result.report.settings,observed.result.report.slits);
    if(observed.result.report.validation.passed)assert.equal(row.physical.geometry.passed,true,'Downloaded SVG must retain the engine geometry constraints');
    if(observed.result.report.templateChecksPassed)assert.equal(row.physical.paper?.status,'pass','Downloaded SVG must retain the verified paper support');
    // Check the actual downloaded result, not just the converter's own success
    // flag. Compare the same honoured symmetry with simplification disabled.
    const raw=convertCutGeometry(geometry,{name:'unsimplified',tolerance:0,enforce:row.honouredSymmetry});
    assert.deepEqual(raw.honoured,row.honouredSymmetry);
    row.conversionFidelity=conversionFidelity(raw.design,{mask:{size:resolution,data:sourceMask},weights:observed.prepared.weights??undefined})(design);
    assert.equal(row.conversionFidelity.passed,true,`Editable SVG lost fitted weave fidelity: ${JSON.stringify(row.conversionFidelity)}`);
    if(hardPhoto||photoMask){
     row.conversionFeatures=auditFeatureFidelityChange({mask:sourceMask,resolution},rasterizeDesign(raw.design,resolution).data,sourceRendered,observed.result.report.settings);
     assert.equal(row.conversionFeatures.passed,true,'Conversion must not erode a source feature, including one that was already imperfect.');
    }
    assert.ok(Math.abs(row.displayedError-row.sourceEditableError)<=.00051,`Displayed mismatch ${row.displayedError} disagrees with exported heart ${row.sourceEditableError}`);
    assert.ok(row.sourceEditableError<=(small ? .005 : topHat ? .01 : free||photograph||photoMask ? .03 : .015),`Editable source mismatch ${row.sourceEditableError}`);
    if(anchorMask&&!engineReference)assert.ok(row.sourceEditableError<.025,'The editable anchor must retain the recovered fit.');
    if(flowerMask&&!engineReference)assert.ok(row.sourceEditableError<.01,'The editable flower must preserve the improved fit.');
    if(name==='star'||photoMask){
     const pendingPDF=page.waitForEvent('download');await button('Download PDF').click();
     const pdfFile=path.join(dir,'template.pdf');await(await pendingPDF).saveAs(pdfFile);
     assert.equal((await fs.readFile(pdfFile)).subarray(0,5).toString(),'%PDF-');
    }
    await page.screenshot({path:path.join(dir,'draw.png'),fullPage:true});
    assert.deepEqual(row.pageErrors,[]);row.passed=true;
   }catch(error){
    row.failure=error.stack;process.exitCode=1;
    if(page){
     await page.evaluate(collectPaintObservation).then(value=>fs.writeFile(path.join(dir,'failure-observation.json'),JSON.stringify(value,null,2))).catch(()=>{});
     await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true}).catch(()=>{});
    }
   }
   finally{await context.close();console.log(JSON.stringify(row));await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));}
  }}finally{await browser.close();}
 }
}finally{await loader.close();dom.window.close();if(referenceServer){referenceServer.closeAllConnections();await new Promise(resolve=>referenceServer.close(resolve));}}
console.log(output);
