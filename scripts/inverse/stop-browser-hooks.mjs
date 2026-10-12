/** Diagnostic delays live only in the QA HTTP proxy, never in shipped code.
 * A busy compute worker must not prevent its controller from handling Stop.
 * Candidates are produced by the real fitter from freshly imported artwork.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export async function stopIntervention(mode,origin){
  assert.ok(['keep','keep-finer','empty','cancel-finishing'].includes(mode));
  const files=new Map(),hashes={};
  const replace=async(file,from,to)=>{
    const source=await fs.readFile('static'+file,'utf8');
    const response=await fetch(origin+file);
    assert.equal(response.status,200);
    assert.equal(await response.text(),source,`Rebuild and restart the preview before testing ${file}`);
    assert.equal(source.split(from).length,2,`Expected one intervention location in ${file}`);
    const modified=source.replace(from,to);
    files.set(file,Buffer.from(modified));
    hashes[file]={original:createHash('sha256').update(source).digest('hex'),served:createHash('sha256').update(modified).digest('hex')};
  };
  const blocked=`self.postMessage({id,type:'progress',event:{stage:'qaComputeBlocked'}});const until=performance.now()+30000;while(performance.now()<until){/* deliberately busy private worker */}`;
  const condition=mode==='keep-finer'?'candidate.materialResolution===700&&candidate.error!==null&&candidate.error<=.03':'candidate.error!==null&&candidate.error<=.006';
  if(mode==='empty')await replace('/inverse/compute-worker.js','    const result=await design',`    ${blocked}\n    const result=await design`);
  else await replace('/inverse/compute-worker.js',
    "{onCandidate:candidate=>self.postMessage({id,type:'candidate',candidate})}",
    `{onCandidate:candidate=>{self.postMessage({id,type:'candidate',candidate});if(${condition}){${blocked}}}}`);
  if(mode==='cancel-finishing')await replace('/inverse/core/stopped.js',
    '  alive();if(!packets.length)',
    "  onProgress({stage:'qaFinishingCheckpoint'});await new Promise(resolve=>setTimeout(resolve,2000));\n  alive();if(!packets.length)");
  return{files,hashes,method:'HTTP source override: block the actual compute worker for 30 s before fitting (empty), or immediately after a real validated checkpoint with error <= 0.6% (keep), or finer paper resolution 700 and original-image error <= 3% (keep-finer). Cancel-finishing additionally yields for 2 s in finalization. No geometry, counts or seed is supplied.'};
}

/** Serialized by Playwright; no module dependencies in the body. */
export function installStopObservation(){
  const qa=window.__stopQA={blocked:null,finishing:null,stopSent:null,stopId:null,resultId:null,results:0,errors:0,cancelled:0};
  const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker{
    constructor(...args){
      super(...args);
      this.addEventListener('message',({data})=>{
        if(data.type==='progress'&&data.event.stage==='qaComputeBlocked')qa.blocked=performance.now();
        if(data.type==='progress'&&data.event.stage==='qaFinishingCheckpoint')qa.finishing=performance.now();
        if(data.type==='result'){qa.resultId=data.id;qa.results++;}
        if(data.type==='error')qa.errors++;
        if(data.type==='cancelled')qa.cancelled++;
      });
    }
    postMessage(data,...rest){
      if(data.action==='stop'){qa.stopSent=performance.now();qa.stopId=data.id;}
      return super.postMessage(data,...rest);
    }
  };
}

export async function exerciseStop(page,mode,{disarm,dir}){
  const button=name=>page.getByRole('button',{name,exact:true}).first();
  await page.waitForFunction(()=>window.__stopQA.blocked!==null,null,{timeout:90000});
  await page.screenshot({path:path.join(dir,'before-stop.png'),fullPage:true});
  await button('Use the best one now').click();
  if(mode==='keep'||mode==='keep-finer')return;
  if(mode==='empty'){
    await page.waitForFunction(()=>window.__paintQA.error!==null);
    const error=await page.evaluate(()=>window.__paintQA.error);
    assert.equal(error.report.status,'no_validated_solution');
    assert.equal(error.report.termination,'user_stop');
    assert.equal(await button('Open in Draw').count(),0);
    assert.ok(await page.getByRole('alert').count()>0,'An empty stop explains that no result was found.');
  }else{
    await page.waitForFunction(()=>window.__stopQA.finishing!==null);
    assert.equal(await button('Finishing the best result …').isDisabled(),true);
    assert.equal(await button('Cancel').isEnabled(),true);
    await page.screenshot({path:path.join(dir,'finishing.png'),fullPage:true});
    await button('Cancel').click();
    await button('Find the cuts').waitFor();
    await page.waitForTimeout(2500);
    const qa=await page.evaluate(()=>window.__stopQA);
    assert.equal(qa.results,0,'Cancelled finalization must not publish a late result.');
    assert.equal(qa.errors,0,'Cancellation must not surface as a solver failure.');
    assert.equal(qa.cancelled,1,'The controller must acknowledge shutting down computation.');
  }
  await fs.writeFile(path.join(dir,'stopped-attempt.json'),JSON.stringify(await page.evaluate(()=>({stop:window.__stopQA,error:window.__paintQA.error})),null,2));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  // The retry uses unmodified production code and passes the entire ordinary
  // import/solve/conversion/export checks in the caller.
  disarm();
  await button(mode==='empty'?'Try again':'Find the cuts').click();
}
