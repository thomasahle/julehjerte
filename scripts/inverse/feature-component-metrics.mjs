/** QA measurement only. Raster connectivity is not a geometric certificate. */
import {components} from '../../static/inverse/core/input.js';
import {imageFeatures} from '../../static/inverse/core/image-features.js';

export function featureComponentMetrics(source,woven,width=100){
  const n=source.resolution,features=imageFeatures(source,width);
  const byColour=[0,1].map(value=>{
    const parts=components(woven,n,value),labels=new Int32Array(woven.length).fill(-1);
    parts.forEach((part,i)=>{for(const pixel of part.pixels)labels[pixel]=i;});return{parts,labels};
  });
  return features.map(feature=>{
    const {parts,labels}=byColour[feature.value],intersections=new Map();
    for(const pixel of feature.pixels){const id=labels[pixel];if(id>=0)intersections.set(id,(intersections.get(id)||0)+1);}
    const best=[...intersections].sort((a,b)=>b[1]-a[1])[0],part=best&&parts[best[0]],intersection=best?.[1]||0;
    return{centerMm:feature.centerMm,sourceAreaMm2:feature.areaMm2,intersectionPixels:intersection,retention:intersection/feature.pixels.length,predictedComponentAreaMm2:(part?.pixels.length||0)*(width/n)**2,touchesBorder:part?.border??null,componentIoU:intersection/(feature.pixels.length+(part?.pixels.length||0)-intersection)};
  });
}
