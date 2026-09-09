/** Image work shared by the starting grids of one initialization search.
 * Own the input snapshot so a later edit cannot leave stale cached scales.
 * Nothing survives the search, and no geometry or candidate is cached here.
 */
import {imageWeights,resizeObjective} from './image-objective.js';
import {mismatch} from './grid.js';

export function initializationImage(prob,size,weights=null,{reuse=true}={}){
  const source=reuse?Float64Array.from(prob):prob,importance=reuse&&weights?Float64Array.from(weights):weights,scales=new Map();
  return resolution=>{
    if(reuse&&scales.has(resolution))return scales.get(resolution);
    const resized=resizeObjective(source,size,resolution,importance),n=resized.probability.length;
    const weightInfo=imageWeights(resized.weights,n),binary=reuse?Uint8Array.from(resized.probability,p=>Number(p>.5)):null;
    const score=mask=>{
      if(mask.length!==n)throw new Error('The initialized grid must match its scoring resolution.');
      if(!reuse)return mismatch(mask,resized.probability,resized.weights);
      let error=0;
      if(weightInfo){for(let i=0;i<n;i++)error+=resized.weights[i]*Number(mask[i]!==binary[i]);}
      else for(let i=0;i<n;i++)error+=Number(mask[i]!==binary[i]);
      return error/(weightInfo?.mass??n);
    };
    const value={...resized,score,weightScale:weightInfo?n/weightInfo.mass:1};
    if(reuse)scales.set(resolution,value);
    return value;
  };
}
