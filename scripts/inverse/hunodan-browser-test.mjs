/** Real upload, automatic crop, fresh direct fit and independently checked ZIP. */
import {auditImageFeatures} from '../../static/inverse/core/image-features.js';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {renderExportedWeave} from './export-renderer.mjs';
const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:4173';
const source=process.env.INVERSE_HUNODAN_CASES;if(!source)throw new Error('Set INVERSE_HUNODAN_CASES to the photograph corpus cases.json');
const catalog=JSON.parse(await fs.readFile(source)),scope=JSON.parse(await fs.readFile('scripts/inverse/fixtures/hunodan/scope.json'));
const speed=process.env.INVERSE_HUNODAN_SPEED==='1',baseline=speed?JSON.parse(await fs.readFile('docs/inverse/HUNODAN-VALIDATION.json')):null;
const ids=(process.env.INVERSE_HUNODAN_IDS||'hjcur-02,hjcur-04,hjfla-01').split(','),output=`tmp/inverse-browser/${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}-hunodan`,results=[];
await fs.mkdir(output,{recursive:true});
for(const name of(process.env.INVERSE_TEST_BROWSERS||'chromium,firefox,webkit').split(',')){
 const browser=await engines[name].launch({headless:true});
 try{for(const id of ids){
  assert.ok(!scope.excluded[id]);const entry=catalog.cases.find(c=>c.id===id);assert.ok(entry);
  const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true}),row={browser:name,id,checks:[],pageErrors:[]};results.push(row);let page;
  const check=s=>{row.checks.push(s);console.log(name,id,s);};
  try{
   await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(origin).origin?r.continue():r.abort());
   await context.addInitScript(()=>{const Base=window.Worker;window.hunodanTimes={};window.Worker=class extends Base{
     postMessage(message,...args){if(message.action==='prepare'||message.action==='solve')window.hunodanTimes[message.action]=performance.now();super.postMessage(message,...args);}
     constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data.type==='progress'&&e.data.event.stage==='preprocessing')window.hunodanTimes.preprocessing=performance.now();if(e.data.type==='prepared'){window.hunodanPrepared=e.data.preview;window.hunodanTimes.prepared=performance.now();}if(e.data.type==='result'){window.hunodanResult=e.data.result;window.hunodanTimes.result=performance.now();}});}
   };});
   page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
   await page.goto(`${origin}/en/generate/`);const idle=()=>page.waitForFunction(()=>document.querySelector('fieldset')?.disabled===false),button=t=>page.getByRole('button',{name:t,exact:true}).first();await idle();
   assert.equal(await page.getByLabel(/^Pattern style/).count(),0);
   await page.locator('input[type=file]').setInputFiles(entry.photoFile);
   await page.waitForFunction(()=>document.querySelectorAll('.corner').length===4&&!document.querySelector('fieldset').disabled);
   row.quad=await page.locator('.coordinates input').evaluateAll(es=>[0,2,4,6].map(i=>[+es[i].value,+es[i+1].value]));
   if(speed)assert.ok(row.quad.every((p,i)=>p.every((v,j)=>Math.abs(v-entry.crop.candidates[0].quad[i][j])<1e-6)),'Automatic browser crop must match the frozen benchmark crop');
   await page.locator('.crop-image').screenshot({path:`${output}/${name}-${id}-crop.png`});check('Uploaded photograph finds four automatic corners without manual coordinates');
   await page.getByLabel('Search budget (seconds)',{exact:true}).fill(process.env.INVERSE_HUNODAN_SECONDS||'30');
   if(speed){await page.getByText('Cutting and search settings',{exact:true}).click();await page.getByLabel('Simulated cutting-error trials',{exact:true}).fill('0');}
   await button('Prepare artwork').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();
   const prepared=await page.evaluate(()=>({mask:Array.from(window.hunodanPrepared.mask),resolution:window.hunodanPrepared.resolution}));
   await button('Find cutting templates').click();
   await page.waitForFunction(()=>!!window.hunodanResult||!!document.querySelector('[role=alert]'),{},{timeout:180000});
   row.report=await page.evaluate(()=>window.hunodanResult?.report);
   if(row.report)await fs.writeFile(`${output}/${name}-${id}-report.json`,JSON.stringify(row.report,null,2));
   assert.equal(await page.getByRole('heading',{name:'Template pair checked',exact:true}).count(),1,await page.locator('.preview-panel').innerText());
   const pending=page.waitForEvent('download');await button('Download everything (.zip)').click();const zip=`${output}/${name}-${id}.zip`;await(await pending).saveAs(zip);
   const report=JSON.parse(execFileSync('unzip',['-p',zip,'report.json'],{encoding:'utf8'})),cuts=JSON.parse(execFileSync('unzip',['-p',zip,'cut_geometry.json'],{encoding:'utf8'}));row.report=report;
   assert.equal(report.templateChecksPassed,true);assert.equal(report.validation.passed,true);assert.equal(report.manufacturing.status,'pass');assert.ok(['direct-bezier','hybrid-bezier-trace'].includes(report.solver.algorithm));assert.equal(report.input.sourceImage.cropProvenance.manuallyEdited,false);
   assert.deepEqual(report.input.sourceImage.cropCorners,row.quad);check('Fresh direct fit exports a validated pair from the unchanged automatic crop');
   const rendered=await renderExportedWeave(cuts,prepared.resolution);row.independentImageError=rendered.mask.reduce((s,v,i)=>s+Number(v!==prepared.mask[i]),0)/prepared.mask.length;assert.ok(row.independentImageError<=.03,`${100*row.independentImageError}% independent difference`);
   row.independentFeatures=auditImageFeatures(prepared,rendered.mask);assert.equal(row.independentFeatures.passed,true);
   if(speed){
     row.workerTimes=await page.evaluate(()=>window.hunodanTimes);const t=row.workerTimes;row.prepareSeconds=(t.prepared-t.prepare)/1000;row.solveSeconds=(t.result-t.solve)/1000;row.seconds=row.prepareSeconds+row.solveSeconds;
     row.baselineError=baseline.results.find(r=>r.id===id).independentImageError;
     row.qualityPassed=row.independentImageError<=row.baselineError+1e-12;row.speedPassed=row.seconds<=10;
     assert.ok(row.qualityPassed,`${100*row.independentImageError}% exceeds release error ${100*row.baselineError}%`);
     assert.ok(row.speedPassed,`${row.seconds.toFixed(3)} seconds exceeds 10 seconds`);
     check(`Prepare, solve, validation and export finish in ${row.seconds.toFixed(3)} seconds at release error or better`);
   }
   check(`Downloaded curves independently match the original mask within ${(100*row.independentImageError).toFixed(3)}%`);
   await button('Compare').click();await page.locator('.comparison-view').screenshot({path:`${output}/${name}-${id}-difference.png`});assert.equal(await button('Original paths').count(),0);await button('Original mask').click();await page.locator('canvas.mask').waitFor();check('Original mask and measured difference remain inspectable');assert.deepEqual(row.pageErrors,[]);
  }catch(e){row.error=e.stack;process.exitCode=1;console.error(name,id,e);if(page)await page.screenshot({path:`${output}/${name}-${id}-failure.png`,fullPage:true});}
  finally{await context.close();await fs.writeFile(`${output}/results.json`,JSON.stringify({origin,source,scope,results},null,2));}
 }}finally{await browser.close();}
}
console.log(output);
