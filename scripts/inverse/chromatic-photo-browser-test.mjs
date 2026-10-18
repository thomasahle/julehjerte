/** Reflective two-colour upload through actual selection, mask, solve and SVG export. */
import {benchmarkArtifactEntries} from './benchmark-artifacts.mjs';
import {hardPhotoCatalogCases} from './hard-photo-data.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import {installPaintObservation,collectPaintObservation} from './paint-observer.mjs';
import {auditEditablePaper} from './editable-paper-audit.mjs';
const out=new URL(path.resolve(process.env.INVERSE_TEST_OUTPUT||`tmp/inverse-chromatic-browser/${new Date().toISOString().replace(/[:.]/g,'-')}`)+'/','file:');await fs.mkdir(out,{recursive:true});
const cases=hardPhotoCatalogCases(JSON.parse(await fs.readFile('scripts/inverse/fixtures/user-photos-2026-10-17/window.json'))),rows=[];
const browser=await chromium.launch({headless:true});
const loader=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},cacheDir:new URL('vite-cache/',out).pathname,server:{middlewareMode:true,hmr:false,ws:false},resolve:{alias:{$lib:path.resolve('src/lib')}}});
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
try{
 const {parseHeartFromSVG}=await loader.ssrLoadModule('/src/lib/utils/heartDesign.ts');
 const {inferOverlapRect}=await loader.ssrLoadModule('/src/lib/utils/overlapRect.ts');
 const {rasterizeDesign}=await loader.ssrLoadModule('/src/lib/paint/rasterize.ts');
 const {maskMismatch}=await loader.ssrLoadModule('/src/lib/paint/mask.ts');
 const {findFingersWithIssues,intersectionMarginPx}=await loader.ssrLoadModule('/src/lib/editor/curveIssues.ts');
 for(const id of ['window-blue-orange']){
  const spec=cases.find(r=>r.id===id),item={...spec,dimensions:[spec.width,spec.height]},folder=new URL(id+'/',out);await fs.mkdir(folder);
  const record={id,status:'running',errors:[],sourceSha256:item.sha256};rows.push(record);
  assert.equal(createHash('sha256').update(await fs.readFile(item.file)).digest('hex'),item.sha256);
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  try{
   page.on('pageerror',e=>record.errors.push(e.message));await page.addInitScript(installPaintObservation);
   await page.addInitScript(()=>{
    const Native=window.Worker;window.__imports=[];window.__roi=null;
    window.Worker=class extends Native{
     constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.type==='prepared')window.__imports.push(data.preview);});}
     postMessage(data,...rest){if(data.action==='detect-crops')window.__roi=data.input?.roi;if(data.action==='solve')data={...data,settings:{...data.settings,timeLimit:10}};return super.postMessage(data,...rest);}
    };
   });
   const button=name=>page.getByRole('button',{name,exact:true}).first();
   await page.goto((process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232')+'/en/editor/paint/');await button('Import picture').click();
   await page.locator('input[type=file]').setInputFiles(item.file);await button('Pick an area').waitFor();
   await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Find again')?.disabled);
   await page.evaluate(()=>{window.__imports=[];window.__paintQA.crop=null;});
   await button('Pick an area').click();const box=await page.locator('.photo').boundingBox();assert.ok(box);
   const point=(x,y)=>[box.x+x/item.dimensions[0]*box.width,box.y+y/item.dimensions[1]*box.height];
   await page.mouse.move(...point(...item.roi.slice(0,2)));await page.mouse.down();await page.mouse.move(...point(...item.roi.slice(2)),{steps:10});await page.mouse.up();
   await page.waitForFunction(()=>window.__paintQA.crop?.candidates?.length&&window.__imports.length&&Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Use as mask'&&!b.disabled),{},{timeout:60000});
   record.roi=await page.evaluate(()=>window.__roi);record.crop=await page.evaluate(()=>window.__paintQA.crop);
   const e=record.crop.candidates[0].locator.evidence;assert.ok([...e.lowerEdgeSupport,...e.lobeOutlineSupport].every(v=>v>=.65)&&e.capColourLoss.every(v=>v<=.30));
   assert.equal(e.palette.method,'two-chromatic-paper-colours');
   assert.equal(e.lowerEdgeSupportMethod,'photograph-contrast-along-fitted-outer-edges');
   const imported=await page.evaluate(()=>{const p=window.__imports.at(-1);return{mask:Array.from(p.mask),resolution:p.resolution,validMask:p.validMask?Array.from(p.validMask):null};});
   await page.screenshot({path:new URL('import.png',folder).pathname,fullPage:true});await button('Use as mask').click();
   await button('Find the cuts').click();await page.waitForFunction(()=>window.__paintQA.error||window.__paintQA.marks?.ready!=null,{},{timeout:180000});
   const observed=await page.evaluate(collectPaintObservation);await fs.writeFile(new URL('observation.json',folder),JSON.stringify(observed,(key,value)=>key==='files'?Object.fromEntries(benchmarkArtifactEntries(value)):value));assert.equal(observed.error,null);
   assert.deepEqual(observed.prepared.mask,imported.mask);
   record.solver={templateChecksPassed:observed.result.report.templateChecksPassed,error:observed.result.report.imageError,timings:observed.timings,slits:observed.result.report.slits};
   await page.screenshot({path:new URL('result.png',folder).pathname,fullPage:true});await button('Open in Draw').click();await page.waitForURL('**/en/editor/?from=session');await button('Export SVG').waitFor();
   const download=page.waitForEvent('download');await button('Export SVG').click();await(await download).saveAs(new URL('editable.svg',folder).pathname);
   const design=parseHeartFromSVG(await fs.readFile(new URL('editable.svg',folder),'utf8'),'selected.svg');assert.ok(design);
   const overlap=inferOverlapRect(design.fingers,design.gridSize);
   assert.deepEqual([...findFingersWithIssues(design.fingers,intersectionMarginPx(overlap))],[]);
   record.physical=auditEditablePaper(design,overlap,observed.result.report.settings,observed.result.report.slits);
   record.editableError=maskMismatch(rasterizeDesign(design,imported.resolution).data,Uint8Array.from(imported.mask),imported.validMask?Uint8Array.from(imported.validMask):undefined);
   assert.equal(record.physical.geometry.passed,true);assert.equal(record.physical.paper.status,'pass');
   assert.equal(record.solver.templateChecksPassed,true);assert.ok(record.editableError<.015);
   assert.deepEqual(record.errors,[]);record.status='workflow-passed';console.log(id,record.status,record.editableError);
  }catch(error){record.status='failed';record.failure=error.stack;await page.screenshot({path:new URL('failure.png',folder).pathname,fullPage:true}).catch(()=>{});throw error;}
  finally{await page.close();await fs.writeFile(new URL('results.json',out),JSON.stringify({scope:'Real uploads with pointer-selected rough rectangles, ten-second solve budget, and downloaded editable SVGs. No known ground-truth cutting paths; reported error is against the classified photo.',rows},null,2));}
 }
}finally{await loader.close();dom.window.close();await browser.close();}
