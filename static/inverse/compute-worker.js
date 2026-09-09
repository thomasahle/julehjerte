/** CPU-bound fitting is isolated so its controller can always read Stop. */
import {design,restorePrepared} from './core/engine.js';

self.onmessage=async({data})=>{
  const {id,target,settings}=data;
  try{
    const result=await design(restorePrepared(target),settings,
      event=>self.postMessage({id,type:'progress',event}),
      {onCandidate:candidate=>self.postMessage({id,type:'candidate',candidate})});
    self.postMessage({id,type:'result',result});
  }catch(error){self.postMessage({id,type:'error',message:error.message||String(error),code:error.code,report:error.report||null});}
};
