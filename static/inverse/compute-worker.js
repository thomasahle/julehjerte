/** CPU-bound fitting is isolated so its controller can always read Stop. */
// Install the receiver before async engine/WASM initialization can yield.
const engine=import('./core/engine.js');

self.onmessage=async({data})=>{
  const {id,target,settings}=data;
  try{
    const {design,restorePrepared}=await engine;
    const result=await design(restorePrepared(target),settings,
      event=>self.postMessage({id,type:'progress',event}),
      {onCandidate:candidate=>self.postMessage({id,type:'candidate',candidate})});
    self.postMessage({id,type:'result',result});
  }catch(error){self.postMessage({id,type:'error',message:error.message||String(error),code:error.code,report:error.report||null});}
};
