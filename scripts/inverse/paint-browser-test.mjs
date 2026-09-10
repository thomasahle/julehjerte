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
import {Cubic} from '../../static/inverse/core/bezier.js';
import {installPaintObservation,collectPaintObservation} from './paint-observer.mjs';
import {stopIntervention,installStopObservation,exerciseStop} from './stop-browser-hooks.mjs';

const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let origin=process.env.INVERSE_TEST_URL||'http://localhost:5200';
const upstreamOrigin=origin;
const disableNumericalKernel=process.env.INVERSE_TEST_DISABLE_NUMERICAL_KERNEL==='1';
const names=(process.env.INVERSE_TEST_BROWSERS||'chromium,firefox,webkit').split(',');
const cases=(process.env.INVERSE_TEST_CASES||'star,hat,house,circle,hunodan,top-hat,top-hat-independent,top-hat-anti').split(',');
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
const loader=await createServer({configFile:false,cacheDir:path.resolve(output,'vite-cache'),server:{middlewareMode:true,hmr:false},resolve:{alias:{$lib:path.resolve('src/lib')}}});
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
for(const file of['scripts/inverse/paint-browser-test.mjs','scripts/inverse/paint-observer.mjs','scripts/inverse/motif-fixture.mjs','scripts/inverse/stop-browser-hooks.mjs'])report.harnessSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
for(const file of['static/inverse/worker.js','static/inverse/worker-bootstrap.js','static/inverse/worker-controller.js','static/inverse/compute-worker.js','static/inverse/core/engine.js','static/inverse/core/stopped.js','static/inverse/core/progress.js'])report.workspaceSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
for(const file of ['static/inverse/core/automatic.js','static/inverse/core/input.js','static/inverse/core/image-reference.js','static/inverse/core/image-features.js','static/inverse/core/direct/image-objective.js','static/inverse/core/direct/prefer-matching.js','static/inverse/core/direct/symmetry.js','src/lib/inverse/engine.ts','static/inverse/core/direct/finalize.js','static/inverse/core/direct/topology.js','static/inverse/core/direct/fit.js','static/inverse/core/direct/share.js','static/inverse/core/direct/initialize.js','static/inverse/core/direct/counts.js','src/lib/inverse/toHeartDesign.ts','src/lib/inverse/simplifyCurves.ts','src/lib/editor/curveIssues.ts','src/lib/components/paint/PaintPage.svelte'])report.workspaceSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
report.workspaceSourceHashes['src/lib/inverse/conversionFidelity.ts']=createHash('sha256').update(await fs.readFile('src/lib/inverse/conversionFidelity.ts')).digest('hex');
for(const file of ['static/inverse/core/direct/refine.js','static/inverse/core/direct/primitive-selection.js','static/inverse/core/direct/shared-simplification.js','static/inverse/core/direct/curves.js','static/inverse/core/direct/curve-topology.js','static/inverse/core/direct/short-returns.js'])report.workspaceSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
for(const file of ['src/lib/components/editor/SymmetryRows.svelte','src/lib/components/ui/toggle-group/toggle-group.svelte','src/lib/components/paint/FramePanel.svelte','src/lib/components/paint/MaskToolPanel.svelte'])report.workspaceSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
try{
 for(const browserName of names){
  const browser=await browsers[browserName].launch({headless:true});
  try{for(let repeat=0;repeat<repeats;repeat++)for(const name of cases){
   interventionArmed=Boolean(intervention);
   const chordMode=name==='chord-frame-sym'?'sym':name==='chord-frame-anti'?'anti':null;
   const photograph=name==='hunodan'||name.startsWith('hunodan-');
   const topHat=['top-hat','top-hat-independent','top-hat-anti','top-hat-free-small'].includes(name),small=name.endsWith('-free-small'),free=topHat||name.endsWith('-free')||small,frameSize=small?.64:.84;
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
    if(name==='star')await button('Try the star').click();
    else{
     const file=path.join(dir,'input.png');
     if(photograph){
      const metadata=JSON.parse(await fs.readFile('scripts/inverse/fixtures/hunodan/speed-crops.json'));
      const e=name==='hunodan'?metadata.cases[0]:metadata.cases.find(e=>e.id===name.slice('hunodan-'.length));assert.ok(e,`Unknown photograph ${name}`);
      const [x,y,x1,y1]=e.photoROI,im=await loadImage(e.source),c=createCanvas(x1-x,y1-y);c.getContext('2d').drawImage(im,-x,-y);await fs.writeFile(file,c.toBuffer('image/png'));
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
      if(name==='top-hat-independent')await page.getByRole('radiogroup',{name:'Between lobes symmetry',exact:true}).getByRole('radio',{name:'Off',exact:true}).click();
      if(name==='top-hat-anti')await page.getByRole('radiogroup',{name:'Between lobes symmetry',exact:true}).getByRole('radio',{name:'Anti',exact:true}).click();
     }
    }
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Find the cuts'&&!b.disabled));
    if(chordMode)await page.getByRole('radiogroup',{name:'Within curve symmetry',exact:true}).getByRole('radio',{name:chordMode==='sym'?'Sym':'Anti',exact:true}).click();
    row.requestedSymmetry=await symmetry();
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
     assert.equal(Boolean(observed.result.report.stoppedEarly),stopMode==='keep');
     if(stopMode==='keep'){
      assert.equal(row.stop.stopId,row.stop.resultId,'Stop must resolve the existing solve request.');
      row.stopToReadySeconds=(row.pageMarks.ready-row.stop.stopSent)/1000;
      assert.ok(row.stopToReadySeconds<10,`Stop waited ${row.stopToReadySeconds} s despite a retained checkpoint.`);
      assert.ok(observed.result.report.alternatives.length>0);
      assert.deepEqual(JSON.parse(observed.result.files['report.json']).alternatives,observed.result.report.alternatives);
      assert.match(await page.locator('.summary[role=status]').innerText(),/Best result from the stopped search/);
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
    row.engineError=observed.result.report.imageError.mismatchFraction;
    row.numericalBackend=observed.result.report.solver.numericalBackend?.backend;
    row.paperKernels=observed.result.report.solver.paperKernels;
    row.boundaryKernels=observed.result.report.solver.boundaryKernels;
    if(disableNumericalKernel){assert.ok(row.blockedKernelRequests>0,'The real worker must attempt the blocked kernel request.');assert.equal(row.numericalBackend,'javascript');}
    assert.equal(Boolean(observed.prepared.weights),free,'Free-border importance weights must reach the real worker.');
    assert.equal(observed.result.report.validation.passed,true);
    assert.equal(observed.result.report.manufacturing.status,'pass');
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
    row.sourceEditableError=free?frameMismatch(sourceRendered,sourceMask,resolution,{mode:'free',shape:'diamond',size:frameSize}).inside:maskMismatch(sourceRendered,sourceMask);
    // Check the actual downloaded result, not just the converter's own success
    // flag. Compare the same honoured symmetry with simplification disabled.
    const raw=convertCutGeometry(geometry,{name:'unsimplified',tolerance:0,enforce:row.honouredSymmetry});
    assert.deepEqual(raw.honoured,row.honouredSymmetry);
    row.conversionFidelity=conversionFidelity(raw.design,{mask:{size:resolution,data:sourceMask},weights:observed.prepared.weights??undefined})(design);
    assert.equal(row.conversionFidelity.passed,true,`Editable SVG lost fitted weave fidelity: ${JSON.stringify(row.conversionFidelity)}`);
    assert.ok(Math.abs(row.displayedError-row.sourceEditableError)<=.00051,`Displayed mismatch ${row.displayedError} disagrees with exported heart ${row.sourceEditableError}`);
    assert.ok(row.sourceEditableError<=(small?.005:topHat?.01:free||photograph?.03:.015),`Editable source mismatch ${row.sourceEditableError}`);
    if(name==='star'){
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
