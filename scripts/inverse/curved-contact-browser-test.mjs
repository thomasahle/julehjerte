/** Original Art e Sta poster through manual UI selection, mask, solve and SVG export. */
import {benchmarkArtifactEntries} from './benchmark-artifacts.mjs';

import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import {installPaintObservation,collectPaintObservation} from './paint-observer.mjs';
import {auditEditablePaper} from './editable-paper-audit.mjs';
const out=new URL(path.resolve(process.env.INVERSE_TEST_OUTPUT||`tmp/inverse-curved-contact-browser/${new Date().toISOString().replace(/[:.]/g,'-')}`)+'/','file:');await fs.mkdir(out,{recursive:true});
const catalog=JSON.parse(await fs.readFile('scripts/inverse/fixtures/user-photos-2026-10-17/artesta-curved-triangles.json'));
const cases=catalog.cases.map(item=>({...catalog.source,...item})),rows=[];
const browser=await chromium.launch({headless:true});
const loader=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},cacheDir:new URL('vite-cache/',out).pathname,server:{middlewareMode:true,hmr:false,ws:false},resolve:{alias:{$lib:path.resolve('src/lib')}}});
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
try{
 const {parseHeartFromSVG}=await loader.ssrLoadModule('/src/lib/utils/heartDesign.ts');
 const {inferOverlapRect}=await loader.ssrLoadModule('/src/lib/utils/overlapRect.ts');
 const {rasterizeDesign}=await loader.ssrLoadModule('/src/lib/paint/rasterize.ts');
 const {maskMismatch}=await loader.ssrLoadModule('/src/lib/paint/mask.ts');
 const {findFingersWithIssues,intersectionMarginPx}=await loader.ssrLoadModule('/src/lib/editor/curveIssues.ts');
 for(const item of cases){
  const {id}=item,folder=new URL(id+'/',out);await fs.mkdir(folder);
  const record={id,status:'running',errors:[],sourceSha256:item.sha256};rows.push(record);
  assert.equal(createHash('sha256').update(await fs.readFile(item.file)).digest('hex'),item.sha256);
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  try{
   page.on('pageerror',e=>record.errors.push(e.message));await page.addInitScript(installPaintObservation);
   await page.addInitScript(()=>{
    const Native=window.Worker;window.__imports=[];
    window.Worker=class extends Native{
     constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.type==='prepared')window.__imports.push(data.preview);});}
    };
   });
   const button=name=>page.getByRole('button',{name,exact:true}).first();
   await page.goto((process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232')+'/en/editor/paint/');await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--paper-left')!=='');await button('Import picture').click();
   await page.locator('input[type=file]').setInputFiles(item.file);
   await button('Find again').waitFor();await button('Set them myself').click();
   const photo=page.locator('div.photo');const box=await photo.boundingBox();assert.ok(box);
   const quad=item.quad;
   for(const [x,y] of quad)await page.mouse.click(box.x+x/item.width*box.width,box.y+y/item.height*box.height);
   const clicked=await photo.locator('polyline.crop').getAttribute('points');record.clickedQuad=clicked;
   // Click events round display pixels. Dragging uses subpixel PointerEvents,
   // allowing the four pre-recorded source coordinates to be reproduced exactly.
   for(let i=0;i<4;i++){
    const present=(await photo.locator('polyline.crop').getAttribute('points')).split(' ').map(p=>p.split(',').map(Number));
    if(present[i].every((v,k)=>v===quad[i][k]))continue;
    const rect=await photo.boundingBox();const toScreen=([x,y])=>[rect.x+x/item.width*rect.width,rect.y+y/item.height*rect.height];
    await page.mouse.move(...toScreen(present[i]));await page.mouse.down();await page.mouse.move(...toScreen(quad[i]),{steps:3});await page.mouse.up();
   }
   const points=await photo.locator('polyline.crop').getAttribute('points');
   assert.equal(points,[...quad,quad[0]].map(p=>p.join(',')).join(' '));record.selectedQuad=quad;
   await page.waitForFunction(()=>window.__imports.length&&Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Use as mask'&&!b.disabled),{},{timeout:60000});
   const imported=await page.evaluate(()=>{const p=window.__imports.at(-1);return{mask:Array.from(p.mask),resolution:p.resolution,validMask:p.validMask?Array.from(p.validMask):null};});
   await page.screenshot({path:new URL('import.png',folder).pathname,fullPage:true});await button('Use as mask').click();
   await button('Find the cuts').click();await page.waitForFunction(()=>window.__paintQA.error||window.__paintQA.marks?.ready!=null,{},{timeout:240000});
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
   record.preparedMaskSha256=createHash('sha256').update(Uint8Array.from(imported.mask)).digest('hex');
   assert.equal(record.solver.templateChecksPassed,true);assert.ok(record.editableError<.015);
   assert.equal(observed.solveSettings.timeLimit,180,'Exercise unmodified production settings.');
   assert.deepEqual(record.errors,[]);record.status='workflow-passed';console.log(id,record.status,record.editableError);
  }catch(error){record.status='failed';record.failure=error.stack;await page.screenshot({path:new URL('failure.png',folder).pathname,fullPage:true}).catch(()=>{});throw error;}
  finally{await page.close();await fs.writeFile(new URL('results.json',out),JSON.stringify({scope:'Actual original JPEG upload, four manual UI crop clicks recorded before fitting, unmodified production worker settings (180-second maximum) and downloaded editable SVG. The rightmost three columns and top three rows match the screenshot motif. This is an artwork selection, not automatic heart detection. No saved geometry or cut counts enter fitting.',rows},null,2));}
 }
}finally{await loader.close();dom.window.close();await browser.close();}
