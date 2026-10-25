import {prepare,inspectSaved,EXACT_SECONDS} from './core/engine.js';
import {settings as normalizeSettings} from './core/settings.js';
import {finishStopped} from './core/stopped.js';
import {zipFiles} from './core/zip.js';
import {refineHeartCrop} from './core/crop.js';

/** Seconds past its minute before a side-by-side exact search is ended. */
const EXACT_GRACE_SECONDS=5;

/** One prepared artwork and one public request at a time. The private fitting
 * worker can be terminated without discarding the artwork or the result queue.
 * Candidate packets stay here; only throttled progress pictures reach the UI.
 */
export function workerController(scope,{createWorker=()=>new Worker(new URL('./compute-worker.js',import.meta.url),{type:'module'}),finalize=finishStopped,
 detectCrops=(input,options)=>import('./neural/photo-crop.js').then(module=>module.detectPhotoCrops(input,options))}={}){
  let prepared=null,result=null,compute=null,exactCompute=null,active=null;
  const end=worker=>{if(worker){worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();}};
  const disposeFitter=()=>{end(compute);compute=null;},disposeExact=()=>{end(exactCompute);exactCompute=null;};
  const dispose=()=>{disposeFitter();disposeExact();};
  const failure=(id,error)=>scope.postMessage({id,type:'error',message:error.message||String(error),code:error.code,report:error.report||null});
  const finish=(job,value,error)=>{
    if(active!==job)return;
    clearTimeout(job.timer);
    active=null;result=value??null;
    if(error)failure(job.id,error);else scope.postMessage({id:job.id,type:'result',result});
    job.done();
  };
  return async({data})=>{
    const {id,action,input,settings}=data;
    const progress=event=>scope.postMessage({id,type:'progress',event});
    if(action==='cancel'){
      if(active&&active.id!==id)return;
      const job=active;active=null;dispose();prepared=null;result=null;job?.done();
      scope.postMessage({id,type:'cancelled'});scope.close?.();return;
    }
    if(action==='stop'){
      const job=active;if(!job||job.id!==id||job.phase!=='searching')return;
      job.phase='finishing';dispose();
      try{
        const value=await finalize(prepared,job.cfg,[...job.candidates.values()],progress,{cancelled:()=>active!==job,startedAt:job.startedAt});
        finish(job,value);
      }catch(error){finish(job,null,error);}
      return;
    }
    if(active){failure(id,new Error('The engine is already working.'));return;}
    try{
      if(action==='archive'){
        if(!result)throw new Error('Generate or check templates first.');
        const archive=zipFiles(result.files);scope.postMessage({id,type:'archive',archive},[archive.buffer]);return;
      }
      if(action==='warm-neural'){
        // The paper model, fetched while the visitor still chooses a picture;
        // the crop search waits for the same load and reports its bytes. Not a
        // job: the answer is immediate, and nothing else is held up.
        import('./neural/runtime.js').then(module=>module.predictPaperBody.warm(),()=>{});
        scope.postMessage({id,type:'result',result:null});return;
      }
      result=null;
      if(action==='detect-crops'||action==='refine-crop'){
        prepared=null;
        const job={id,phase:'detecting',done:()=>{}};active=job;
        try{
          const crops=action==='detect-crops'?await detectCrops(input,{onProgress:event=>{if(active===job)progress(event);},cancelled:()=>active!==job}):refineHeartCrop(input,input.quad);
          if(active!==job)return;
          active=null;scope.postMessage({id,type:'crops',crops});
        }catch(error){if(active!==job)return;active=null;throw error;}
      }else if(action==='prepare'){
        prepared=null;
        const value=prepare(input,settings,progress);prepared=value.target;
        scope.postMessage({id,type:'prepared',preview:value.preview});
      }else if(action==='solve'){
        if(!prepared)throw new Error('Prepare and inspect the artwork first.');
        const cfg=normalizeSettings(settings);
        // A picture with `exactParallel` (Mal): the exact search and the fitter
        // in two workers side by side, each with its own time. The exact
        // search's template is taken when it comes, and the fitter's only once
        // the exact search has none, or has overrun its minute (its worker is
        // then ended). The fitter's progress is shown from then on.
        const both=settings.exactParallel===true&&cfg.exactOutline;
        compute??=createWorker();
        if(both)exactCompute??=createWorker();
        await new Promise(resolve=>{
          const job={id,cfg,startedAt:performance.now(),candidates:new Map(),phase:'searching',done:resolve,exact:both?'running':'none',held:null,timer:null};active=job;
          const live=()=>active===job&&job.phase==='searching';
          const fail=(message,code)=>Object.assign(new Error(message),{code});
          // The fitter's answer, once the exact search has given up.
          const settle=()=>{if(job.held)finish(job,job.held.result,job.held.error);};
          const exactDone=()=>{job.exact='failed';disposeExact();settle();};
          compute.onmessage=({data:message})=>{
            if(!live()||message.id!==id)return;
            if(message.type==='candidate'){
              const packet=message.candidate;
              if(typeof packet?.geometry==='string'&&!job.candidates.has(packet.geometry))job.candidates.set(packet.geometry,packet);
              return;
            }
            if(message.type==='progress'){if(job.exact!=='running')progress(message.event);return;}
            let held;
            if(message.type==='result')held={result:message.result};
            else if(message.type==='error')held={error:Object.assign(new Error(message.message),{code:message.code,report:message.report})};
            else{disposeFitter();held={error:new Error('Unexpected fitting worker response.')};}
            if(job.exact==='running')job.held=held;else finish(job,held.result,held.error);
          };
          compute.onerror=event=>{event.preventDefault?.();disposeFitter();const error=fail(event.message||'The fitting worker could not load.','ENGINE_UNAVAILABLE');if(job.exact==='running')job.held={error};else finish(job,null,error);};
          compute.onmessageerror=()=>{disposeFitter();const error=fail('The fitting response could not be read.','ENGINE_UNAVAILABLE');if(job.exact==='running')job.held={error};else finish(job,null,error);};
          if(both){
            exactCompute.onmessage=({data:message})=>{
              if(!live()||job.exact!=='running'||message.id!==id)return;
              if(message.type==='progress')progress(message.event);
              else if(message.type==='result'){job.exact='done';disposeFitter();finish(job,message.result);}
              else exactDone();
            };
            exactCompute.onerror=event=>{event.preventDefault?.();if(live()&&job.exact==='running')exactDone();};
            exactCompute.onmessageerror=()=>{if(live()&&job.exact==='running')exactDone();};
            // HiGHS can overrun its time limit at its root: the minute is kept here.
            job.timer=setTimeout(()=>{if(live()&&job.exact==='running')exactDone();},1000*(Math.min(cfg.timeLimit,EXACT_SECONDS)+EXACT_GRACE_SECONDS));
          }
          try{
            compute.postMessage({id,target:prepared,settings:both?{...settings,exactRoute:'fitter'}:settings});
            if(both)exactCompute.postMessage({id,target:prepared,settings:{...settings,exactRoute:'exact'}});
          }catch(error){dispose();finish(job,null,error);}
        });
      }else if(action==='saved'){
        prepared=null;result=inspectSaved(input.text,settings,progress);scope.postMessage({id,type:'result',result});
      }else throw new Error('Unknown worker action.');
    }catch(error){failure(id,error);}
  };
}
