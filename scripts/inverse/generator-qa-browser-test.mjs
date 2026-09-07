/** Generator QA on real browser engines, real workers, and user interactions.
 * Includes the reported yellow photo when the local benchmark source is present.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createCanvas} from 'canvas';
import {heartPhoto} from './crop-fixture.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:4173';
const output=`tmp/inverse-browser/${new Date().toISOString().replace(/[:.]/g,'-')}-generator-qa`;
await fs.mkdir(output,{recursive:true});
const results=[],expected=[[190,80],[275,155],[190,230],[105,155]];
const photo=heartPhoto({colours:['#ffe416','#867309'],background:'#fff',lobeDepths:[.66,.61]});
const square=heartPhoto({height:380,colours:['#0068bb','#ce1471'],background:'#fff'});
const blank=heartPhoto({hearts:[]}),checker=createCanvas(128,128),cx=checker.getContext('2d');
for(let y=0;y<4;y++)for(let x=0;x<4;x++){cx.fillStyle=(x+y)%2?'#ad182b':'#eee1dd';cx.fillRect(x*32,y*32,32,32);}
const yellow=process.env.INVERSE_QA_YELLOW||'tmp/inverse-hard-photos/sources/bibel-star-curved.png';
const hasYellow=await fs.access(yellow).then(()=>true,()=>false);
for(const name of(process.env.INVERSE_QA_BROWSERS||'chromium,firefox,webkit').split(',')){
  const row={browser:name,checks:[],pageErrors:[]};results.push(row);let browser,page;
  const check=label=>{row.checks.push(label);console.log(`${name}: ${label}`);};
  try{
    browser=await engines[name].launch({headless:true});
    const context=await browser.newContext({viewport:{width:1400,height:1050},acceptDownloads:true});
    await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(origin).origin?r.continue():r.abort());
    await context.addInitScript(()=>{
      const Base=window.Worker;
      window.Worker=class extends Base{
        constructor(...args){super(...args);this.addEventListener('message',e=>{
          if(e.data.type==='prepared')window.qaPrepared=e.data.preview;
          if(e.data.type==='crops')window.qaCrops=e.data.crops;
        });}
        postMessage(data,...rest){const delay=window.qaDelayCrop&&data.action==='detect-crops'?1500:0;window.qaDelayCrop=false;if(delay)setTimeout(()=>super.postMessage(data,...rest),delay);else super.postMessage(data,...rest);}
      };
    });
    page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
    const button=label=>page.getByRole('button',{name:label,exact:true}).first();
    const idle=()=>page.waitForFunction(()=>document.querySelector('fieldset')?.disabled===false);
    const corners=()=>page.locator('.coordinates input').evaluateAll(es=>[0,2,4,6].map(i=>[+es[i].value,+es[i+1].value]));
    const upload=async(name,canvas)=>{await page.locator('input[type=file]').setInputFiles({name,mimeType:'image/png',buffer:canvas.toBuffer('image/png')});await idle();};
    const validCrop=async()=>{await page.waitForFunction(()=>document.querySelector('.photo-preview canvas')?.width===240);assert.equal(await page.locator('.corner').count(),4);};
    const near=(a,b,tolerance=6)=>assert.ok(a.every((p,i)=>Math.hypot(p[0]-b[i][0],p[1]-b[i][1])<tolerance),JSON.stringify({actual:a,expected:b,tolerance}));
    const clickSource=async(p,w=380,h=320)=>{
      const el=page.locator('.crop-image');await el.scrollIntoViewIfNeeded();const box=await el.boundingBox();
      await page.mouse.click(box.x+p[0]/w*box.width,box.y+p[1]/h*box.height);
    };
    const drag=async(a,b,w=380,h=320)=>{
      const el=page.locator('.crop-image');await el.scrollIntoViewIfNeeded();const box=await el.boundingBox();
      await page.mouse.move(box.x+a[0]/w*box.width,box.y+a[1]/h*box.height);await page.mouse.down();
      await page.mouse.move(box.x+b[0]/w*box.width,box.y+b[1]/h*box.height,{steps:8});await page.mouse.up();
    };
    await page.goto(`${origin}/en/generate/`);await idle();
    await upload('yellow-gold-heart.png',photo.canvas);await validCrop();near(await corners(),expected);
    // SVG outlines must follow the curves; a global CSS outline draws unwanted
    // rectangles around each arc's bounding box instead.
    assert.ok(await page.locator('.crop-image polyline').evaluateAll(es=>es.every(e=>getComputedStyle(e).outlineStyle==='none')));
    check('Coloured photo uploads, locates four overlap corners and renders its original crop');

    if(hasYellow){
      await page.locator('input[type=file]').setInputFiles(yellow);await idle();await validCrop();
      const q=await corners();near(q,[[515,137],[750,365],[514,607],[286,370]],18);
      row.yellowPhoto={file:yellow,quad:q,proposal:await page.evaluate(()=>window.qaCrops.candidates[0].locator),reference:'Earlier visual guide only; original cutting paths are unknown'};
      await page.locator('.crop-section').screenshot({path:`${output}/${name}-yellow.png`});
      check('Reported yellow-star photo locates automatically; uncertain fit remains marked for review');
    }

    await upload('square-photo.png',square.canvas);await validCrop();near(await corners(),expected);
    assert.equal(await page.getByLabel(/^Image area/).inputValue(),'quad');
    check('A square photograph also gets automatic corners instead of silently using the whole image');
    await page.getByLabel(/^Image area/).selectOption('square');
    assert.equal(await page.locator('.corner').count(),0);assert.equal(await page.locator('.photo-preview').count(),0);
    await page.getByLabel(/^Image area/).selectOption('quad');await validCrop();
    check('Whole-image mode hides the unused crop overlay; returning restores the selection');

    await page.getByLabel(/^Pattern style/).selectOption('direct');
    await button('Prepare artwork').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();
    const coordinate=page.locator('.coordinates input').first(),value=await coordinate.inputValue();await coordinate.fill('');
    assert.equal(await page.locator('.photo-preview').count(),0);assert.equal(await button('Find cutting templates').isDisabled(),true);
    assert.match(await page.locator('.crop-status').innerText(),/3\/4/);
    await button('Prepare artwork').click();await page.getByRole('alert').waitFor();
    await coordinate.fill(value);await validCrop();await button('Prepare artwork').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();
    check('Clearing a coordinate invalidates the crop and solve; restoring it recovers preparation');

    const q=await corners(),crossed=[q[0],q[2],q[1],q[3]];
    for(let i=0;i<4;i++)for(let k=0;k<2;k++)await page.locator('.coordinates input').nth(2*i+k).fill(String(crossed[i][k]));
    await button('Prepare artwork').click();await page.getByRole('alert').waitFor();await idle();
    assert.equal(await button('Download everything (.zip)').count(),0);
    await button('Place corners').click();
    for(const p of expected)await clickSource(p,380,380);
    await validCrop();near(await corners(),expected,3);
    await button('Prepare artwork').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();
    check('Crossed corners fail without exports; four manual clicks recover a usable crop');

    await upload('blank.png',blank.canvas);await button('Select one heart').click();
    await drag([65,30],[310,275]);await idle();
    assert.match(await page.locator('.crop-actions').getByRole('button',{name:'Place corners',exact:true}).getAttribute('class'),/active/);
    assert.equal(await page.getByText('Drag a rectangle around one whole heart',{exact:false}).count(),0);
    for(const p of expected)await clickSource(p);
    await validCrop();near(await corners(),expected,3);
    await button('Fit this outline').click();await idle();
    assert.equal(await page.getByText('No better outline was found.',{exact:false}).count(),1);
    near(await corners(),expected,3);
    check('Failed rectangle detection switches to manual corners; failed refitting preserves explicit edits');

    await page.evaluate(()=>window.qaDelayCrop=true);await button('Fit whole image').click();await button('Stop').click();await idle();
    await upload('after-stop.png',photo.canvas);await validCrop();near(await corners(),expected);
    check('Stopping corner detection permits a fresh upload and ignores the old worker');

    for(const file of[
      {name:'unsupported.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')},
      {name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not a png')},
      {name:'too-large.png',mimeType:'image/png',buffer:Buffer.alloc(12*1024*1024+1)},
    ]){
      await page.locator('input[type=file]').setInputFiles(file);await idle();await page.getByRole('alert').waitFor();
      assert.equal(await page.locator('.crop-image').count(),0);assert.equal(await button('Find cutting templates').isDisabled(),true);
      await upload('recovery.png',photo.canvas);await validCrop();
      check(`${file.name}: rejected cleanly; a valid upload recovers`);
    }
    const huge=createCanvas(5000,5000);await upload('too-many-pixels.png',huge);await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('.crop-image').count(),0);check('25-megapixel image is rejected before crop processing');

    await page.locator('input[type=file]').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await idle();
    await button('Check saved templates').click();await page.getByRole('alert').waitFor();await idle();
    assert.equal(await button('Download everything (.zip)').count(),0);check('Malformed saved templates report an error without stale downloads');

    await upload('woven-square.png',checker);await page.getByLabel(/^Pattern style/).selectOption('direct');
    assert.equal(await page.getByLabel(/^Image area/).inputValue(),'square');
    await page.getByLabel('Search budget (seconds)',{exact:true}).fill('10');
    await button('Prepare artwork').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();
    await button('Find cutting templates').click();await page.getByRole('heading',{name:'Template pair checked',exact:true}).waitFor({timeout:60000});
    const pending=page.waitForEvent('download');await button('Download everything (.zip)').click();const zip=`${output}/${name}.zip`;await(await pending).saveAs(zip);
    const report=JSON.parse(execFileSync('unzip',['-p',zip,'report.json'],{encoding:'utf8'})),cuts=JSON.parse(execFileSync('unzip',['-p',zip,'cut_geometry.json'],{encoding:'utf8'}));
    assert.equal(report.templateExportAllowed,true);assert.equal(report.manufacturing.status,'pass');assert.deepEqual(report.slits,{left:3,right:3});
    const mask=await page.evaluate(()=>Array.from(window.qaPrepared.mask)),render=await renderExportedWeave(cuts,128);
    assert.ok(render.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length<.005);
    check('Fresh direct solve exports a checked ZIP whose curves independently reproduce the source');
    await page.getByLabel(/^Pattern style/).selectOption('general');
    await button('Prepare artwork').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();
    await button('Find cutting templates').click();await page.getByRole('heading',{name:'Template pair checked',exact:true}).waitFor({timeout:60000});
    check('The General solver also completes a fresh solve with the real WASM engine');
    await page.getByLabel('Minimum strip width (mm)',{exact:true}).fill('2.1');
    assert.equal(await button('Download everything (.zip)').count(),0);assert.equal(await button('Find cutting templates').isDisabled(),true);
    check('Changing a cutting constraint removes the previous result and exports');

    const tiny=createCanvas(16,16);tiny.getContext('2d').drawImage(checker,0,0,16,16);
    await upload('tiny-artwork.png',tiny);assert.equal(await page.getByRole('alert').count(),0);
    await page.getByLabel(/^Pattern style/).selectOption('direct');
    await button('Prepare artwork').click();await page.getByRole('heading',{name:'Inspect your pattern',exact:true}).waitFor();
    check('Tiny square artwork skips the locator and still prepares');

    await page.setViewportSize({width:390,height:844});await upload('mobile-heart.png',photo.canvas);await validCrop();
    await button('Place corners').click();for(const p of expected)await clickSource(p);await validCrop();near(await corners(),expected,3);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${output}/${name}-mobile.png`,fullPage:true});
    check('Mobile layout supports manual placement without horizontal overflow');
    await page.goto(`${origin}/generate/`);await idle();await upload('gult-hjerte.png',photo.canvas);await validCrop();
    assert.equal(await button('Placér hjørner').count(),1);check('Danish generator exposes and uses the same crop tools');

    let failWorker=true;
    await context.route('**/inverse/worker-bootstrap.js',r=>{if(failWorker){failWorker=false;return r.abort();}return r.continue();});
    await page.goto(`${origin}/en/generate/`);await idle();await upload('worker-retry.png',photo.canvas);await page.getByRole('alert').waitFor();
    await button('Fit whole image').click();await idle();await validCrop();
    check('A failed worker load reports an error and retries with a fresh worker');

    await page.evaluate(()=>window.qaDelayCrop=true);await button('Fit whole image').click();
    await page.locator('#right-color').fill('#156cbb');await idle();
    assert.equal(await button('Find cutting templates').isDisabled(),true);
    await button('Fit whole image').click();await idle();await validCrop();
    check('Changing a footer colour during detection cancels safely and permits another fit');
    assert.deepEqual(row.pageErrors,[]);
  }catch(e){row.error=e.stack;console.error(name,e);process.exitCode=1;if(page)await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true});}
  finally{await browser?.close();await fs.writeFile(`${output}/results.json`,JSON.stringify({origin,hasYellow,results},null,2));}
}
console.log(output);
