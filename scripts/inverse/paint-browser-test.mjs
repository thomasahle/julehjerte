/** Production Mal → image/mask → worker solve → editable SVG/PDF replay. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import {createCanvas,loadImage} from 'canvas';
import {motifFixture} from './motif-fixture.mjs';

const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://localhost:5200';
const names=(process.env.INVERSE_TEST_BROWSERS||'chromium,firefox,webkit').split(',');
const cases=(process.env.INVERSE_TEST_CASES||'star,hat,house,circle,hunodan').split(',');
const output=process.env.INVERSE_TEST_OUTPUT||`tmp/paint-browser/${new Date().toISOString().replace(/[:.]/g,'-')}`;
await fs.mkdir(output,{recursive:true});
const loader=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},resolve:{alias:{$lib:path.resolve('src/lib')}}});
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
const {parseHeartFromSVG}=await loader.ssrLoadModule('/src/lib/utils/heartDesign.ts');
const {findFingersWithIssues,intersectionMarginPx}=await loader.ssrLoadModule('/src/lib/editor/curveIssues.ts');
const {inferOverlapRect}=await loader.ssrLoadModule('/src/lib/utils/overlapRect.ts');
const {rasterizeDesign}=await loader.ssrLoadModule('/src/lib/paint/rasterize.ts');
const {resample,maskMismatch}=await loader.ssrLoadModule('/src/lib/paint/mask.ts');
const results=[];
const report={origin,gitCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runtime:process.version,workspaceSourceHashes:{},results};
for(const file of ['static/inverse/core/direct/topology.js','src/lib/inverse/toHeartDesign.ts','src/lib/inverse/simplifyCurves.ts','src/lib/editor/curveIssues.ts','src/lib/components/paint/PaintPage.svelte'])report.workspaceSourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
try{
 for(const browserName of names){
  const browser=await browsers[browserName].launch({headless:true});
  try{for(const name of cases){
   const dir=path.join(output,`${browserName}-${name}`);await fs.mkdir(dir,{recursive:true});
   const row={browser:browserName,browserVersion:browser.version(),name,pageErrors:[]};results.push(row);
   const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
   let page;
   try{
    await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(origin).origin?route.continue():route.abort());
    page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
    // Observe the real worker; no target, seed, count or fitted geometry is
    // supplied to it by this test. Capture what the visitor actually solved.
    await page.addInitScript(()=>{
     const NativeWorker=window.Worker;window.__paintQA={result:null,error:null,prepared:null};
     window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',({data})=>{
      if(data.type==='result')window.__paintQA.result=data.result;
      if(data.type==='error')window.__paintQA.error=data;
      if(data.type==='prepared')window.__paintQA.prepared={mask:Array.from(data.preview.mask),resolution:data.preview.resolution};
     });}};
    });
    await page.goto(`${origin}/en/editor/paint/`);
    const button=label=>page.getByRole('button',{name:label,exact:true}).first();
    if(name==='star')await button('Try the star').click();
    else{
     const file=path.join(dir,'input.png');
     if(name==='hunodan'){
      const metadata=JSON.parse(await fs.readFile('scripts/inverse/fixtures/hunodan/speed-crops.json'));
      const e=metadata.cases[0],[x,y,x1,y1]=e.photoROI,im=await loadImage(e.source),c=createCanvas(x1-x,y1-y);c.getContext('2d').drawImage(im,-x,-y);await fs.writeFile(file,c.toBuffer('image/png'));
     }else await fs.writeFile(file,motifFixture(name).png);
     await button('Import picture').click();await page.locator('input[type=file]').setInputFiles(file);
     if(name!=='hunodan')await button('The whole picture').click();
     else await page.locator('button.corner').nth(3).waitFor();
     await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Use as mask'&&!b.disabled));
     await page.screenshot({path:path.join(dir,'import.png'),fullPage:true});
     await button('Use as mask').click();
    }
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Find the cuts'&&!b.disabled));
    const start=performance.now();await button('Find the cuts').click();
    await page.waitForFunction(()=>window.__paintQA.result||window.__paintQA.error,{},{timeout:190000});
    const observed=await page.evaluate(()=>window.__paintQA);assert.equal(observed.error,null,JSON.stringify(observed.error));
    await fs.writeFile(path.join(dir,'engine-report.json'),JSON.stringify(observed.result.report,null,2));
    await fs.writeFile(path.join(dir,'cut_geometry.json'),observed.result.files['cut_geometry.json']);
    row.engineError=observed.result.report.imageError.mismatchFraction;
    assert.equal(observed.result.report.validation.passed,true);
    assert.equal(observed.result.report.manufacturing.status,'pass');
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Open in Draw')||document.querySelector('[role=alert]'),{},{timeout:15000});
    assert.equal(await button('Open in Draw').count(),1,await page.locator('body').innerText());
    row.solveAndConversionSeconds=(performance.now()-start)/1000;
    await page.screenshot({path:path.join(dir,'result.png'),fullPage:true});
    await button('Open in Draw').click();await page.waitForURL('**/en/editor/?from=session');
    await button('Export SVG').waitFor();
    assert.doesNotMatch(await page.locator('body').innerText(),/curves must not cross/i);
    const pending=page.waitForEvent('download');await button('Export SVG').click();
    const svgFile=path.join(dir,'editable.svg');await(await pending).saveAs(svgFile);
    const design=parseHeartFromSVG(await fs.readFile(svgFile,'utf8'),'editable.svg');assert.ok(design);
    assert.deepEqual([...findFingersWithIssues(design.fingers,intersectionMarginPx(inferOverlapRect(design.fingers,design.gridSize)))],[]);
    row.editableError=maskMismatch(rasterizeDesign(design,200).data,resample(Uint8Array.from(observed.prepared.mask),observed.prepared.resolution,200));
    assert.ok(row.editableError<=(name==='hunodan'?.03:.015),`Editable mismatch ${row.editableError}`);
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
