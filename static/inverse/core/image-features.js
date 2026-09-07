/** Protect visible interior details that a whole-image average can hide.
 * This is a region-retention check, not a certificate of identical topology.
 */
import {components} from './input.js';
import {distanceTransform} from './material.js';

export function imageFeatures(source,width=100){
  if(!source)return [];
  const {mask,resolution:n,validMask}=source,features=[];
  const minimumPixels=Math.max(4,.0003*n*n),minimumRadius=Math.max(1.5,.005*n);
  for(const value of[0,1]){
    const distance=distanceTransform(Uint8Array.from(mask,(v,i)=>Number(v!==value||(validMask&&!validMask[i]))),n,n);
    for(const part of components(mask,n,value)){
      if(part.border||part.pixels.length<minimumPixels||part.pixels.some(i=>validMask&&!validMask[i]))continue;
      let radius2=0,x=0,y=0;
      for(const i of part.pixels){radius2=Math.max(radius2,distance[i]);x+=i%n+.5;y+=Math.floor(i/n)+.5;}
      if(radius2<minimumRadius*minimumRadius)continue;
      features.push({value,pixels:part.pixels,areaMm2:part.pixels.length*(width/n)**2,centerMm:[x,y].map(v=>v/part.pixels.length*width/n)});
    }
  }
  return features;
}

export function auditImageFeatures(source,woven,width=100,features=imageFeatures(source,width)){
  const minimumRetention=.6;
  const regions=features.map(({pixels,...f})=>({...f,retainedFraction:pixels.reduce((sum,i)=>sum+Number(woven[i]===f.value),0)/pixels.length}));
  const missing=regions.filter(r=>r.retainedFraction<minimumRetention);
  return{passed:missing.length===0,referenceAvailable:!!source,minimumRetention,minimumAreaFraction:.0003,minimumCoreRadiusFraction:.005,regions,missing,
    method:'Both colours; four-connected interior source regions with a solid core. At least 60% of each region must remain its original colour. Border regions and tiny or thin classification fragments are excluded.'};
}
