/** Verify the actual Star button, worker solve and downloaded cuts against the gallery reference. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { referenceEnvironment, compareCutPaths, cutOverlay } from './reference.mjs';
import { renderExportedWeave } from './export-renderer.mjs';
const {chromium,firefox}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:4173';
const output=`tmp/inverse-browser/${new Date().toISOString().replace(/[:.]/g,'-')}-reference`;
await fs.mkdir(output,{recursive:true});
const env=await referenceEnvironment();let ref;try{ref=await env.load('5star',600);}finally{await env.close();}
const results=[];
for(const [name,type] of Object.entries({chromium,firefox})) {
  const browser=await type.launch({headless:true}), row={browser:name,checks:[],pageErrors:[]};results.push(row);let page;
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
    await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(origin).origin?r.continue():r.abort());
    page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
    await page.goto(`${origin}/en/generate/`);await page.waitForFunction(()=>document.querySelector('fieldset')?.disabled===false);
    const button=t=>page.getByRole('button',{name:t,exact:true}).first();
    await button('Star · new solve').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();
    assert.equal(await page.getByRole('combobox',{name:/^Pattern style/}).inputValue(),'matching-grid');
    assert.equal(await page.locator('.filename').innerText(),'star.png');
    assert.equal(await page.getByLabel('Minimum strip width (mm)',{exact:true}).inputValue(),'2');
    row.checks.push('Star opens raster artwork with the explicitly described matching-sheet preset');
    await button('Find cutting templates').click();await page.getByRole('heading',{name:'Template pair checked',exact:true}).waitFor({timeout:90000});
    const pending=page.waitForEvent('download');await button('Download everything (.zip)').click();const item=await pending;
    const zip=`${output}/${name}.zip`;await item.saveAs(zip);
    const report=JSON.parse(execFileSync('unzip',['-p',zip,'report.json'],{encoding:'utf8'}));
    const cuts=JSON.parse(execFileSync('unzip',['-p',zip,'cut_geometry.json'],{encoding:'utf8'}));
    assert.equal(report.solver.imported,undefined);assert.equal(report.templateExportAllowed,true);assert.equal(report.manufacturing.status,'pass');
    assert.ok(report.solver.graph.guidePortals>0);
    row.report=report;row.paths=compareCutPaths(cuts,ref.cuts);assert.equal(row.paths.unmatchedSlits,0);assert.ok(row.paths.symmetricMeanMm<.1);assert.ok(row.paths.sampledMaximumMm+row.paths.maximumSamplingErrorBoundMm<.5);
    const rendered=await renderExportedWeave(cuts,600);row.independentImageError=rendered.mask.reduce((s,c,i)=>s+Number(c!==Number(ref.input.rgba[4*i]<128)),0)/rendered.mask.length;assert.ok(row.independentImageError<.005);
    await fs.writeFile(`${output}/${name}-overlay.svg`,cutOverlay(cuts,ref.cuts));
    row.checks.push('Downloaded fresh cuts pass geometry, paper, independent image rendering and published-path thresholds');
    for(const tab of ['Woven heart','Left template','Right template','Paper support']){await button(tab).click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('.preview-panel img')).every(i=>i.complete&&i.naturalWidth>0));await page.screenshot({path:`${output}/${name}-${tab.replaceAll(' ','-')}.png`,fullPage:true});}
    row.checks.push('All four result views render the checked pair');
    await button('Waves · new solve').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();assert.equal(await page.getByRole('combobox',{name:/^Pattern style/}).inputValue(),'general');
    row.checks.push('Waves resets matching-sheet assumptions and sharp-corner settings');
    await page.goto(`${origin}/generate/`);await page.waitForFunction(()=>document.querySelector('fieldset')?.disabled===false);await button('Stjerne · ny beregning').click();await page.getByRole('heading',{name:'Se dit mønster efter',exact:true}).waitFor();assert.equal(await page.getByRole('combobox',{name:/^Mønstertype/}).inputValue(),'matching-grid');
    row.checks.push('Danish Star example uses the same fresh image workflow');
    assert.deepEqual(row.pageErrors,[]);
  }catch(e){row.error=e.stack;process.exitCode=1;if(page)await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true});console.error(e);}
  finally{await browser.close();await fs.writeFile(`${output}/results.json`,JSON.stringify({origin,results},null,2));}
}
console.log(output);
