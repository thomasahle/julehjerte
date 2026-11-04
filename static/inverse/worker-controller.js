import {prepare,inspectSaved,timeScale} from './core/engine.js';
import {settings as normalizeSettings} from './core/settings.js';
import {finishStopped,finishExactStopped} from './core/stopped.js';
import {zipFiles} from './core/zip.js';
import {refineHeartCrop} from './core/crop.js';
import {betterResult} from './core/result-rank.js';

/** Seconds past its minute before a side-by-side exact search is ended; and
 * from the start, once the fitter's answer waits for it: on the juleflet
 * pictures every exact template came within 40 s, while photographs it fails
 * on waited out the whole minute. Until the exact search has drawn a template
 * keeping every rule, a passing answer of the fitter's waits only until
 * EXACT_UNDRAWN_SECONDS, then goes out (the exact search's to follow as an
 * alternative): a search that finds none draws none. With the exact search's
 * start at most 3 s, as many exact templates came first by 20 s as by 30 on
 * the juleflet pictures (91) and the scraped photographs (14), which then
 * took 22 s at the median instead of 30. Both waits are for a fitted answer
 * that passes: one failing the export's checks leaves the exact search and the
 * network's ladder their whole search time. */
const EXACT_GRACE_SECONDS=5,EXACT_WAIT_SECONDS=40,EXACT_UNDRAWN_SECONDS=20;
/** The longest a search waits for the cut-proposal network's first load. */
const CUT_MODEL_WAIT_MS=1500;

/** One prepared artwork and one public request at a time. The private fitting
 * worker can be terminated without discarding the artwork or the result queue.
 * Candidate packets stay here; only throttled progress pictures reach the UI.
 */
export function workerController(scope,{createWorker=()=>new Worker(new URL('./compute-worker.js',import.meta.url),{type:'module'}),finalize=finishStopped,finalizeExact=finishExactStopped,now=()=>performance.now(),
 detectCrops=(input,options)=>import('./neural/photo-crop.js').then(module=>module.detectPhotoCrops(input,options)),
 createCropWorker=()=>new Worker(new URL('./crop-worker.js',import.meta.url),{type:'module'}),
 predictCutMaps=(source,options)=>import('./neural/cuts.js').then(module=>module.predictCutMaps(source,options))}={}){
  // `trailing`: a side-by-side worker still running after the other's template
  // went out, its passing answer to follow as an alternative: the fitter's, or
  // the exact search's ({exact: true}, with the timer ending it).
  let prepared=null,result=null,compute=null,exactCompute=null,ladderCompute=null,active=null,trailing=null;
  const end=worker=>{if(worker){worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();}};
  const disposeFitter=()=>{end(compute);compute=null;},disposeExact=()=>{end(exactCompute);exactCompute=null;},disposeLadder=()=>{end(ladderCompute);ladderCompute=null;};
  const dispose=()=>{disposeFitter();disposeExact();disposeLadder();};
  // The colour locator in a worker of its own (crop-worker.js): a photograph's
  // crop search runs it beside the paper model, its two longest steps, instead
  // of before it. One at a time: a new search, or a cancel, ends one still
  // running. Where the worker cannot start or fails, it runs here as before.
  let cropWorker=null,cropJob=null,cropIds=0;
  const endCrop=()=>{end(cropWorker);cropWorker=null;const job=cropJob;cropJob=null;job?.reject(new DOMException('Cancelled','AbortError'));};
  const here=(input,options)=>import('./core/crop.js').then(module=>module.detectHeartCrops(input,options));
  const colourCrop=(input,options={})=>{
    if(cropJob)endCrop();
    try{cropWorker??=createCropWorker();}catch{return here(input,options);}
    options.onProgress?.({stage:'detecting'});
    return new Promise((resolve,reject)=>{
      const job={id:++cropIds,reject},worker=cropWorker;cropJob=job;
      worker.onmessage=({data})=>{if(cropJob!==job||data.id!==job.id)return;cropJob=null;if(data.crops)resolve(data.crops);else reject(new Error(data.message));};
      worker.onerror=event=>{event?.preventDefault?.();if(cropJob!==job)return;cropJob=null;end(worker);if(cropWorker===worker)cropWorker=null;here(input,{roi:options.roi}).then(resolve,reject);};
      worker.postMessage({id:job.id,input,roi:options.roi});
    });
  };
  const passes=value=>value?.report?.templateChecksPassed===true;
  // An exact template that misses some check (engine.js design): held to compare, never taken as one.
  const nearMiss=value=>value?.report?.solver?.exactOutline?.nearMiss===true;
  // An exact template's hidden segments and its outline's lower bound.
  const searchOf=value=>value?.report?.solver?.exactOutline?.search,hiddenOf=value=>searchOf(value)?.attempts?.at(-1)?.hidden??searchOf(value)?.hidden;
  // A held ladder template stands against today's passing where today's fails, else with fewer hidden
  // segments, or as many and closer to the picture (a user's heart: 7 each, the ladder's 0.1% off,
  // today's 0.3% with a hairline through a motif).
  const errorOf=value=>value?.report?.imageError?.mismatchFraction??Infinity;
  const ladderStands=(ladder,today)=>{
    if(!ladder)return false;if(!today)return true;
    if(passes(ladder)!==passes(today))return passes(ladder);
    const mine=hiddenOf(ladder)??Infinity,theirs=hiddenOf(today)??Infinity;
    return mine<theirs||mine===theirs&&errorOf(ladder)<errorOf(today);
  };
  // A ladder template today's search cannot better: at its outline's lower
  // bound on the traced outline, without a fallback (made symmetric, untied,
  // part of the symmetry), the bound today's search would stop at too; or, on
  // any outline, with no more hidden segments than the traced outline's bound
  // (exactTemplate's tracedBound). On an outline with tips rounded koelbuer's
  // ladder has 16 at its bound 16, today's search 2 on the traced one; within
  // the traced bound were 16 of the 35 the 106 broad pictures held, none of
  // them beaten by today's.
  const settles=value=>{
    const hidden=hiddenOf(value),outline=value?.report?.solver?.exactOutline,bound=outline?.search?.bound;
    const traced=!outline?.outline&&!['even','unjoined','untied','subgroup'].some(way=>outline?.[way]);
    return Number.isFinite(hidden)&&((traced&&Number.isFinite(bound)&&hidden<=bound)||(Number.isFinite(outline?.tracedBound)&&hidden<=outline.tracedBound));
  };
  const failure=(id,error)=>scope.postMessage({id,type:'error',message:error.message||String(error),code:error.code,report:error.report||null});
  const finish=(job,value,error,keepLadder=false)=>{
    if(active!==job)return;
    clearTimeout(job.timer);if(!keepLadder)disposeLadder();
    active=null;result=value??null;
    if(error)failure(job.id,error);else scope.postMessage({id:job.id,type:'result',result});
    job.done();
  };
  return async({data})=>{
    const {id,action,input,settings}=data;
    const progress=event=>scope.postMessage({id,type:'progress',event});
    // Any new request ends a worker still working on an alternative.
    if(trailing&&action!=='archive'&&action!=='warm-neural'){const ending=trailing;trailing=null;clearTimeout(ending.timer);if(ending.exact){disposeExact();disposeLadder();}else disposeFitter();}
    if(action==='cancel'){
      if(active&&active.id!==id)return;
      const job=active;active=null;clearTimeout(job?.timer);dispose();endCrop();prepared=null;result=null;job?.done();
      scope.postMessage({id,type:'cancelled'});scope.close?.();return;
    }
    if(action==='stop'){
      const job=active;if(!job||job.id!==id||job.phase!=='searching')return;
      job.phase='finishing';dispose();
      try{
        // What the live view shows: the exact search's drawing once it has one,
        // else the fitter's answer when it is in, else its best checkpoint.
        // A ladder template held for today's search (below) comes first.
        const exact=!job.ladder&&job.drawing?finalizeExact(prepared,job.cfg,job.drawing,progress,{startedAt:job.startedAt}):null;
        const value=job.ladder??exact??betterResult(job.nearExact??null,job.held?.result??null)??await finalize(prepared,job.cfg,[...job.candidates.values()],progress,{cancelled:()=>active!==job,startedAt:job.startedAt});
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
        // And the colour locator's worker, whose modules then load meanwhile.
        if(!cropJob)try{cropWorker??=createCropWorker();}catch{}
        scope.postMessage({id,type:'result',result:null});return;
      }
      result=null;
      if(action==='detect-crops'||action==='refine-crop'){
        prepared=null;
        const job={id,phase:'detecting',done:()=>{}};active=job;
        try{
          const crops=action==='detect-crops'?await detectCrops(input,{onProgress:event=>{if(active===job)progress(event);},cancelled:()=>active!==job,productionCrop:colourCrop}):refineHeartCrop(input,input.quad);
          if(active!==job)return;
          active=null;scope.postMessage({id,type:'crops',crops});
        }catch(error){if(active!==job)return;active=null;throw error;}
      }else if(action==='prepare'){
        prepared=null;
        const value=prepare(input,settings,progress);prepared=value.target;
        // A painted picture (Mal) is solved next: the cut model loads meanwhile.
        if(input.type==='mask'&&settings.cutModel===true)import('./neural/cuts.js').then(module=>module.predictCutMaps.warm(),()=>{});
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
        // The cut-proposal network's maps for the exact search's ladder
        // (neural/cuts.js; Mal asks for it with `cutModel`), when its model is
        // in within CUT_MODEL_WAIT_MS: a search never waits longer for it, and
        // without it runs as before.
        let cutMaps=null;
        if(cfg.exactOutline&&settings.cutModel===true&&prepared.sourceImage?.mask){
          try{cutMaps=await predictCutMaps(prepared.sourceImage,{wait:CUT_MODEL_WAIT_MS});}catch{cutMaps=null;}
        }
        // Side by side, the network's ladder runs in a third worker beside
        // today's exact search, which keeps its whole time: the first exact
        // template stands, so the ladder costs no time where it finds none.
        // The exact search alone (Avanceret) runs the ladder before it.
        const race=both&&cutMaps!==null,exactSettings=cutMaps&&!race?{...settings,cutMaps}:settings;
        compute??=createWorker();
        if(both)exactCompute??=createWorker();
        if(race)ladderCompute??=createWorker();
        await new Promise(resolve=>{
          const job={id,cfg,startedAt:now(),candidates:new Map(),phase:'searching',done:resolve,exact:both?'running':'none',drawn:false,drawing:null,held:null,timer:null};active=job;
          const live=()=>active===job&&job.phase==='searching';
          const fail=(message,code)=>Object.assign(new Error(message),{code});
          // The fitter's answer, once the exact search has given up.
          // The race settled: the fitter's answer, or the exact search's best
          // template that misses some check (job.nearExact) when that is better
          // (result-rank.js): never nothing while there is a template.
          const finishBest=held=>{const best=betterResult(job.nearExact??null,held?.result??null);if(best)finish(job,best);else finish(job,null,held?.error);};
          // A ladder still searching while the fitter's answer fails the export's
          // checks is waited for (within the search time): today's search giving up
          // ends nothing then.
          const ladderPending=()=>race&&ladderCompute!==null&&!passes(job.held?.result);
          // With today's search given up and the fitter's answer passing, a ladder still searching goes on
          // for the alternative (trail), as after a fitted answer that went out first.
          const settle=()=>{
            if(!job.held||ladderPending())return;
            if(job.exact==='failed'&&race&&ladderCompute&&passes(job.held.result)){trail(job.nearExact??null);return;}
            finishBest(job.held);
          };
          const exactDone=()=>{if(job.ladder){disposeExact();takeExact(job.ladder);return;}job.exact='failed';job.drawing=null;disposeExact();settle();};
          // The search time is up: today's search ended, and a ladder still waited for.
          const timeUp=()=>{if(!live())return;if(job.exact==='running')exactDone();if(live()&&job.exact==='failed'&&ladderCompute){disposeLadder();settle();}};
          // An exact template: the fitter's answer follows as an alternative.
          const takeExact=value=>{
            job.exact='done';
            const held=job.held;
            finish(job,value);
            if(held?.result&&passes(held.result))scope.postMessage({id,type:'alternative',result:held.result});
            else if(!held){trailing={id};scope.postMessage({id,type:'alternative',pending:true});}
          };
          // With the fitter's answer held: the exact search's waited for until
          // EXACT_WAIT_SECONDS once it has drawn, else until EXACT_UNDRAWN_SECONDS
          // when the fitter's passes, which then goes out (trail).
          // A fitted answer failing the export's checks shortens nothing: the exact
          // search and the ladder keep the whole search time (a star in a circle on
          // a loaded machine: the ladder's template at 45 s, after the 40 s that
          // ended the race on the fitter's failing answer).
          const wait=()=>{
            clearTimeout(job.timer);
            if(!passes(job.held?.result)){job.timer=setTimeout(timeUp,Math.max(0,job.startedAt+1000*(cfg.timeLimit+EXACT_GRACE_SECONDS)-now()));return;}
            const early=!job.drawn;
            job.timer=setTimeout(()=>{if(live()&&job.exact==='running'){if(early)trail();else exactDone();}},Math.max(0,job.startedAt+1000*timeScale(cfg.timeLimit)*(early?EXACT_UNDRAWN_SECONDS:EXACT_WAIT_SECONDS)-now()));
          };
          // The network's ladder goes on with today's search after the fitter's
          // answer (gathering-hanging-trio-top: the ladder's template at 43 s,
          // none from today's), its template the alternative as in the race.
          // `today`: today's answer when it is already in (null when it found none).
          const trail=today=>{
            job.exact='trailing';
            const timer=setTimeout(()=>{if(trailing?.id===id&&trailing.exact){const ladder=trailing.ladder;trailing=null;disposeExact();disposeLadder();scope.postMessage(ladder&&passes(ladder)?{id,type:'alternative',result:ladder}:{id,type:'alternative',pending:false});}},
              Math.max(0,job.startedAt+1000*(cfg.timeLimit+EXACT_GRACE_SECONDS)-now()));
            finish(job,job.held.result,undefined,true);
            trailing={id,exact:true,timer,ladder:null,...(today!==undefined?{today}:{})};
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
            if(message.type==='progress'){
              // The exact search alone in this worker (Avanceret): its drawing is what Stop finishes.
              if(settings.exactRoute==='exact'&&typeof message.event?.geometry==='string'&&message.event.geometry.trim())job.drawing=message.event.geometry;
              if(job.exact!=='running'||!job.drawn)progress(message.event);return;
            }
            let held;
            if(message.type==='result')held={result:message.result};
            else if(message.type==='error')held={error:Object.assign(new Error(message.message),{code:message.code,report:message.report})};
            else{disposeFitter();held={error:new Error('Unexpected fitting worker response.')};}
            if(job.exact!=='running'){job.held=held;if(job.exact==='failed'&&ladderPending())progress({stage:'exactOutline'});settle();return;}
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
            // A held ladder template stands with fewer hidden segments, or as many and closer, or when today's has none.
            const trailed=answer=>{
              clearTimeout(trailing.timer);const ladder=trailing.ladder;trailing=null;disposeLadder();
              const best=ladderStands(ladder,answer)?ladder:answer;
              scope.postMessage(best&&passes(best)?{id,type:'alternative',result:best}:{id,type:'alternative',pending:false});
            };
            exactCompute.onmessage=({data:message})=>{
              if(message.id!==id)return;
              if(trailing?.id===id&&trailing.exact){
                if(message.type!=='result'&&message.type!=='error')return;
                const answer=message.type==='result'?message.result:null;
                // Today's answer failing the export's checks waits for a ladder still searching.
                if(!passes(answer)&&ladderCompute&&!trailing.ladder){trailing.today=answer;disposeExact();return;}
                trailed(answer);return;
              }
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
                // An exact template missing some check does not end the race: it is
                // held, and the better of it and the fitter's answer stands.
                if(nearMiss(message.result)){job.nearExact=betterResult(job.nearExact??null,message.result);exactDone();return;}
                // The fitter's template as a second choice: at once when it is in,
                // else when it comes (or not, should another request come first).
                // A held ladder template stands with fewer hidden segments, or as many and closer.
                const ladder=job.ladder;
                takeExact(ladderStands(ladder,message.result)?ladder:message.result);
              }
              else exactDone();
            };
            exactCompute.onerror=event=>{event.preventDefault?.();if(trailing?.id===id&&trailing.exact){disposeExact();trailed(null);return;}if(live()&&job.exact==='running')exactDone();};
            exactCompute.onmessageerror=()=>{if(trailing?.id===id&&trailing.exact){disposeExact();trailed(null);return;}if(live()&&job.exact==='running')exactDone();};
            if(race){
              ladderCompute.onmessage=({data:message})=>{
                if(message.id!==id||message.type==='progress'||message.type==='candidate')return;
                // After the fitter's answer went out: the alternative, as in the race.
                // After the fitter's passing answer went out, a near miss is no alternative.
                if(trailing?.id===id&&trailing.exact){
                  disposeLadder();const waiting=trailing.today!==undefined;
                  if(message.type!=='result'||nearMiss(message.result)){if(waiting)trailed(trailing.today);return;}
                  if(waiting){trailing.ladder=message.result;trailed(trailing.today);return;}
                  if(settles(message.result)){disposeExact();trailed(message.result);}else trailing.ladder=message.result;return;
                }
                // Today's search may have given up (job.exact 'failed') while the ladder went on.
                if(!live()||!['running','failed'].includes(job.exact)){disposeLadder();return;}
                disposeLadder();
                if(message.type!=='result'){if(job.exact==='failed')settle();return;}
                // The ladder's nearest template (it found none the export takes): held
                // beside today's near miss, the better of them against the fitter's.
                if(nearMiss(message.result)){job.nearExact=betterResult(job.nearExact??null,message.result);if(job.exact==='failed')settle();return;}
                if(job.exact==='failed'){takeExact(message.result);return;}
                // A ladder template today's search cannot better (settles) first:
                // today's exact search is ended, and the fitter's answer follows as
                // an alternative. Any other is held while today's search goes on,
                // whose template stands unless it has more (lilje1: the ladder's 8
                // in 4 s, today's 7 in 43 s).
                if(settles(message.result)){disposeExact();takeExact(message.result);return;}
                job.ladder=message.result;
                // A template in hand, which the live view shows: a fitted answer
                // waits for today's search as for one that has drawn.
                const geometry=message.result?.files?.['cut_geometry.json'];
                if(typeof geometry==='string'&&geometry.trim())progress({stage:'exactOutline',geometry});
                const first=!job.drawn;job.drawn=true;
                if(first&&job.held)wait();
              };
              const ladderLost=()=>{disposeLadder();if(trailing?.id===id&&trailing.exact&&trailing.today!==undefined)trailed(trailing.today);else if(live()&&job.exact==='failed')settle();};
              ladderCompute.onerror=event=>{event.preventDefault?.();ladderLost();};
              ladderCompute.onmessageerror=ladderLost;
            }
            // HiGHS can overrun its time limit at its root: the minute is kept here.
            job.timer=setTimeout(timeUp,1000*(cfg.timeLimit+EXACT_GRACE_SECONDS));
          }
          try{
            compute.postMessage({id,target:prepared,settings:both?{...settings,exactRoute:'fitter'}:exactSettings});
            if(both)exactCompute.postMessage({id,target:prepared,settings:{...exactSettings,exactRoute:'exact'}});
            if(race)ladderCompute.postMessage({id,target:prepared,settings:{...settings,cutMaps,exactRoute:'exact',ladderOnly:true}});
          }catch(error){dispose();finish(job,null,error);}
        });
      }else if(action==='saved'){
        prepared=null;result=inspectSaved(input.text,settings,progress);scope.postMessage({id,type:'result',result});
      }else throw new Error('Unknown worker action.');
    }catch(error){failure(id,error);}
  };
}
