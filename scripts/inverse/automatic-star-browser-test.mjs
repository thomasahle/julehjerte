/** Upload → automatic corners → default solve → downloaded templates.
 * Capture actual browser-decoded input; never inject crops, masks or solutions.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {rectify,quantize} from '../../static/inverse/core/input.js';
import {renderExportedWeave} from './export-renderer.mjs';
const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:4173';
const output=`tmp/inverse-browser/${new Date().toISOString().replace(/[:.]/g,'-')}-automatic-star`;
await fs.mkdir(output,{recursive:true});
const files={user:'scripts/inverse/fixtures/yellow-star-photo.png',web:process.env.INVERSE_QA_YELLOW||'tmp/inverse-hard-photos/sources/bibel-star-curved.png'},results=[],skipped=[];
for(const[id,file]of Object.entries(files))if(!await fs.access(file).then(()=>true,()=>false)){delete files[id];skipped.push({id,file,reason:'Local source absent'});}
assert.ok(files.user,'The committed user-photo regression fixture is required');
for(const name of(process.env.INVERSE_TEST_BROWSERS||'chromium,firefox,webkit').split(',')){
  const browser=await engines[name].launch({headless:true});
  try{for(const[id,file]of Object.entries(files)){
    const row={browser:name,id,file,checks:[],pageErrors:[]};results.push(row);let page;
    const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
    const check=label=>{row.checks.push(label);console.log(name,id,label);};
    try{
      await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(origin).origin?r.continue():r.abort());
      await context.addInitScript(()=>{const post=Worker.prototype.postMessage;Worker.prototype.postMessage=function(...args){const m=args[0];if(m?.action==='prepare'&&m.input?.type==='pixels')window.starSource={rgba:Array.from(m.input.rgba),width:m.input.imageWidth,height:m.input.imageHeight,quad:m.input.quad};return post.apply(this,args);};});
      page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
      await page.goto(`${origin}/en/generate/`);await page.waitForFunction(()=>document.querySelector('fieldset')?.disabled===false);
      const button=t=>page.getByRole('button',{name:t,exact:true}).first();
      await page.locator('input[type=file]').setInputFiles(file);await page.waitForFunction(()=>document.querySelectorAll('.corner').length===4&&!document.querySelector('fieldset').disabled);
      row.quad=await page.locator('.coordinates input').evaluateAll(es=>[0,2,4,6].map(i=>[+es[i].value,+es[i+1].value]));
      assert.ok(await page.locator('.crop-image polyline').evaluateAll(es=>es.every(e=>getComputedStyle(e).outlineStyle==='none')));
      await page.locator('.crop-image').screenshot({path:`${output}/${name}-${id}-crop.png`});
      check('Upload finds all four corners without manual edits and without black bounding boxes');
      await button('Prepare artwork').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();
      check('Automatic crop prepares with unchanged General defaults');
      await button('Find cutting templates').click();
      await page.waitForFunction(()=>[...document.querySelectorAll('h2,h3')].some(e=>e.textContent==='Template pair checked')||!!document.querySelector('[role=alert]'),{},{timeout:120000});
      assert.equal(await page.getByRole('heading',{name:'Template pair checked',exact:true}).count(),1,await page.locator('.preview-panel').innerText());
      const pending=page.waitForEvent('download');await button('Download everything (.zip)').click();const zip=`${output}/${name}-${id}.zip`;await(await pending).saveAs(zip);
      const report=JSON.parse(execFileSync('unzip',['-p',zip,'report.json'],{encoding:'utf8'})),cuts=JSON.parse(execFileSync('unzip',['-p',zip,'cut_geometry.json'],{encoding:'utf8'}));row.report=report;
      assert.equal(report.solver.imported,undefined);assert.equal(report.templateChecksPassed,true);assert.equal(report.validation.passed,true);assert.equal(report.manufacturing.status,'pass');assert.deepEqual(report.slits,{left:5,right:5});assert.deepEqual(report.input.sourceImage.cropCorners,row.quad);
      assert.equal(report.input.sourceImage.cropProvenance.manuallyEdited,false);
      check('Fresh solve downloads a validated five-slit pair from the unchanged automatic crop');
      const source=await page.evaluate(()=>window.starSource),n=report.input.traceResolution;
      assert.ok(source);assert.deepEqual(source.quad,row.quad);
      const mask=quantize(rectify(Uint8ClampedArray.from(source.rgba),source.width,source.height,n,source.quad),{mode:'auto'}).mask,rendered=await renderExportedWeave(cuts,n);
      row.independentImageError=rendered.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length;assert.ok(row.independentImageError<=.03,`${row.independentImageError} independent image disagreement`);
      await fs.writeFile(`${output}/${name}-${id}-independent.png`,rendered.png);
      check(`Downloaded curves independently match the original classified crop within ${(100*row.independentImageError).toFixed(3)}%`);
      for(const tab of['Woven heart','Left template','Right template','Paper support']){await button(tab).click();await page.waitForFunction(()=>[...document.querySelectorAll('.preview-panel img')].every(i=>i.complete&&i.naturalWidth>0));await page.locator('.preview-panel').screenshot({path:`${output}/${name}-${id}-${tab.replaceAll(' ','-')}.png`});}
      check('Woven heart, both cutting templates and paper support render');assert.deepEqual(row.pageErrors,[]);
    }catch(e){row.error=e.stack;process.exitCode=1;console.error(name,id,e);if(page)await page.screenshot({path:`${output}/${name}-${id}-failure.png`,fullPage:true});}
    finally{await context.close();await fs.writeFile(`${output}/results.json`,JSON.stringify({origin,skipped,results},null,2));}
  }}finally{await browser.close();}
}
console.log(output);
