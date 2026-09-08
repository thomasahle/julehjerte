/** Exercise the photo's full user workflow, including downloaded cut geometry. */
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {yellowStarFile,yellowStarQuad} from './yellow-star-fixture.mjs';import {rectify,quantize} from '../../static/inverse/core/input.js';import {renderExportedWeave} from './export-renderer.mjs';
const {chromium,firefox}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:4173',output=`tmp/inverse-browser/${new Date().toISOString().replace(/[:.]/g,'-')}-yellow-star`,results=[];
await fs.mkdir(output,{recursive:true});
for(const[name,type]of Object.entries({chromium,firefox})){
  console.log(name,"launching");
  const browser=await type.launch({headless:true}),row={browser:name,checks:[],pageErrors:[]};results.push(row);let page;
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
    await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(origin).origin?r.continue():r.abort());
    await page.addInitScript(()=>{
      const post=Worker.prototype.postMessage;
      Worker.prototype.postMessage=function(...args){
        const input=args[0]?.input;
        if(args[0]?.action==='prepare'&&input?.type==='pixels')window.yellowStarSource={rgba:Array.from(input.rgba),imageWidth:input.imageWidth,imageHeight:input.imageHeight,quad:input.quad};
        return post.apply(this,args);
      };
    });
    console.log(name,"opening");
    await page.goto(`${origin}/en/generate/`);await page.waitForFunction(()=>document.querySelector('fieldset')?.disabled===false);const button=t=>page.getByRole('button',{name:t,exact:true}).first();
    await page.locator('input[type=file]').setInputFiles(process.env.INVERSE_TEST_YELLOW_IMAGE||fileURLToPath(yellowStarFile));await page.waitForFunction(()=>document.querySelector('fieldset')?.disabled===false);await button('Reset corners').click();
    for(let i=0;i<4;i++)for(let k=0;k<2;k++)await page.locator('.coordinates input').nth(2*i+k).fill(String(yellowStarQuad[i][k]));
    console.log(name,'preparing');await button('Prepare artwork').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();row.checks.push('Photo upload and manual crop prepare with default general settings');
    console.log(name,'solving');await button('Find cutting templates').click();await page.getByRole('heading',{name:'Template pair checked',exact:true}).waitFor({timeout:120000});
    const pending=page.waitForEvent('download');await button('Download everything (.zip)').click();const zip=`${output}/${name}.zip`;await(await pending).saveAs(zip);
    const report=JSON.parse(execFileSync('unzip',['-p',zip,'report.json'],{encoding:'utf8'})),cuts=JSON.parse(execFileSync('unzip',['-p',zip,'cut_geometry.json'],{encoding:'utf8'}));row.report=report;
    assert.equal(report.solver.imported,undefined);assert.equal(report.templateChecksPassed,true);assert.equal(report.validation.passed,true);assert.equal(report.manufacturing.status,'pass');assert.deepEqual(report.slits,{left:5,right:5});assert.ok(report.input.junctionRepairs.length>=15);
    row.checks.push('Fresh worker solve and ZIP export pass geometry and paper checks with five slits per sheet');
    const source=await page.evaluate(()=>window.yellowStarSource);assert.ok(source,'Captured the actual colour-managed browser input');
    const n=report.input.traceResolution,mask=quantize(rectify(Uint8ClampedArray.from(source.rgba),source.imageWidth,source.imageHeight,n,report.input.sourceImage.cropCorners),{mode:'auto'}).mask,rendered=await renderExportedWeave(cuts,n);
    row.imageReference='Actual browser-decoded pixels captured before worker preprocessing';row.independentImageError=rendered.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length;assert.ok(row.independentImageError<.02);await fs.writeFile(`${output}/${name}-independent-weave.png`,rendered.png);row.checks.push('Independent rendering of downloaded cuts stays within 2% of the unedited classified photo');
    for(const tab of['Woven heart','Left template','Right template','Paper support']){await button(tab).click();await page.waitForFunction(()=>[...document.querySelectorAll('.preview-panel img')].every(i=>i.complete&&i.naturalWidth>0));await page.screenshot({path:`${output}/${name}-${tab.replaceAll(' ','-')}.png`,fullPage:true});}
    row.checks.push('All four result views render');assert.deepEqual(row.pageErrors,[]);
  }catch(e){row.error=e.stack;process.exitCode=1;console.error(e);if(page)await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true});}
  finally{await browser.close();await fs.writeFile(`${output}/results.json`,JSON.stringify({origin,results},null,2));}
  console.log(name,row.checks);
}console.log(output);
