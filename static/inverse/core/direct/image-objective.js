/** Per-pixel importance for fitting: zero ignores colour, one protects it.
 * Normalize by observed weight, so a free border cannot dilute motif error.
 * These helpers do not change the target mask or any geometry constraints.
 */
import {resize} from './math.js';

export function imageWeights(weights,length){
  if(weights==null)return null;
  if(weights.length!==length)throw new Error('Image weights must match the target resolution.');
  let mass=0,allOne=true;
  for(const w of weights){
    if(!Number.isFinite(w)||w<0||w>1+1e-12)throw new Error('Image weights must be finite values between zero and one.');
    mass+=w;if(w!==1)allOne=false;
  }
  if(!(mass>0))throw new Error('At least one image pixel must have positive weight.');
  return allOne?null:{values:weights,mass};
}

/** Resample weight and weighted colour together. Averaging colour separately
 * lets an ignored border contaminate a protected pixel at a coarser scale.
 */
export function resizeObjective(prob,n,m,weights=null){
  if(prob.length!==n*n)throw new Error('Image probabilities must match the target resolution.');
  const info=imageWeights(weights,prob.length);
  if(!info)return{probability:resize(prob,n,m),weights:null};
  const resizedWeights=resize(weights,n,m),weighted=resize(Float64Array.from(prob,(p,i)=>p*weights[i]),n,m);
  const probability=Float64Array.from(weighted,(v,i)=>resizedWeights[i]>0?v/resizedWeights[i]:0);
  return{probability,weights:resizedWeights};
}

/** A binary rendered pixel z has weighted squared error
 * w (z-p)^2 = w p^2 + z w (1-2p).
 * Encode the signed boundary cost in a field the existing JS/WASM integrator
 * can interpolate. It may exceed [0,1]: this is a force field, not a new mask.
 * The constant offset makes the scalar value the same normalized objective.
 */
export function boundaryObjective(prob,weights=null){
  const info=imageWeights(weights,prob.length);
  if(!info)return{target:prob,offset:0};
  const scale=prob.length/info.mass,target=new Float64Array(prob.length);let offset=0;
  for(let i=0;i<prob.length;i++){
    const p=prob[i],w=weights[i];target[i]=(1-scale*w*(1-2*p))/2;
    offset+=w*p*p/info.mass-target[i]*target[i]/prob.length;
  }
  return{target,offset};
}
