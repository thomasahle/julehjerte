/** Failed checks remain visible and never block candidate views or downloads. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fixture} from './fixtures.mjs';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {finish} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';

const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:4173';
const output=`tmp/inverse-browser/${new Date().toISOString().replace(/[:.]/g,'-')}-review`,results=[];
await fs.mkdir(output,{recursive:true});
const thin={name:'thin-saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(solutionJSON(fixture('thin'))))};
// Actual engine/export output with exactly the user's reported 4.37% mismatch.
// This is a controlled UI fixture, not a reconstruction of their photograph.
const imageFixture=fixture('straight'),mask=sampleWeave(imageFixture,100);
for(let i=0;i<437;i++)mask[i]^=1;
imageFixture.graph.target.sourceImage={mask,resolution:100};
const mismatch=finish(imageFixture,settings({width:60,trials:0,roundHidden:false}));
assert.equal(mismatch.report.imageError.mismatchFraction,.0437);
for(const name of(process.env.INVERSE_TEST_BROWSERS||'chromium,firefox,webkit').split(',')){
  const browser=await engines[name].launch({headless:true}),row={browser:name,checks:[],pageErrors:[]};results.push(row);let page;
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
    await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(origin).origin?r.continue():r.abort());
    page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
    const button=s=>page.getByRole('button',{name:s,exact:true}).first(),idle=()=>page.waitForFunction(()=>document.querySelector('fieldset')?.disabled===false);
    await page.goto(`${origin}/en/generate/`);await idle();
    assert.equal(await page.getByLabel(/^Pattern style/).count(),0);
    await page.locator('input[type=file]').setInputFiles(thin);await idle();await button('Check saved templates').click();await idle();
    await page.getByRole('heading',{name:'This pair needs attention',exact:true}).waitFor();
    for(const tab of['Left template','Right template']){assert.equal(await button(tab).isEnabled(),true);await button(tab).click();await page.locator(`img[alt="${tab}"]`).waitFor();}
    const pending=page.waitForEvent('download');await button('Download everything (.zip)').click();const zip=`${output}/${name}-geometry.zip`;await(await pending).saveAs(zip);
    const report=JSON.parse(execFileSync('unzip',['-p',zip,'report.json'],{encoding:'utf8'}));
    assert.equal(report.templateExportAllowed,true);assert.equal(report.templateChecksPassed,false);assert.equal(report.validation.passed,false);
    for(const file of['template_left.svg','template_right.svg','print_templates.html'])assert.match(execFileSync('unzip',['-p',zip,file],{encoding:'utf8'}),/Needs review/);
    row.checks.push('A real saved candidate with failing geometry exposes both template views and a complete annotated ZIP');

    await context.route('**/inverse/worker-bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:`self.onmessage=({data})=>self.postMessage({id:data.id,type:'result',result:${JSON.stringify(mismatch)}});`}));
    await page.reload();await idle();await page.locator('input[type=file]').setInputFiles(thin);await idle();await button('Check saved templates').click();await idle();
    assert.ok(await page.getByText('The woven result differs from your image by 4.37%, above the 3.00% target.',{exact:false}).isVisible());
    for(const tab of['Left template','Right template']){assert.equal(await button(tab).isEnabled(),true);await button(tab).click();}
    const left=page.waitForEvent('download');await button('Left SVG').click();await(await left).saveAs(`${output}/${name}-image-left.svg`);
    await page.locator('.preview-panel').screenshot({path:`${output}/${name}-image-review.png`});
    row.checks.push('The 4.37% engine-result fixture explains its image error beside enabled template views and SVG downloads');

    await page.goto(`${origin}/hjerte/circle/`);
    const photo=page.locator('img[src="/hearts/photos/circle.jpg"]');await photo.waitFor({state:'attached'});
    await photo.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('img[src="/hearts/photos/circle.jpg"]')?.naturalWidth===1000);
    await page.goto(`${origin}/hjerte/amy-pattern/`);
    assert.equal(await page.getByRole('link',{name:'Amy Young',exact:true}).getAttribute('href'),'https://www.amydesign.co/');
    row.checks.push('Uret v2 renders its cropped photo and Amy Young links to the requested website');
    assert.deepEqual(row.pageErrors,[]);console.log(name,row.checks);
  }catch(error){row.error=error.stack;process.exitCode=1;console.error(name,error);if(page)await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true});}
  finally{await browser.close();await fs.writeFile(`${output}/results.json`,JSON.stringify({origin,results},null,2));}
}
console.log(output);
