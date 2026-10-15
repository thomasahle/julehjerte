/** Protect visible interior details that a whole-image average can hide.
 * This is a region-retention check, not a certificate of identical topology.
 */
import {components} from './input.js';
import {distanceTransform} from './material.js';
import {sourceWeights} from './image-reference.js';

// Exclude a one-cell fringe on the classified (rectified) mask. This is not
// one source-photograph pixel: enlarging a crop changes its physical extent.
// Photo-resolution sensitivity is recorded in the border-fragment study.
// These pixels still enter the full image error.
const BORDER_CLEARANCE_PIXELS=1;

// Source masks and returned feature arrays belong to callers. Check every
// source byte before reuse and copy nested arrays so edits cannot poison a
// later audit. Weak keys retain only one analysis per live source object.
const featureCache=new WeakMap();
const copyFeatures=features=>features.map(f=>({...f,pixels:f.pixels.slice(),centerMm:f.centerMm.slice()}));
export function imageFeatures(source,width=100){
  const mask=source?.mask,n=source?.resolution;
  const cacheable=mask instanceof Uint8Array&&Number.isInteger(n)&&n>0&&mask.length===n*n
    &&typeof width==='number'&&Number.isFinite(width)&&width>0&&!source.weights&&!source.validMask
    &&(typeof SharedArrayBuffer==='undefined'||!(mask.buffer instanceof SharedArrayBuffer));
  if(!cacheable)return computeImageFeatures(source,width);
  const previous=featureCache.get(source);
  if(previous&&previous.n===n&&Object.is(previous.width,width)&&previous.mask.length===mask.length&&mask.every((v,i)=>v===previous.mask[i]))return copyFeatures(previous.features);
  const features=computeImageFeatures(source,width);
  featureCache.set(source,{n,width,mask:mask.slice(),features:copyFeatures(features)});
  return features;
}

function computeImageFeatures(source,width){
  if(!source)return [];
  const {mask,resolution:n,validMask}=source,features=[],weights=source.weights?sourceWeights(source):null;
  const observed=weights?Uint8Array.from(mask,(v,i)=>weights[i]>0?v:2):mask;
  const mass=weights?weights.reduce((sum,w)=>sum+w,0):n*n,active=weights?weights.reduce((sum,w)=>sum+Number(w>0),0):n*n;
  const minimumPixels=Math.max(4,.0003*active),minimumRadius=Math.max(1.5,.005*n);
  for(const value of[0,1]){
    const distance=distanceTransform(Uint8Array.from(observed,(v,i)=>Number(v!==value||(validMask&&!validMask[i]))),n,n);
    for(const part of components(observed,n,value)){
      if(part.border||part.pixels.length<minimumPixels||part.pixels.some(i=>validMask&&!validMask[i]))continue;
      if(part.pixels.some(i=>Math.min(i%n,n-1-i%n,Math.floor(i/n),n-1-Math.floor(i/n))<=BORDER_CLEARANCE_PIXELS))continue;
      const weightMass=weights?part.pixels.reduce((sum,i)=>sum+weights[i],0):part.pixels.length;
      if(weightMass*active/mass<minimumPixels)continue;
      let radius2=0,x=0,y=0;
      for(const i of part.pixels){radius2=Math.max(radius2,distance[i]);x+=i%n+.5;y+=Math.floor(i/n)+.5;}
      if(radius2<minimumRadius*minimumRadius)continue;
      features.push({value,pixels:part.pixels,areaMm2:part.pixels.length*(width/n)**2,centerMm:[x,y].map(v=>v/part.pixels.length*width/n),...(weights?{weightMass}:{} )});
    }
  }
  return features;
}

export function auditImageFeatures(source,woven,width=100,features=imageFeatures(source,width)){
  const minimumRetention=.6,weights=source?.weights?sourceWeights(source):null;
  const regions=features.map(({pixels,...f})=>({...f,retainedFraction:pixels.reduce((sum,i)=>sum+(weights?weights[i]:1)*Number(woven[i]===f.value),0)/(f.weightMass??pixels.length)}));
  const missing=regions.filter(r=>r.retainedFraction<minimumRetention);
  return{passed:missing.length===0,referenceAvailable:!!source,minimumRetention,minimumAreaFraction:.0003,minimumCoreRadiusFraction:.005,borderClearancePixels:BORDER_CLEARANCE_PIXELS,regions,missing,
    method:weights?'Both colours in the observed region; free pixels split components and do not enter their area or retention. At least 60% of each substantial weighted region with a solid core must remain its original colour. Regions touching the square border or its one-pixel neighbourhood are excluded.':'Both colours; four-connected interior source regions with a solid core. At least 60% of each region must remain its original colour. Regions touching the border or its one-pixel neighbourhood, and tiny or thin classification fragments, are excluded. All observed pixels still enter the image-error measurement.'};
}

/** An imperfect fit may still earn a useful cleanup. Preserve the existing
 * 60% floor for retained features, and do not further erode any missing one.
 * This compares a proposal with its checkpoint; it does not certify the final
 * design, which must still pass auditImageFeatures against the source.
 */
export function auditFeatureChange(source,before,after,width=100,features=imageFeatures(source,width)){
  const baseline=auditImageFeatures(source,before,width,features),proposal=auditImageFeatures(source,after,width,features);
  const regressed=proposal.regions.flatMap((region,i)=>{
    const retainedBefore=baseline.regions[i].retainedFraction,requiredRetention=Math.min(baseline.minimumRetention,retainedBefore);
    return region.retainedFraction<requiredRetention?[{...region,retainedBefore,requiredRetention}]:[];
  });
  return{passed:regressed.length===0,missingBefore:baseline.missing.length,missingAfter:proposal.missing.length,regressed};
}
