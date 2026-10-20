import {prepare,inspectSaved} from './core/engine.js';
import {settings as normalizeSettings} from './core/settings.js';
import {finishStopped} from './core/stopped.js';
import {zipFiles} from './core/zip.js';
import {refineHeartCrop} from './core/crop.js';

/** One prepared artwork and one public request at a time. The private fitting
 * worker can be terminated without discarding the artwork or the result queue.
 * Candidate packets stay here; only throttled progress pictures reach the UI.
 */
export function workerController(scope,{createWorker=()=>new Worker(new URL('./compute-worker.js',import.meta.url),{type:'module'}),finalize=finishStopped,
 detectCrops=(input,options)=>import('./neural/photo-crop.js').then(module=>module.detectPhotoCrops(input,options))}={}){
  let prepared=null,result=null,compute=null,active=null;
  const dispose=()=>{if(compute){compute.onmessage=null;compute.onerror=null;compute.onmessageerror=null;compute.terminate();compute=null;}};
  const failure=(id,error)=>scope.postMessage({id,type:'error',message:error.message||String(error),code:error.code,report:error.report||null});
  const finish=(job,value,error)=>{
    if(active!==job)return;
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
        compute??=createWorker();
        await new Promise(resolve=>{
          const job={id,cfg,startedAt:performance.now(),candidates:new Map(),phase:'searching',done:resolve};active=job;
          compute.onmessage=({data:message})=>{
            if(active!==job||job.phase!=='searching'||message.id!==id)return;
            if(message.type==='candidate'){
              const packet=message.candidate;
              if(typeof packet?.geometry==='string'&&!job.candidates.has(packet.geometry))job.candidates.set(packet.geometry,packet);
            }else if(message.type==='progress')progress(message.event);
            else if(message.type==='result')finish(job,message.result);
            else if(message.type==='error')finish(job,null,Object.assign(new Error(message.message),{code:message.code,report:message.report}));
            else{dispose();finish(job,null,new Error('Unexpected fitting worker response.'));}
          };
          compute.onerror=event=>{event.preventDefault?.();dispose();finish(job,null,Object.assign(new Error(event.message||'The fitting worker could not load.'),{code:'ENGINE_UNAVAILABLE'}));};
          compute.onmessageerror=()=>{dispose();finish(job,null,Object.assign(new Error('The fitting response could not be read.'),{code:'ENGINE_UNAVAILABLE'}));};
          try{compute.postMessage({id,target:prepared,settings});}catch(error){dispose();finish(job,null,error);}
        });
      }else if(action==='saved'){
        prepared=null;result=inspectSaved(input.text,settings,progress);scope.postMessage({id,type:'result',result});
      }else throw new Error('Unknown worker action.');
    }catch(error){failure(id,error);}
  };
}
