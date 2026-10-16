/** Real clipped photo through crop, edit/undo, worker, and downloaded SVG. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import {auditEditablePaper} from './editable-paper-audit.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import {installPaintObservation,collectPaintObservation} from './paint-observer.mjs';
import {fitHeart,toScreen} from '../../src/lib/paint/heartLayout.ts';
const root=process.env.INVERSE_TEST_OUTPUT||`tmp/inverse-photo-coverage-browser/${new Date().toISOString().replace(/[:.]/g,'-')}`;await fs.mkdir(root,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
let loader;
const record={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHashes:{},case:'crossed-ribbons',scope:'Real collage upload, rough ROI through UI, production detector and worker. Only solve time budget set to ten seconds.',errors:[]};
for(const file of ['scripts/inverse/photo-coverage-browser-test.mjs','scripts/inverse/paint-observer.mjs','static/inverse/core/input.js','static/inverse/core/mask-preview.js','src/lib/paint/mask.ts','src/lib/paint/tools.ts','src/lib/components/paint/ImportImageDialog.svelte','src/lib/components/paint/MaskCanvas.svelte','src/lib/components/paint/PaintPage.svelte'])record.sourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
try{
 page.on('pageerror',e=>record.errors.push(e.message));await page.addInitScript(installPaintObservation);
 await page.addInitScript(()=>{
  const Native=window.Worker;window.__imports=[];
  window.Worker=class extends Native{
   constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.type==='prepared')window.__imports.push(data.preview);});}
   postMessage(data,...rest){if(data.action==='solve')data={...data,settings:{...data.settings,timeLimit:10}};return super.postMessage(data,...rest);}
  };
 });
 await page.goto(`${process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232'}/en/editor/paint/`);await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--paper-left')!=='');
 const button=name=>page.getByRole('button',{name,exact:true}).first();
 await button('Import picture').click();await page.locator('input[type=file]').setInputFiles('scripts/inverse/fixtures/hard-photos/collage.png');
 await button('Pick an area').waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Find again')?.disabled);
 await button('Pick an area').click();const rect=await page.locator('.photo').boundingBox();assert.ok(rect);
 const point=(x,y)=>[rect.x+x/1482*rect.width,rect.y+y/1112*rect.height];
 await page.mouse.move(...point(261,856));await page.mouse.down();await page.mouse.move(...point(524,1112),{steps:10});await page.mouse.up();
 await page.waitForFunction(()=>window.__imports.at(-1)?.validMask?.some(v=>!v)&&Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Use as mask'&&!b.disabled),{},{timeout:60000});
 await page.screenshot({path:root+'/import.png',fullPage:true});
 const imported=await page.evaluate(()=>{const p=window.__imports.at(-1);return{validMask:Array.from(p.validMask),mask:Array.from(p.mask),resolution:p.resolution};});
 record.importedObserved=imported.validMask.reduce((s,v)=>s+v,0);record.crop=await page.evaluate(()=>window.__paintQA.crop);
 await button('Use as mask').click();await page.getByText('Shaded areas are outside the photo. Paint them to choose a colour.',{exact:true}).waitFor();
 const canvas=page.locator('.mask-canvas canvas');await canvas.waitFor();await canvas.screenshot({path:root+'/mask.png'});
 const n=imported.resolution,d=new Int32Array(n*n);for(let y=0;y<n;y++)for(let x=0;x<n;x++)d[y*n+x]=imported.validMask[y*n+x]?0:Math.min(x+1,y+1,n-x,n-y);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x;if(x)d[i]=Math.min(d[i],d[i-1]+1);if(y)d[i]=Math.min(d[i],d[i-n]+1);}
 for(let y=n-1;y>=0;y--)for(let x=n-1;x>=0;x--){const i=y*n+x;if(x<n-1)d[i]=Math.min(d[i],d[i+1]+1);if(y<n-1)d[i]=Math.min(d[i],d[i+n]+1);}
 let index=0;for(let i=1;i<d.length;i++)if(d[i]>d[index])index=i;
 assert.ok(d[index]>3);record.editedCell={x:index%n,y:Math.floor(index/n),distance:d[index]};
 const box=await canvas.boundingBox(),p=toScreen(fitHeart(box.width,box.height,24),(index%n+.5)/n,(Math.floor(index/n)+.5)/n);
 const pixel=()=>canvas.evaluate((c,p)=>Array.from(c.getContext('2d').getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data),p);
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 record.before=await pixel();await button('Eraser').click();await page.mouse.click(box.x+p.x,box.y+p.y);await page.mouse.move(0,0);await settle();record.painted=await pixel();
 assert.notDeepEqual(record.painted,record.before);await button('Undo').click();await settle();record.undo=await pixel();assert.deepEqual(record.undo,record.before);
 await button('Redo').click();await settle();record.redo=await pixel();assert.deepEqual(record.redo,record.painted);await button('Undo').click();await settle();
 await button('Find the cuts').click();await page.waitForFunction(()=>window.__paintQA.error||window.__paintQA.marks?.ready!=null,{},{timeout:180000});
 const observed=await page.evaluate(collectPaintObservation);await fs.writeFile(root+'/observation.json',JSON.stringify(observed));
 assert.equal(observed.error,null);assert.deepEqual(observed.prepared.validMask,imported.validMask);assert.deepEqual(observed.prepared.weights,imported.validMask);assert.deepEqual(observed.prepared.mask,imported.mask);
 record.result={templateChecksPassed:observed.result.report.templateChecksPassed,imageError:observed.result.report.imageError,timings:observed.timings};
 await page.screenshot({path:root+'/result.png',fullPage:true});
 await button('Open in Draw').click();await page.waitForURL('**/en/editor/?from=session');await button('Export SVG').waitFor();
 const download=page.waitForEvent('download');await button('Export SVG').click();await(await download).saveAs(root+'/editable.svg');
 loader=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},cacheDir:path.resolve(root,'vite-cache'),server:{middlewareMode:true,hmr:false,ws:false},resolve:{alias:{$lib:path.resolve('src/lib')}}});
 const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
 try{
  const {parseHeartFromSVG}=await loader.ssrLoadModule('/src/lib/utils/heartDesign.ts');
  const {rasterizeDesign}=await loader.ssrLoadModule('/src/lib/paint/rasterize.ts');
  const {maskMismatch}=await loader.ssrLoadModule('/src/lib/paint/mask.ts');
  const {inferOverlapRect}=await loader.ssrLoadModule('/src/lib/utils/overlapRect.ts');
  const {findFingersWithIssues,intersectionMarginPx}=await loader.ssrLoadModule('/src/lib/editor/curveIssues.ts');
  const design=parseHeartFromSVG(await fs.readFile(root+'/editable.svg','utf8'),'coverage.svg');assert.ok(design);
  const overlap=inferOverlapRect(design.fingers,design.gridSize);
  assert.deepEqual([...findFingersWithIssues(design.fingers,intersectionMarginPx(overlap))],[]);
  record.exportedError=maskMismatch(rasterizeDesign(design,n).data,Uint8Array.from(imported.mask),Uint8Array.from(imported.validMask));
  assert.ok(record.exportedError<.015,'Downloaded SVG must retain the observed ribbons.');
  record.physical=auditEditablePaper(design,overlap,observed.result.report.settings,observed.result.report.slits);
  assert.equal(record.physical.geometry.passed,true);assert.equal(record.physical.paper.status,'pass');
 }finally{dom.window.close();}
 await page.screenshot({path:root+'/draw.png',fullPage:true});
 assert.deepEqual(record.errors,[]);record.status='passed';
}catch(e){record.status='failed';record.failure=e.stack;await page.screenshot({path:root+'/failure.png',fullPage:true}).catch(()=>{});throw e;}
finally{await fs.writeFile(root+'/results.json',JSON.stringify(record,null,2)+'\n');await loader?.close();await browser.close();}
