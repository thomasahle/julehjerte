/** Exercise the local polygon backend and its failure mode in Chromium.
 * Run against a fresh production preview; no browser tooling enters the app. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232';
const output=process.env.INVERSE_TEST_OUTPUT;
if(!output)throw new Error('Set INVERSE_TEST_OUTPUT to a new result directory.');
await fs.mkdir(output,{recursive:false});
const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/paper-offset-cases.json'));
const browser=await chromium.launch({headless:true}),rows=[];
try{
  for(const blocked of [false,true]){
    const context=await browser.newContext(),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await context.route('**/*',r=>new URL(r.request().url()).origin!==new URL(origin).origin||blocked&&r.request().url().endsWith('/clipper2z.wasm')?r.abort():r.continue());
    await page.goto(origin+'/en/editor/paint/');
    const result=await page.evaluate(async({cases})=>{
      const {finish}=await import('/inverse/core/engine.js');
      const {loadSolutionJSON}=await import('/inverse/core/graph.js');
      return cases.map(c=>{
        const result=finish(loadSolutionJSON(c.geometry),c.settings,()=>{},{refine:false,deadline:0});
        return{id:c.id,passed:result.report.templateChecksPassed,downloadAllowed:result.report.templateExportAllowed,paper:result.report.manufacturing,svg:result.files['manufacturability_right.svg'],left:!!result.files['template_left.svg'],right:!!result.files['template_right.svg']};
      });
    },{cases:['hjcur-05','cold-baseline'].map(id=>fixture.cases.find(c=>c.id===id))});
    for(const row of result){assert.equal(row.downloadAllowed,true);assert.ok(row.left&&row.right);}
    if(blocked){
      assert.ok(result.every(r=>!r.passed&&r.paper.offset.status==='uncertain'&&r.paper.offset.unavailable));
    }else{
      assert.equal(result[0].passed,false);assert.equal(result[0].paper.offset.status,'fail');
      assert.equal(result[1].passed,true);assert.equal(result[1].paper.offset.status,'pass');
      assert.match(result[0].svg,/data-paper-model="polygon-offset"/);
      await page.setContent('<main style="display:flex;background:#eee">'+result.map(r=>r.svg).join('')+'</main>');
      await page.screenshot({path:output+'/paper-cores.png',fullPage:true});
    }
    assert.deepEqual(errors,[]);rows.push({blocked,errors,results:result.map(({svg,...r})=>r)});
    await context.close();
  }
  // Post immediately while the engine's WASM is deliberately still loading.
  // The worker must install its receiver before that asynchronous gap.
  const context=await browser.newContext(),page=await context.newPage();let delayedLoads=0;
  await context.route('**/*',async r=>{
    if(new URL(r.request().url()).origin!==new URL(origin).origin)return r.abort();
    if(r.request().url().endsWith('/clipper2z.wasm')){delayedLoads++;await new Promise(resolve=>setTimeout(resolve,500));}
    return r.continue();
  });
  await page.goto(origin+'/en/editor/paint/');
  const startup=await page.evaluate(()=>new Promise(resolve=>{
    const worker=new Worker('/inverse/compute-worker.js',{type:'module'});
    const timer=setTimeout(()=>{worker.terminate();resolve({timeout:true});},10000);
    worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();resolve(data);};
    worker.onerror=e=>{clearTimeout(timer);worker.terminate();resolve({workerError:e.message});};
    // Invalid target is intentional: a handled request must return an error,
    // rather than silently losing the message during engine initialization.
    worker.postMessage({id:913,target:null,settings:{}});
  }));
  await fs.writeFile(output+'/startup.json',JSON.stringify({delayedLoads,startup},null,2)+'\n');
  assert.equal(delayedLoads,1);assert.equal(startup.id,913,JSON.stringify(startup));assert.equal(startup.type,'error');
  rows.push({workerStartup:{delayedLoads,...startup}});await context.close();
}finally{await browser.close();}
await fs.writeFile(output+'/results.json',JSON.stringify({rows},null,2)+'\n');
console.log('Browser polygon backend: detected defect, valid control, downloads and load-failure checks passed.');
