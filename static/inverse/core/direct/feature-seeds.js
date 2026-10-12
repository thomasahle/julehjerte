/** Additional layouts for substantial regions missed by a refined grid.
 * Rank and validate against the original image. Ordinary candidates remain
 * available when a feature-preserving proposal fails its physical checks.
 */
import {initializeCounts} from './counts.js';
import {resizeObjective} from './image-objective.js';
import {gridMask,mismatch} from './grid.js';
import {auditImageFeatures} from '../image-features.js';
import {featureComponentMetrics} from '../feature-shapes.js';
import {smallInteriorFeatures} from './feature-details.js';

export function initializeFeatureSeeds({source,features,missed,counts,cfg,evidence,maximumCount}){
  // Do not create new routings solely to reproduce isolated crop-edge flecks.
  // They still count in the unchanged final image/feature checks. At least part
  // of an emphasized region must reach beyond the nominal paper side margin.
  const resolution=source.resolution,boundaryBandMm=cfg.nominalWidth;
  const interior=missed.filter(index=>features[index].pixels.some(pixel=>{
    const x=pixel%resolution+.5,y=Math.floor(pixel/resolution)+.5;
    return Math.min(x,y,resolution-x,resolution-y)*cfg.width/resolution>=boundaryBandMm;
  }));
  const report={boost:16,baseCounts:counts,missedRegions:missed.length,emphasizedRegions:interior.length,skippedBorderRegions:missed.length-interior.length,boundaryBandMm};
  if(!interior.length)return{seeds:[],report:{...report,hypotheses:0,attempts:[],retained:0}};
  const options=[];
  for(const family of [0,1])for(const extra of [0,1,2])for(const phase of [1,-1]){
    const pair=counts.slice();pair[family]+=extra;
    if(pair.some(c=>c>maximumCount||(c+1)*(cfg.nominalWidth+.35)>=cfg.width))continue;
    if(!options.some(o=>o.phase===phase&&o.counts.every((c,i)=>c===pair[i])))options.push({counts:pair,phase});
  }
  const boost=16,n=Math.min(256,resolution),fullProb=source.probability||Float32Array.from(source.mask),fullWeights=new Float64Array(resolution*resolution).fill(1/boost);
  for(const index of interior)for(const pixel of features[index].pixels)fullWeights[pixel]=1;
  const weighted=resizeObjective(fullProb,resolution,n,fullWeights),original=resizeObjective(fullProb,resolution,n);
  const attempts=[],small=smallInteriorFeatures(source,interior.map(i=>features[i]),cfg);
  const closedFeatures=seed=>featureComponentMetrics(source,gridMask(seed.model,resolution,seed.phase,seed.floor),cfg.width,small).every(part=>part.intersectionPixels>0&&part.touchesBorder===false);
  const search=(options,protectFeatures=false,k=16)=>initializeCounts({options,fullProb,resolution,prob:weighted.probability,n,evidence,weights:weighted.weights,fullWeights},{k}).seeds.map(seed=>{
      const woven=gridMask(seed.model,resolution,seed.phase,seed.floor),audit=auditImageFeatures(source,woven,cfg.width,features);
      seed.error=mismatch(gridMask(seed.model,n,seed.phase,seed.floor),original.probability);
      seed.featuresPassed=audit.passed;seed.seed=protectFeatures?'feature-preserving-grid':'feature-weighted-grid';
      if(protectFeatures)seed.protectFeatures=true;
      attempts.push({counts:seed.model.counts,controlPoints:k,phase:seed.phase,error:seed.error,featuresPassed:audit.passed,missing:audit.missing.length,protectFeatures});
      return seed;
    }).filter(s=>s.featuresPassed&&s.error<=(protectFeatures?Math.min(.12,4*cfg.maxImageError):Math.min(.1,3*cfg.maxImageError))).sort((a,b)=>a.error-b.error);
  let seeds=search(options),jointHypotheses=0;
  if(!seeds.length){
    // An isolated opening can require an additional cut in both sheets.
    // Changing only one count cannot propose that routing. Try just this
    // adjacent pair, in both phases, after the existing starts have failed.
    const pair=counts.map(c=>c+1);
    if(pair.every(c=>c<=maximumCount&&(c+1)*(cfg.nominalWidth+.35)<cfg.width)){
      const joint=[1,-1].map(phase=>({counts:pair,phase}));jointHypotheses=joint.length;
      seeds=search(joint,true);
    }
  }
  let finerHypotheses=0;
  // A small source opening can be visible to the row DP yet unrepresentable
  // by its coarse spline projection. Retry the same count range with more
  // curve freedom only after both existing searches fail to retain it.
  // Replacing a usable coarse routing with a denser one can introduce tight
  // returns, even when it reduces image error. Keep the established routing.
  if(small.length&&!seeds.length){
    finerHypotheses=options.length;
    const finer=search(options,false,32).filter(closedFeatures);
    seeds=[...finer,...seeds];
  }
  return{seeds,report:{...report,hypotheses:options.length+jointHypotheses+finerHypotheses,jointHypotheses,finerHypotheses,attempts,retained:seeds.length}};
}

/** Preserve every existing region during the extra routing's clearance and
 * curve stages, including regions the ordinary fit already explained. This
 * is a search objective only; it never replaces the original image scores.
 */
export function featureRefinementObjective(source,features,n){
  const weights=new Float64Array(source.mask.length).fill(1/16);
  for(const feature of features)for(const pixel of feature.pixels)weights[pixel]=1;
  return resizeObjective(source.probability||Float32Array.from(source.mask),source.resolution,n,weights);
}
