/** Reproduce supplied photos through automatic fitting and manual crop recovery. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {renderExportedWeave} from './export-renderer.mjs';
import {auditImageFeatures} from '../../static/inverse/core/image-features.js';

const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:4173';
const output=`tmp/inverse-browser/${new Date().toISOString().replace(/[:.]/g,'-')}-preset-recovery`,results=[];
const cases=[
  {id:'flag-screenshot',file:'scripts/inverse/fixtures/preset-recovery/hunodan-flag-screenshot.png'},
  {id:'blue-stars',file:'scripts/inverse/fixtures/hunodan/source/hjsta-05.jpg',region:[.37,.015,.99,.94]},
  {id:'tilted-orange-weave',file:'scripts/inverse/fixtures/hard-user/tilted-orange-weave.png',manual:[[447,160],[845,574],[350,921],[55,451]]},
];
await fs.mkdir(output,{recursive:true});
for(const name of(process.env.INVERSE_TEST_BROWSERS||'chromium,firefox,webkit').split(',')){
  const browser=await engines[name].launch({headless:true});
  try{for(const entry of cases){
    if(process.env.INVERSE_TEST_CASES&&!process.env.INVERSE_TEST_CASES.split(',').includes(entry.id))continue;
    const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
    const row={browser:name,id:entry.id,checks:[],pageErrors:[]};results.push(row);let page;
    try{
      await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(origin).origin?r.continue():r.abort());
      await context.addInitScript(()=>{const Base=window.Worker;window.recoveryRequests=[];window.Worker=class extends Base{
        postMessage(message,...args){if(['prepare','solve'].includes(message.action))window.recoveryRequests.push({action:message.action,settings:message.settings,quad:message.input?.quad});super.postMessage(message,...args);}
        constructor(...args){super(...args);this.addEventListener('message',e=>{
          if(e.data.type==='prepared')window.recoveryPrepared=e.data.preview;
          if(e.data.type==='result')window.recoveryResult=e.data.result;
        });}
      };});
      page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
      const idle=()=>page.waitForFunction(()=>document.querySelector('fieldset')?.disabled===false);
      const button=s=>page.getByRole('button',{name:s,exact:true}).first();
      await page.goto(`${origin}/en/generate/`);await idle();
      const style=page.getByLabel(/^Pattern style/);
      assert.equal(await style.count(),0);
      await button('Star · new solve').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();
      assert.equal(await style.count(),0);
      await page.locator('input[type=file]').setInputFiles(entry.file);await idle();
      assert.equal(await style.count(),0);
      assert.equal(await page.getByLabel('Prefer matching templates',{exact:true}).count(),0);
      assert.equal(await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).count(),0);
      row.checks.push('A photo upload replaces the example without exposing any fitting or matching options');
      if(entry.manual){
        // This photograph remains a known automatic-detection failure. Verify
        // recovery without pretending the diagnostic landmarks were detected.
        assert.equal(await page.locator('.corner').count(),0);
        await button('Place corners').click();
        for(const p of entry.manual){
          const el=page.locator('.crop-image');await el.scrollIntoViewIfNeeded();
          const box=await el.boundingBox(),size=await el.locator('img').evaluate(im=>[im.naturalWidth,im.naturalHeight]);
          await page.mouse.click(box.x+p[0]/size[0]*box.width,box.y+p[1]/size[1]*box.height);
        }
        for(let i=0;i<4;i++)for(let axis=0;axis<2;axis++)await page.locator('.coordinates input').nth(2*i+axis).fill(String(entry.manual[i][axis]));
        row.checks.push('The known detector failure recovers through four manual corner clicks and coordinate adjustments');
      }
      if(await page.locator('.corner').count()===0&&entry.region){
        // The full source also contains its printed template. Follow the UI's
        // one-heart selection flow; the locator still estimates all corners.
        await button('Select one heart').click();
        await page.locator('.crop-image').scrollIntoViewIfNeeded();
        const box=await page.locator('.crop-image').boundingBox(),[x,y,x1,y1]=entry.region;
        await page.mouse.move(box.x+x*box.width,box.y+y*box.height);await page.mouse.down();
        await page.mouse.move(box.x+x1*box.width,box.y+y1*box.height,{steps:10});await page.mouse.up();await idle();
        row.checks.push('Selected a rough rectangle around the photographed heart in the combined photo/template image');
      }
      assert.equal(await page.locator('.corner').count(),4);
      row.quad=await page.locator('.coordinates input').evaluateAll(es=>[0,2,4,6].map(i=>[+es[i].value,+es[i+1].value]));
      await page.locator('.crop-image').screenshot({path:`${output}/${name}-${entry.id}-crop.png`});

      await page.evaluate(()=>{window.recoveryRequests=[];window.recoveryResult=null;});
      await button('Prepare artwork').click();await idle();
      assert.equal(await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).count(),1,await page.locator('.preview-panel').innerText());
      assert.equal(await style.count(),0);
      assert.equal(await page.getByRole('alert').count(),0);
      const prepared=await page.evaluate(()=>({mask:Array.from(window.recoveryPrepared.mask),resolution:window.recoveryPrepared.resolution}));
      row.requests=await page.evaluate(()=>window.recoveryRequests);
      assert.deepEqual(row.requests.map(r=>r.settings.algorithm),['auto']);
      for(const r of row.requests){
        assert.deepEqual(r.quad,row.quad);
        for(const key of['width','minWidth','cutError','timeLimit','paperColors','trials','requireMaterialCore'])assert.deepEqual(r.settings[key],row.requests[0].settings[key]);
      }
      row.checks.push('Automatic preparation preserves the accepted corners and physical settings');
      await button('Find cutting templates').click();
      await page.waitForFunction(()=>!!window.recoveryResult||!!document.querySelector('[role=alert]'),{},{timeout:90000});
      row.report=await page.evaluate(()=>window.recoveryResult?.report);
      assert.equal(row.report?.templateChecksPassed,true,await page.locator('.preview-panel').innerText());
      assert.equal(row.report.validation.passed,true);assert.equal(row.report.manufacturing.status,'pass');
      assert.deepEqual(row.report.input.sourceImage.cropCorners,row.quad);
      const pending=page.waitForEvent('download');await button('Download everything (.zip)').click();
      const zip=`${output}/${name}-${entry.id}.zip`;await(await pending).saveAs(zip);
      const cuts=execFileSync('unzip',['-p',zip,'cut_geometry.json'],{encoding:'utf8'});
      const rendered=await renderExportedWeave(cuts,prepared.resolution);
      row.independentImageError=rendered.mask.reduce((s,v,i)=>s+Number(v!==prepared.mask[i]),0)/prepared.mask.length;
      assert.ok(row.independentImageError<=.03);
      assert.equal(auditImageFeatures(prepared,rendered.mask,100).passed,true);
      await fs.writeFile(`${output}/${name}-${entry.id}-woven.png`,rendered.png);
      await button('Compare').click();await page.locator('.comparison-view').screenshot({path:`${output}/${name}-${entry.id}-difference.png`});
      await button('Original mask').click();await page.locator('canvas.mask').waitFor();
      row.checks.push('Downloaded templates pass independent image and feature checks; the original mask and comparison remain available');
      assert.deepEqual(row.pageErrors,[]);
      console.log(name,entry.id,JSON.stringify({error:row.independentImageError,seconds:row.report.solver.seconds,checks:row.checks}));
    }catch(error){row.error=error.stack;process.exitCode=1;console.error(name,entry.id,error);if(page)await page.screenshot({path:`${output}/${name}-${entry.id}-failure.png`,fullPage:true});}
    finally{await context.close();await fs.writeFile(`${output}/results.json`,JSON.stringify({origin,results},null,2));}
  }}finally{await browser.close();}
}
console.log(output);
