import {prepare,inspectSaved,EXACT_SECONDS} from './core/engine.js';
import {settings as normalizeSettings} from './core/settings.js';
import {finishStopped,finishExactStopped} from './core/stopped.js';
import {zipFiles} from './core/zip.js';
import {refineHeartCrop} from './core/crop.js';

/** Seconds past its minute before a side-by-side exact search is ended; and
 * from the start, once the fitter's answer waits for it: on the juleflet
 * pictures every exact template came within 40 s, while photographs it fails
 * on waited out the whole minute. Until the exact search has drawn a template
 * keeping every rule, a passing answer of the fitter's waits only until
 * EXACT_UNDRAWN_SECONDS, then goes out (the exact search's to follow as an
 * alternative): a search that finds none draws none, and of 52 exact templates
 * on the juleflet pictures 45 had drawn by 30 s (42 by 20). */
const EXACT_GRACE_SECONDS=5,EXACT_WAIT_SECONDS=40,EXACT_UNDRAWN_SECONDS=30;

/** One prepared artwork and one public request at a time. The private fitting
 * worker can be terminated without discarding the artwork or the result queue.
 * Candidate packets stay here; only throttled progress pictures reach the UI.
 */
export function workerController(scope,{createWorker=()=>new Worker(new URL('./compute-worker.js',import.meta.url),{type:'module'}),finalize=finishStopped,finalizeExact=finishExactStopped,now=()=>performance.now(),
 detectCrops=(input,options)=>import('./neural/photo-crop.js').then(module=>module.detectPhotoCrops(input,options))}={}){
  // `trailing`: a side-by-side worker still running after the other's template
  // went out, its passing answer to follow as an alternative: the fitter's, or
  // the exact search's ({exact: true}, with the timer ending it).
  let prepared=null,result=null,compute=null,exactCompute=null,active=null,trailing=null;
  const end=worker=>{if(worker){worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();}};
  const disposeFitter=()=>{end(compute);compute=null;},disposeExact=()=>{end(exactCompute);exactCompute=null;};
  const dispose=()=>{disposeFitter();disposeExact();};
  const passes=value=>value?.report?.templateChecksPassed===true;
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
    // Any new request ends a worker still working on an alternative.
    if(trailing&&action!=='archive'&&action!=='warm-neural'){const ending=trailing;trailing=null;clearTimeout(ending.timer);if(ending.exact)disposeExact();else disposeFitter();}
    if(action==='cancel'){
      if(active&&active.id!==id)return;
      const job=active;active=null;dispose();prepared=null;result=null;job?.done();
      scope.postMessage({id,type:'cancelled'});scope.close?.();return;
    }
    if(action==='stop'){
      const job=active;if(!job||job.id!==id||job.phase!=='searching')return;
      job.phase='finishing';dispose();
      try{
        // What the live view shows: the exact search's drawing once it has one,
        // else the fitter's answer when it is in, else its best checkpoint.
        const exact=job.drawing?finalizeExact(prepared,job.cfg,job.drawing,progress,{startedAt:job.startedAt}):null;
        const value=exact??job.held?.result??await finalize(prepared,job.cfg,[...job.candidates.values()],progress,{cancelled:()=>active!==job,startedAt:job.startedAt});
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
        // then ended). The live view shows the fitter's progress until the exact
        // search draws a template keeping every rule, then the exact search's,
        // and the fitter's again if it gives up.
        const both=settings.exactParallel===true&&cfg.exactOutline;
        compute??=createWorker();
        if(both)exactCompute??=createWorker();
        await new Promise(resolve=>{
          const job={id,cfg,startedAt:now(),candidates:new Map(),phase:'searching',done:resolve,exact:both?'running':'none',drawn:false,drawing:null,held:null,timer:null};active=job;
          const live=()=>active===job&&job.phase==='searching';
          const fail=(message,code)=>Object.assign(new Error(message),{code});
          // The fitter's answer, once the exact search has given up.
          const settle=()=>{if(job.held)finish(job,job.held.result,job.held.error);};
          const exactDone=()=>{job.exact='failed';job.drawing=null;disposeExact();settle();};
          // With the fitter's answer held: the exact search's waited for until
          // EXACT_WAIT_SECONDS once it has drawn, else until EXACT_UNDRAWN_SECONDS
          // when the fitter's passes, which then goes out (trail).
          const wait=()=>{
            clearTimeout(job.timer);
            const early=!job.drawn&&passes(job.held?.result);
            job.timer=setTimeout(()=>{if(live()&&job.exact==='running'){if(early)trail();else exactDone();}},Math.max(0,job.startedAt+1000*(early?EXACT_UNDRAWN_SECONDS:EXACT_WAIT_SECONDS)-now()));
          };
          const trail=()=>{
            job.exact='trailing';
            const timer=setTimeout(()=>{if(trailing?.id===id&&trailing.exact){trailing=null;disposeExact();scope.postMessage({id,type:'alternative',pending:false});}},
              Math.max(0,job.startedAt+1000*(Math.min(cfg.timeLimit,EXACT_SECONDS)+EXACT_GRACE_SECONDS)-now()));
            finish(job,job.held.result);
            trailing={id,exact:true,timer};
            scope.postMessage({id,type:'alternative',pending:true});
          };
          compute.onmessage=({data:message})=>{
            if(message.id!==id)return;
            if(trailing?.id===id&&!trailing.exact){
              if(message.type!=='result'&&message.type!=='error')return;
              trailing=null;
              scope.postMessage(message.type==='result'&&passes(message.result)?{id,type:'alternative',result:message.result}:{id,type:'alternative',pending:false});
              return;
            }
            if(!live())return;
            if(message.type==='candidate'){
              const packet=message.candidate;
              if(typeof packet?.geometry==='string'&&!job.candidates.has(packet.geometry))job.candidates.set(packet.geometry,packet);
              return;
            }
            if(message.type==='progress'){if(job.exact!=='running'||!job.drawn)progress(message.event);return;}
            let held;
            if(message.type==='result')held={result:message.result};
            else if(message.type==='error')held={error:Object.assign(new Error(message.message),{code:message.code,report:message.report})};
            else{disposeFitter();held={error:new Error('Unexpected fitting worker response.')};}
            if(job.exact!=='running'){finish(job,held.result,held.error);return;}
            // The fitter's answer waits for the exact search's: the live view
            // says it is still running.
            job.held=held;
            if(!job.drawn)progress({stage:'exactOutline'});
            wait();
          };
          compute.onerror=event=>{event.preventDefault?.();disposeFitter();if(trailing?.id===id&&!trailing.exact){trailing=null;scope.postMessage({id,type:'alternative',pending:false});return;}const error=fail(event.message||'The fitting worker could not load.','ENGINE_UNAVAILABLE');if(job.exact==='running')job.held={error};else finish(job,null,error);};
          compute.onmessageerror=()=>{disposeFitter();const error=fail('The fitting response could not be read.','ENGINE_UNAVAILABLE');if(job.exact==='running')job.held={error};else finish(job,null,error);};
          if(both){
            // The exact search's answer after the fitter's went out: an alternative.
            const trailed=answer=>{clearTimeout(trailing.timer);trailing=null;scope.postMessage(answer&&passes(answer)?{id,type:'alternative',result:answer}:{id,type:'alternative',pending:false});};
            exactCompute.onmessage=({data:message})=>{
              if(message.id!==id)return;
              if(trailing?.id===id&&trailing.exact){if(message.type==='result')trailed(message.result);else if(message.type==='error')trailed(null);return;}
              if(!live()||job.exact!=='running')return;
              if(message.type==='progress'){
                const geometry=message.event?.geometry;
                if(typeof geometry==='string'?geometry.trim():geometry&&typeof geometry==='object'){
                  // A first drawing while the fitter's answer waits: the longer wait.
                  const first=!job.drawn;
                  job.drawn=true;if(typeof geometry==='string')job.drawing=geometry;
                  if(first&&job.held)wait();
                }
                if(job.drawn)progress(message.event);
              }else if(message.type==='result'){
                // The fitter's template as a second choice: at once when it is in,
                // else when it comes (or not, should another request come first).
                job.exact='done';
                const held=job.held;
                finish(job,message.result);
                if(held?.result&&passes(held.result))scope.postMessage({id,type:'alternative',result:held.result});
                else if(!held){trailing={id};scope.postMessage({id,type:'alternative',pending:true});}
              }
              else exactDone();
            };
            exactCompute.onerror=event=>{event.preventDefault?.();if(trailing?.id===id&&trailing.exact){disposeExact();trailed(null);return;}if(live()&&job.exact==='running')exactDone();};
            exactCompute.onmessageerror=()=>{if(trailing?.id===id&&trailing.exact){disposeExact();trailed(null);return;}if(live()&&job.exact==='running')exactDone();};
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
