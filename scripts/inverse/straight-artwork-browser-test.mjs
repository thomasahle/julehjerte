/** Actual upload → whole square → solve → independently render downloaded cuts. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {motifFixture} from './motif-fixture.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {segmentDistance} from '../../static/inverse/core/bezier.js';
const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:4173';
const output=`tmp/inverse-browser/${new Date().toISOString().replace(/[:.]/g,'-')}-straight-artwork`,results=[];
await fs.mkdir(output,{recursive:true});
for(const name of (process.env.INVERSE_TEST_BROWSERS||'chromium,firefox,webkit').split(',')){
 const browser=await engines[name].launch({headless:true});
 try{for(const shape of (process.env.INVERSE_TEST_SHAPES||'hat,house,circle').split(',')){
  const fixture=motifFixture(shape),file=`${output}/${shape}.png`;await fs.writeFile(file,fixture.png);
  const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true}),row={browser:name,shape,pageErrors:[]};results.push(row);
  let page;
  try{
   await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(origin).origin?r.continue():r.abort());
   page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
   await page.goto(`${origin}/en/generate/`);await page.waitForFunction(()=>document.querySelector('fieldset')?.disabled===false);
   const button=name=>page.getByRole('button',{name,exact:true}).first();
   await page.locator('input[type=file]').setInputFiles(file);await page.waitForFunction(()=>!document.querySelector('fieldset').disabled);
   await page.getByRole('combobox',{name:/Image area/}).selectOption('square');
   await button('Prepare artwork').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();
   const start=performance.now();await button('Find cutting templates').click();
   await page.waitForFunction(()=>[...document.querySelectorAll('h2,h3')].some(e=>['Template pair checked','This pair needs attention'].includes(e.textContent))||!!document.querySelector('[role=alert]'),{},{timeout:60000});
   row.solveWallSeconds=(performance.now()-start)/1000;
   assert.equal(await button('Download everything (.zip)').count(),1,await page.locator('.preview-panel').innerText());
   const pending=page.waitForEvent('download');await button('Download everything (.zip)').click();const zip=`${output}/${name}-${shape}.zip`;await(await pending).saveAs(zip);
   const report=JSON.parse(execFileSync('unzip',['-p',zip,'report.json'],{encoding:'utf8'})),cuts=JSON.parse(execFileSync('unzip',['-p',zip,'cut_geometry.json'],{encoding:'utf8'}));row.report=report;
   assert.equal(await page.getByRole('heading',{name:'Template pair checked',exact:true}).count(),1,await page.locator('.preview-panel').innerText());
   assert.notEqual(report.solver.imported,true);assert.equal(report.solver.automatic.selected,'direct');assert.equal(report.solver.algorithm,'direct-bezier');
   assert.ok(report.solver.checkpoints.length>0);
   assert.equal(report.templateChecksPassed,true);assert.equal(report.validation.passed,true);assert.equal(report.manufacturing.status,'pass');
   const curves=Object.values(cuts.curves),straight=curves.filter(c=>{const p=c.control_points;return p.slice(1,3).every(h=>segmentDistance(h,p[0],p[3])<1e-6);});
   if(shape==='circle'){assert.ok(straight.length>0);assert.ok(straight.length<curves.length);}
   else assert.ok(straight.length>=.9*curves.length);
   const rendered=await renderExportedWeave(cuts,240);let errors=0,pixels=0;
   for(let y=0;y<240;y++)for(let x=0;x<240;x++)if(Math.min(x,y,239-x,239-y)>=fixture.border*240){pixels++;errors+=Number(rendered.mask[y*240+x]!==fixture.motif[y*240+x]);}
   row.independentCentreError=errors/pixels;assert.ok(row.independentCentreError<(shape==='house'?.0005:.003));
   for(const tab of ['Woven heart','Left template','Right template','Original paths','Original mask','Compare']){
    await button(tab).click();await page.waitForFunction(()=>[...document.querySelectorAll('.preview-panel img')].every(i=>i.complete&&i.naturalWidth>0));
    if(tab==='Woven heart'||tab==='Compare')await page.locator('.preview-panel').screenshot({path:`${output}/${name}-${shape}-${tab.replaceAll(' ','-')}.png`});
   }
   assert.deepEqual(row.pageErrors,[]);console.log(name,shape,`${row.solveWallSeconds.toFixed(2)}s`,`${(100*row.independentCentreError).toFixed(3)}% centre disagreement`);
  }catch(error){row.error=error.stack;process.exitCode=1;console.error(name,shape,error);if(page)await page.screenshot({path:`${output}/${name}-${shape}-failure.png`,fullPage:true});}
  finally{await context.close();await fs.writeFile(`${output}/results.json`,JSON.stringify({origin,results},null,2));}
 }}finally{await browser.close();}
}
console.log(output);
