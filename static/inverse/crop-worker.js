/** The colour locator (core/crop.js) in a worker of its own, so the photograph's
 * paper model runs beside it rather than after it (worker-controller.js). */
// Install the receiver before the locator's modules load.
const crop=import('./core/crop.js');

self.onmessage=async({data})=>{
  const {id,input,roi}=data;
  try{
    const {detectHeartCrops}=await crop;
    self.postMessage({id,crops:detectHeartCrops(input,{roi})});
  }catch(error){self.postMessage({id,message:error.message||String(error)});}
};
