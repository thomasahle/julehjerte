/** Raster shape measurements for search and QA, not a geometry certificate.
 * Matching source pixels alone cannot distinguish a small opening from an
 * enlarged region or a channel to the background. Measure its whole component.
 */
import {connectedComponent} from './input.js';
import {imageFeatures,auditImageFeatures,auditFeatureChange} from './image-features.js';
import {sourceWeights} from './image-reference.js';

export function smallInteriorFeatures(source,features,cfg){
  if(!source)return [];
  const n=source.resolution,scale=cfg.width/n,weights=sourceWeights(source);
  return features.filter(f=>f.areaMm2<=4*cfg.nominalWidth**2&&f.pixels.every(pixel=>{
    const x=pixel%n+.5,y=Math.floor(pixel/n)+.5;
    return Math.min(x,y,n-x,n-y)*scale>cfg.nominalWidth&&
      (!weights||[pixel,pixel-1,pixel+1,pixel-n,pixel+n].every(i=>weights[i]>0));
  }));
}

/** Pixel retention is useful while proposing a routing, but cannot certify an
 * opening that has become a channel to the background. Keep that extra final
 * check separate from coarse seed acceptance. This is a raster enclosure
 * check for small, substantial interior regions, not an exact topology proof.
 */
export function auditFeatureFidelity(source,woven,cfg,features=imageFeatures(source,cfg.width)){
  const retention=auditImageFeatures(source,woven,cfg.width,features);
  const selected=smallInteriorFeatures(source,features,cfg);
  if(!selected.length)return retention;
  const components=featureComponentMetrics(source,woven,cfg.width,selected);
  const opened=new Set(selected.filter((_,i)=>components[i].touchesBorder===true));
  const regions=retention.regions.map((r,i)=>opened.has(features[i])?{...r,enclosureLost:true}:r);
  const missing=regions.filter(r=>r.retainedFraction<retention.minimumRetention||r.enclosureLost);
  return{...retention,passed:!missing.length,regions,missing,enclosures:{components,opened:opened.size},
    method:retention.method+' Small interior regions must also remain separate from the square boundary.'};
}

/** Cleanup may improve an imperfect candidate, but cannot open a region that
 * its incoming checkpoint kept enclosed. Existing colour-retention rules and
 * their treatment of already missing regions remain unchanged.
 */
export function auditFeatureFidelityChange(source,before,after,cfg,features=imageFeatures(source,cfg.width)){
  const retention=auditFeatureChange(source,before,after,cfg.width,features);
  const selected=smallInteriorFeatures(source,features,cfg);
  if(!selected.length)return retention;
  const a=featureComponentMetrics(source,before,cfg.width,selected),b=featureComponentMetrics(source,after,cfg.width,selected);
  const opened=b.filter((part,i)=>a[i].touchesBorder===false&&part.touchesBorder===true);
  return opened.length?{...retention,passed:false,enclosuresOpened:opened}:retention;
}

export function featureComponentMetrics(source,woven,width=100,features=imageFeatures(source,width)){
  if(!features.length)return [];
  const n=source.resolution,parts=[null],labels=new Int32Array(woven.length);
  return features.map(feature=>{
    const intersections=new Map();
    // Usually the protected opening occupies a few hundred cells. Flood only
    // components touched by its source pixels; the large surrounding regions
    // cannot affect its measurements unless the opening actually joins them.
    for(const pixel of feature.pixels){
      if(woven[pixel]!==feature.value)continue;
      let id=labels[pixel];
      if(!id){id=parts.length;parts.push(connectedComponent(woven,n,pixel,labels,id));}
      intersections.set(id,(intersections.get(id)||0)+1);
    }
    const best=[...intersections].sort((a,b)=>b[1]-a[1])[0],part=best&&parts[best[0]],intersection=best?.[1]||0;
    return{centerMm:feature.centerMm,sourceAreaMm2:feature.areaMm2,intersectionPixels:intersection,retention:intersection/feature.pixels.length,predictedComponentAreaMm2:(part?.pixels.length||0)*(width/n)**2,touchesBorder:part?.border??null,componentIoU:intersection/(feature.pixels.length+(part?.pixels.length||0)-intersection)};
  });
}
