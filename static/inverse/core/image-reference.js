/** One observed-image objective for selection, matching and export checks.
 * Free pixels remain in the original mask and its whole-image comparison;
 * their permitted changes do not enter the normalized fitting error.
 */
import {imageWeights} from './direct/image-objective.js';

export function sourceWeights(source){
  const length=source.mask.length,info=imageWeights(source.weights,length);
  if(!source.validMask)return info?.values??null;
  if(source.validMask.length!==length)throw new Error('The observed region must match the image resolution.');
  const values=Float64Array.from({length},(_,i)=>source.validMask[i]?(info?info.values[i]:1):0);
  return imageWeights(values,length)?.values??null;
}

export function referenceError(source,woven){
  if(woven.length!==source.mask.length)throw new Error('The rendered image must match the reference resolution.');
  const info=imageWeights(source.weights,woven.length);
  let mismatchPixels=0,observedPixels=0,weightMass=0,mismatchWeight=0,protectedPixels=0,protectedErrors=0,editablePixels=0,editableErrors=0;
  for(let i=0;i<woven.length;i++){
    if(source.validMask&&!source.validMask[i])continue;
    const differs=Number(woven[i]!==source.mask[i]),w=info?info.values[i]:1;
    observedPixels++;mismatchPixels+=differs;weightMass+=w;mismatchWeight+=w*differs;
    if(w===1){protectedPixels++;protectedErrors+=differs;}else{editablePixels++;editableErrors+=differs;}
  }
  const mismatchFraction=weightMass?mismatchWeight/weightMass:Infinity;
  return{mismatchPixels,observedPixels,observedFraction:observedPixels/woven.length,mismatchFraction,
    ...(info?{weightMass,mismatchWeight,wholeMismatchFraction:mismatchPixels/Math.max(1,observedPixels),protectedPixels,
      protectedMismatchFraction:protectedPixels?protectedErrors/protectedPixels:null,editablePixels,
      editableChangeFraction:editablePixels?editableErrors/editablePixels:null}:{}),};
}

/** Snapshot the observed binary objective for one synchronous selection stage.
 * Repeated scores need neither weight validation nor unused reporting fields.
 * Ordinary referenceError calls continue to inspect the current source arrays.
 */
export function createMaskDisagreement(source){
  const length=source.mask.length,info=imageWeights(source.weights,length),indices=[],values=[],weights=[];let mass=0;
  for(let i=0;i<length;i++){
    if(source.validMask&&!source.validMask[i])continue;
    const weight=info?info.values[i]:1;if(!weight)continue;
    indices.push(i);values.push(source.mask[i]);weights.push(weight);mass+=weight;
  }
  return woven=>{
    if(woven.length!==length)throw new Error('The rendered image must match the reference resolution.');
    let mismatch=0;for(let j=0;j<indices.length;j++)if(woven[indices[j]]!==values[j])mismatch+=weights[j];
    return mass?mismatch/mass:Infinity;
  };
}

/** A deterministic, optional weave proposal outside observed artwork. It is
 * never a scored target. Ignored painted colours cannot change this seed.
 */
export function initializationMask(source,phase=0){
  if(phase!==0&&phase!==1)throw new Error('An initialization phase must be zero or one.');
  const weights=sourceWeights(source);if(!weights)return source.mask;
  const n=source.resolution,cells=source.seedCells??4,block=n/cells;
  const index=x=>{const s=(x+.5-n/2)/block;return Math.sign(s)*Math.floor(Math.abs(s)+.5);};
  return Uint8Array.from(source.mask,(v,i)=>weights[i]>0?v:(((index(i%n)+index(Math.floor(i/n)))&1)^phase));
}
