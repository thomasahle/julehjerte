/** Real uploads exercise the matching preference, notices, retained mask and ZIP. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createCanvas} from 'canvas';
import {matchingSummary} from '../../static/inverse/core/direct/matching.js';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {renderExportedWeave} from './export-renderer.mjs';

const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:4173';
const output=`tmp/inverse-browser/${new Date().toISOString().replace(/[:.]/g,'-')}-matching`,results=[];
await fs.mkdir(output,{recursive:true});
for(const name of(process.env.INVERSE_TEST_BROWSERS||'chromium,firefox,webkit').split(',')){
  const browser=await engines[name].launch({headless:true}),row={browser:name,checks:[],pageErrors:[]};results.push(row);let page;
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
    await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(origin).origin?r.continue():r.abort());
    await context.addInitScript(()=>{const Base=window.Worker;window.Worker=class extends Base{constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data.type==='prepared')window.matchPrepared=e.data.preview;if(e.data.type==='result')window.matchResult=e.data.result;});}};});
    page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
    const idle=()=>page.waitForFunction(()=>document.querySelector('fieldset')?.disabled===false),button=s=>page.getByRole('button',{name:s,exact:true}).first();
    const solve=async()=>{await button('Prepare artwork').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();await button('Find cutting templates').click();await page.getByRole('heading',{name:'Template pair checked',exact:true}).waitFor({timeout:90000});};
    await page.goto(`${origin}/en/generate/`);await idle();assert.equal(await page.getByLabel(/^Pattern style/).count(),0);
    assert.equal(await page.getByLabel('Prefer matching templates',{exact:true}).count(),0);
    await page.getByText('Cutting and search settings',{exact:true}).click();await page.getByLabel('Simulated cutting-error trials',{exact:true}).fill('0');
    await page.locator('input[type=file]').setInputFiles('scripts/inverse/fixtures/matching/user-symmetric-hearts.png');await idle();await solve();
    row.photoReport=await page.evaluate(()=>window.matchResult.report);assert.equal(row.photoReport.templateChecksPassed,true);assert.equal(row.photoReport.solver.numericalBackend.backend,'wasm');
    assert.ok(row.photoReport.imageError.mismatchFraction<.01);
    assert.ok(await page.getByText(/Identical templates would differ from this crop by at least/).isVisible());
    await button('Compare').click();await page.locator('.comparison-view').screenshot({path:`${output}/${name}-photo-comparison.png`});
    await button('Original mask').click();await page.locator('canvas.mask').waitFor();
    row.checks.push('The uploaded photo fits below 1% error, explains the identical-template lower bound, and retains its mask and comparison');
    const c=createCanvas(128,128),cx=c.getContext('2d');for(let y=0;y<4;y++)for(let x=0;x<4;x++){cx.fillStyle=(x+y)%2?'#b91313':'#ffffff';cx.fillRect(x*32,y*32,32,32);}
    await page.locator('input[type=file]').setInputFiles({name:'symmetric-checker.png',mimeType:'image/png',buffer:c.toBuffer('image/png')});await idle();await solve();
    assert.ok(await page.getByText('Both sheets use the same cutting pattern.',{exact:true}).isVisible());
    const pending=page.waitForEvent('download');await button('Download everything (.zip)').click();const zip=`${output}/${name}-checker.zip`;await(await pending).saveAs(zip);
    const cuts=execFileSync('unzip',['-p',zip,'cut_geometry.json'],{encoding:'utf8'});
    assert.equal(matchingSummary(loadSolutionJSON(cuts)).identical,true);
    const prepared=await page.evaluate(()=>({mask:Array.from(window.matchPrepared.mask),resolution:window.matchPrepared.resolution})),woven=await renderExportedWeave(cuts,prepared.resolution);
    assert.ok(woven.mask.every((v,i)=>v===prepared.mask[i]));row.checks.push('The symmetric checker exports exactly identical paths and independently renders the original mask without error');
    await page.screenshot({path:`${output}/${name}-checker.png`,fullPage:true});assert.deepEqual(row.pageErrors,[]);
    console.log(name,row.checks);
  }catch(error){row.error=error.stack;process.exitCode=1;console.error(name,error);if(page)await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true});}
  finally{await browser.close();await fs.writeFile(`${output}/results.json`,JSON.stringify({origin,results},null,2));}
}
console.log(output);
