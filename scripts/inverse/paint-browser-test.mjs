/** Production Mal → image/mask → worker solve → editable SVG/PDF replay. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import {createCanvas,loadImage} from 'canvas';
import {motifFixture,topHatFixture} from './motif-fixture.mjs';
import {installPaintObservation,collectPaintObservation} from './paint-observer.mjs';

const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://localhost:5200';
const disableNumericalKernel=process.env.INVERSE_TEST_DISABLE_NUMERICAL_KERNEL==='1';
const names=(process.env.INVERSE_TEST_BROWSERS||'chromium,firefox,webkit').split(',');
const cases=(process.env.INVERSE_TEST_CASES||'star,hat,house,circle,hunodan,top-hat,top-hat-independent').split(',');
const output=process.env.INVERSE_TEST_OUTPUT||`tmp/paint-browser/${new Date().toISOString().replace(/[:.]/g,'-')}`;
await fs.mkdir(output,{recursive:true});
const loader=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},resolve:{alias:{$lib:path.resolve('src/lib')}}});
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
const {parseHeartFromSVG}=await loader.ssrLoadModule('/src/lib/utils/heartDesign.ts');
const {findFingersWithIssues,intersectionMarginPx}=await loader.ssrLoadModule('/src/lib/editor/curveIssues.ts');
const {inferOverlapRect}=await loader.ssrLoadModule('/src/lib/utils/overlapRect.ts');
const {rasterizeDesign}=await loader.ssrLoadModule('/src/lib/paint/rasterize.ts');
const {frameMismatch}=await loader.ssrLoadModule('/src/lib/paint/frame.ts');
const {resample,maskMismatch}=await loader.ssrLoadModule('/src/lib/paint/mask.ts');
const results=[];
const report={origin,gitCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runtime:process.version,disableNumericalKernel,
 timingVersion:2,timingMethod:'Page-clock timestamps from the Find click, worker requests/replies and the first visible, enabled Open in Draw button. DOM readiness is not a paint timestamp. Result capture and artifact writes happen afterward and have separate Node-clock durations. Version 1 solveAndConversionSeconds included harness capture and artifact writes and is not directly comparable.',
 harnessSourceHashes:{},workspaceSourceHashes:{},results};
for(const file of['scripts/inverse/paint-browser-test.mjs','scripts/inverse/paint-observer.mjs'])report.harnessSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
for(const file of ['static/inverse/core/automatic.js','static/inverse/core/input.js','static/inverse/core/image-reference.js','static/inverse/core/image-features.js','static/inverse/core/direct/image-objective.js','static/inverse/core/direct/prefer-matching.js','static/inverse/core/direct/symmetry.js','src/lib/inverse/engine.ts','static/inverse/core/direct/finalize.js','static/inverse/core/direct/topology.js','static/inverse/core/direct/fit.js','static/inverse/core/direct/share.js','static/inverse/core/direct/initialize.js','static/inverse/core/direct/counts.js','src/lib/inverse/toHeartDesign.ts','src/lib/inverse/simplifyCurves.ts','src/lib/editor/curveIssues.ts','src/lib/components/paint/PaintPage.svelte'])report.workspaceSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
try{
 for(const browserName of names){
  const browser=await browsers[browserName].launch({headless:true});
  try{for(const name of cases){
   const topHat=name==='top-hat'||name==='top-hat-independent',small=name.endsWith('-free-small'),free=topHat||name.endsWith('-free')||small,frameSize=small?.64:.84;
   const dir=path.join(output,`${browserName}-${name}`);await fs.mkdir(dir,{recursive:true});
   const row={browser:browserName,browserVersion:browser.version(),name,pageErrors:[]};results.push(row);
   const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
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
    await page.goto(`${origin}/en/editor/paint/`);
    // The root layout sets the inline paper colours in onMount. Production
    // can finish loading its HTML before dynamic imports attach the handlers.
    await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--paper-left')!=='');
    const button=label=>page.getByRole('button',{name:label,exact:true}).first();
    if(name==='star')await button('Try the star').click();
    else{
     const file=path.join(dir,'input.png');
     if(name==='hunodan'){
      const metadata=JSON.parse(await fs.readFile('scripts/inverse/fixtures/hunodan/speed-crops.json'));
      const e=metadata.cases[0],[x,y,x1,y1]=e.photoROI,im=await loadImage(e.source),c=createCanvas(x1-x,y1-y);c.getContext('2d').drawImage(im,-x,-y);await fs.writeFile(file,c.toBuffer('image/png'));
     }else await fs.writeFile(file,topHat?topHatFixture():free?motifFixture(name.replace(/-free(?:-small)?$/,'')).original:motifFixture(name).png);
     await button('Import picture').click();await page.locator('input[type=file]').setInputFiles(file);
     if(name!=='hunodan')await button('The whole picture').click();
     else await page.locator('button.corner').nth(3).waitFor();
     await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Use as mask'&&!b.disabled));
     await page.screenshot({path:path.join(dir,'import.png'),fullPage:true});
     await button('Use as mask').click();
     if(free){
      await page.getByRole('radio',{name:'Free',exact:true}).click();
      if(!small){await page.locator('#paint-frame-size').focus();await page.locator('#paint-frame-size').press('End');}
      assert.equal(await page.locator('#paint-frame-size').inputValue(),String(frameSize*100));
      if(name==='top-hat-independent')await page.getByRole('radiogroup',{name:'Between lobes symmetry',exact:true}).getByRole('radio',{name:'Off',exact:true}).click();
     }
    }
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Find the cuts'&&!b.disabled));
    await button('Find the cuts').click();
    await page.waitForFunction(()=>{const qa=window.__paintQA;return qa.error||qa.marks&&qa.marks.ready!==null||qa.result&&document.querySelector('[role=alert]');},{},{timeout:190000});
    const captureStart=performance.now(),observed=await page.evaluate(collectPaintObservation);
    row.captureSeconds=(performance.now()-captureStart)/1000;
    assert.equal(observed.error,null,JSON.stringify(observed.error));
    assert.ok(observed.marks&&observed.marks.ready!==null,'A successful solve must make Open in Draw ready.');
    row.timings=observed.timings;row.pageMarks=observed.marks;
    for(const [key,value]of Object.entries(row.timings))assert.ok(Number.isFinite(value)&&value>=0,`${key}: ${value}`);
    const phases=Object.entries(row.timings).filter(([key])=>key!=='clickToReadySeconds').reduce((sum,[,value])=>sum+value,0);
    assert.ok(Math.abs(phases-row.timings.clickToReadySeconds)<1e-7,'Page-clock phases must sum to DOM readiness.');
    const writeStart=performance.now();
    await fs.writeFile(path.join(dir,'prepared.json'),JSON.stringify(observed.prepared));
    await fs.writeFile(path.join(dir,'engine-report.json'),JSON.stringify(observed.result.report,null,2));
    await fs.writeFile(path.join(dir,'cut_geometry.json'),observed.result.files['cut_geometry.json']);
    row.artifactWriteSeconds=(performance.now()-writeStart)/1000;
    row.reportedFitSeconds=observed.result.report.solver.seconds;
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
    await page.screenshot({path:path.join(dir,'result.png'),fullPage:true});
    await button('Open in Draw').click();await page.waitForURL('**/en/editor/?from=session');
    await button('Export SVG').waitFor();
    assert.doesNotMatch(await page.locator('body').innerText(),/curves must not cross/i);
    const pending=page.waitForEvent('download');await button('Export SVG').click();
    const svgFile=path.join(dir,'editable.svg');await(await pending).saveAs(svgFile);
    const design=parseHeartFromSVG(await fs.readFile(svgFile,'utf8'),'editable.svg');assert.ok(design);
    assert.deepEqual([...findFingersWithIssues(design.fingers,intersectionMarginPx(inferOverlapRect(design.fingers,design.gridSize)))],[]);
    // A shared engine span must remain one exact span on both editable sheets.
    // Area-error checks alone can miss the long hairline seams in the hat bug.
    const geometry=JSON.parse(observed.result.files['cut_geometry.json']),overlap=inferOverlapRect(design.fingers,design.gridSize);
    const canonical=p=>[p,p.toReversed()].map(c=>c.flat().map(v=>Math.round(v*1e6)).join(',')).sort()[0];
    const shared=new Set(geometry.A_overlap_paths.flatMap(p=>p.map(r=>r.curve)));
    const common=[...new Set(geometry.B_overlap_paths.flatMap(p=>p.map(r=>r.curve)))].filter(id=>shared.has(id));
    const editable=['left','right'].map(lobe=>new Set(design.fingers.filter(f=>f.lobe===lobe).flatMap(f=>f.segments.map(s=>canonical([s.p0,s.p1,s.p2,s.p3].map(p=>[(p.x-overlap.left)*100/overlap.width,(p.y-overlap.top)*100/overlap.height]))))));
    for(const id of common)for(const family of editable)assert.ok(family.has(canonical(geometry.curves[id].control_points)),`Shared span ${id} diverged during conversion/export`);
    row.sharedSpans=common.length;
    if(topHat){
     assert.ok(common.length>10,'The hat needs exact shared cuts, not independent near matches.');
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
    assert.ok(Math.abs(row.displayedError-row.sourceEditableError)<=.00051,`Displayed mismatch ${row.displayedError} disagrees with exported heart ${row.sourceEditableError}`);
    assert.ok(row.sourceEditableError<=(small?.005:topHat?.01:free||name==='hunodan'?.03:.015),`Editable source mismatch ${row.sourceEditableError}`);
    if(name==='star'){
     const pendingPDF=page.waitForEvent('download');await button('Download PDF').click();
     const pdfFile=path.join(dir,'template.pdf');await(await pendingPDF).saveAs(pdfFile);
     assert.equal((await fs.readFile(pdfFile)).subarray(0,5).toString(),'%PDF-');
    }
    await page.screenshot({path:path.join(dir,'draw.png'),fullPage:true});
    assert.deepEqual(row.pageErrors,[]);row.passed=true;
   }catch(error){row.failure=error.stack;process.exitCode=1;if(page)await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true}).catch(()=>{});}
   finally{await context.close();console.log(JSON.stringify(row));await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));}
  }}finally{await browser.close();}
 }
}finally{await loader.close();dom.window.close();}
console.log(output);
