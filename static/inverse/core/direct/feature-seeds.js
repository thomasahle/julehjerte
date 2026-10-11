/** Additional layouts for substantial regions missed by a refined grid.
 * Importance changes initialization only. Keep the original image objective
 * for ranking and refinement, and retain all ordinary search candidates.
 */
import {initializeCounts} from './counts.js';
import {resizeObjective} from './image-objective.js';
import {gridMask,mismatch} from './grid.js';
import {auditImageFeatures} from '../image-features.js';

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
  const search=initializeCounts({options,fullProb,resolution,prob:weighted.probability,n,evidence,weights:weighted.weights,fullWeights});
  const attempts=[];
  for(const seed of search.seeds){
    const woven=gridMask(seed.model,resolution,seed.phase,seed.floor),audit=auditImageFeatures(source,woven,cfg.width,features);
    seed.error=mismatch(gridMask(seed.model,n,seed.phase,seed.floor),original.probability);
    seed.featuresPassed=audit.passed;seed.seed='feature-weighted-grid';
    attempts.push({counts:seed.model.counts,phase:seed.phase,error:seed.error,featuresPassed:audit.passed,missing:audit.missing.length});
  }
  const seeds=search.seeds.filter(s=>s.featuresPassed&&s.error<=Math.min(.1,3*cfg.maxImageError)).sort((a,b)=>a.error-b.error);
  return{seeds,report:{...report,hypotheses:options.length,attempts,retained:seeds.length}};
}
