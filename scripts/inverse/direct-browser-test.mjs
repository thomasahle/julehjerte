/** Real direct-fit worker, cancellation, photo reconstruction and exported curves. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createCanvas} from 'canvas';
import {renderExportedWeave} from './export-renderer.mjs';

const {chromium,firefox}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:4173';
const output=`tmp/inverse-browser/${new Date().toISOString().replace(/[:.]/g,'-')}-direct`,results=[];
await fs.mkdir(output,{recursive:true});
const canvas=createCanvas(128,128),ctx=canvas.getContext('2d');
for(let y=0;y<4;y++)for(let x=0;x<4;x++){ctx.fillStyle=(x+y)%2?'#ad182b':'#eee1dd';ctx.fillRect(x*32,y*32,32,32);}
ctx.fillStyle='#ad182b';ctx.fillRect(3,0,1,1);ctx.fillRect(93,127,1,1);
const fixture=`${output}/edge-noise-checker.png`;await fs.writeFile(fixture,canvas.toBuffer('image/png'));
for(const [name,type]of Object.entries({chromium,firefox})){
  const row={browser:name,checks:[],pageErrors:[]};results.push(row);
  const browser=await type.launch({headless:true});let page;
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
    await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(origin).origin?r.continue():r.abort());
    await context.addInitScript(()=>{
      const Base=window.Worker;
      window.Worker=class extends Base{constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data.type==='prepared')window.directPreview=e.data.preview;});}};
    });
    page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
    await page.goto(`${origin}/en/generate/`);
    const button=label=>page.getByRole('button',{name:label,exact:true}).first();
    const idle=()=>page.waitForFunction(()=>document.querySelector('fieldset')?.disabled===false);
    await idle();await page.getByLabel(/^Pattern style/).selectOption('direct');
    const prepare=async(file,resolution,seconds)=>{
      await page.locator('input[type=file]').setInputFiles(file);await idle();
      await page.getByLabel(/^Image area/).selectOption('square');
      const conversion=page.locator('details').filter({has:page.getByText('Image conversion',{exact:true})});
      if(!(await conversion.evaluate(e=>e.open)))await conversion.locator('summary').click();
      await page.getByLabel(/^Separate source colours/).selectOption('red-white-mixture');
      await page.getByLabel('Tracing resolution (pixels)',{exact:true}).fill(String(resolution));
      await page.getByLabel('Search budget (seconds)',{exact:true}).fill(String(seconds));
      await button('Prepare artwork').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();
      const preview=await page.evaluate(()=>({metadata:window.directPreview.metadata,mask:Array.from(window.directPreview.mask)}));
      assert.equal(preview.metadata.direct,true);assert.equal(preview.metadata.preprocessing.traceUsed,false);
      assert.equal(await button('Simplify image').count(),0);
      await page.waitForFunction(n=>document.querySelector('canvas.mask')?.width===n,resolution);
      row.checks.push(`${file.split('/').at(-1)}: real worker bypasses tracing and shows the source mask`);
      return preview;
    };
    await prepare(fixture,128,10);await button('Find cutting templates').click();
    await button('Stop').click();await idle();
    assert.equal(await page.getByRole('heading',{name:'Template pair checked',exact:true}).count(),0);
    row.checks.push('Stopping terminates the worker without showing a stale result');
    const cases=[{file:fixture,resolution:128,seconds:10,name:'checker',counts:{left:3,right:3}}];
    if(process.env.INVERSE_RECROP_ARCHIVE)cases.push({file:`${process.env.INVERSE_RECROP_ARCHIVE}/inputs/cases/flower/rectified.png`,resolution:256,seconds:60,name:'flower',counts:{left:3,right:3}});
    for(const c of cases){
      const preview=await prepare(c.file,c.resolution,c.seconds);
      await button('Find cutting templates').click();
      await page.getByRole('heading',{name:'Template pair checked',exact:true}).waitFor({timeout:150000});
      const pending=page.waitForEvent('download');await button('Download everything (.zip)').click();
      const zip=`${output}/${name}-${c.name}.zip`;await(await pending).saveAs(zip);
      const report=JSON.parse(execFileSync('unzip',['-p',zip,'report.json'],{encoding:'utf8'}));
      const cuts=JSON.parse(execFileSync('unzip',['-p',zip,'cut_geometry.json'],{encoding:'utf8'}));
      assert.equal(report.solver.algorithm,'direct-bezier');assert.equal(report.solver.traceUsed,false);
      assert.equal(report.templateExportAllowed,true);assert.equal(report.manufacturing.status,'pass');
      assert.deepEqual(report.slits,c.counts);
      const rendered=await renderExportedWeave(cuts,c.resolution);
      const mismatch=rendered.mask.reduce((s,v,i)=>s+Number(v!==preview.mask[i]),0)/preview.mask.length;
      assert.ok(mismatch<=.03);row.checks.push(`${c.name}: valid fresh three-slit pair; independent exported-curve mismatch ${(mismatch*100).toFixed(3)}%`);
      await fs.writeFile(`${output}/${name}-${c.name}-report.json`,JSON.stringify(report,null,2));
      await page.screenshot({path:`${output}/${name}-${c.name}.png`,fullPage:true});
    }
    await page.getByLabel(/^Pattern style/).selectOption('general');
    assert.equal(await page.getByRole('heading',{name:'Template pair checked',exact:true}).count(),0);
    row.checks.push('Changing algorithm invalidates the prior result');
    assert.deepEqual(row.pageErrors,[]);
  }catch(e){row.error=e.stack;process.exitCode=1;console.error(e);if(page)await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true});}
  finally{await browser.close();await fs.writeFile(`${output}/results.json`,JSON.stringify({origin,results},null,2));}
  console.log(name,row.checks);
}
console.log(output);
