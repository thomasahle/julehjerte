/** Additional layouts for substantial regions missed by a refined grid.
 * Rank and validate against the original image. Ordinary candidates remain
 * available when a feature-preserving proposal fails its physical checks.
 */
import {initializeCounts} from './counts.js';
import {resizeObjective} from './image-objective.js';
import {sourceWeights} from '../image-reference.js';
import {observedFeatureImportance} from './feature-objective.js';
import {fitGrid,gridMask,mismatch} from './grid.js';
import {auditImageFeatures} from '../image-features.js';
import {featureComponentMetrics} from '../feature-shapes.js';
import {smallInteriorFeatures} from './feature-details.js';

export function interiorFeatureIndices(source,features,missed,cfg){
  const resolution=source.resolution;
  return missed.filter(index=>features[index].pixels.some(pixel=>{
    const x=pixel%resolution+.5,y=Math.floor(pixel/resolution)+.5;
    return Math.min(x,y,resolution-x,resolution-y)*cfg.width/resolution>=cfg.nominalWidth;
  }));
}

export function initializeFeatureSeeds({source,features,missed,counts,cfg,evidence,maximumCount}){
  // Do not create new routings solely to reproduce isolated crop-edge flecks.
  // They still count in the unchanged final image/feature checks. At least part
  // of an emphasized region must reach beyond the nominal paper side margin.
  const resolution=source.resolution,boundaryBandMm=cfg.nominalWidth;
  const interior=interiorFeatureIndices(source,features,missed,cfg);
  const report={boost:16,baseCounts:counts,missedRegions:missed.length,emphasizedRegions:interior.length,skippedBorderRegions:missed.length-interior.length,boundaryBandMm};
  if(!interior.length)return{seeds:[],report:{...report,hypotheses:0,attempts:[],retained:0}};
  const options=[];
  for(const family of [0,1])for(const extra of [0,1,2])for(const phase of [1,-1]){
    const pair=counts.slice();pair[family]+=extra;
    if(pair.some(c=>c>maximumCount||(c+1)*(cfg.nominalWidth+.35)>=cfg.width))continue;
    if(!options.some(o=>o.phase===phase&&o.counts.every((c,i)=>c===pair[i])))options.push({counts:pair,phase});
  }
  const boost=16,n=Math.min(256,resolution),fullProb=source.probability||Float32Array.from(source.mask),emphasis=new Float64Array(resolution*resolution).fill(1/boost);
  for(const index of interior)for(const pixel of features[index].pixels)emphasis[pixel]=1;
  const fullWeights=observedFeatureImportance(source,emphasis);
  const weighted=resizeObjective(fullProb,resolution,n,fullWeights),original=resizeObjective(fullProb,resolution,n,sourceWeights(source));
  const attempts=[],small=smallInteriorFeatures(source,interior.map(i=>features[i]),cfg),coarseNearMisses=[],alternativeChoices=[];
  const closedFeatures=seed=>featureComponentMetrics(source,gridMask(seed.model,resolution,seed.phase,seed.floor),cfg.width,small).every(part=>part.intersectionPixels>0&&part.touchesBorder===false);
  const search=(options,protectFeatures=false,k=16)=>initializeCounts({options,fullProb,resolution,prob:weighted.probability,n,evidence,weights:weighted.weights,fullWeights},{k,retainAlternatives:!protectFeatures&&k===16}).seeds.map(({alternatives=[],...seed})=>{
      // Retry shapes at the base counts only. A different-count runner-up
      // can keep coarse colours yet lose the opening during free refinement,
      // displacing an established joint/finer route (the small puppy case).
      if(seed.model.counts.every((count,f)=>count===counts[f]))alternativeChoices.push(...alternatives);
      const woven=gridMask(seed.model,resolution,seed.phase,seed.floor),audit=auditImageFeatures(source,woven,cfg.width,features);
      seed.error=mismatch(gridMask(seed.model,n,seed.phase,seed.floor),original.probability,original.weights);
      seed.featuresPassed=audit.passed;seed.seed=protectFeatures?'feature-preserving-grid':'feature-weighted-grid';
      if(protectFeatures)seed.protectFeatures=true;
      attempts.push({counts:seed.model.counts,controlPoints:k,phase:seed.phase,error:seed.error,featuresPassed:audit.passed,missing:audit.missing.length,protectFeatures});
      if(!protectFeatures&&k===16&&audit.passed&&seed.error>Math.min(.1,3*cfg.maxImageError)&&seed.error<=Math.min(.12,4*cfg.maxImageError))coarseNearMisses.push(seed);
      return seed;
    }).filter(s=>s.featuresPassed&&s.error<=(protectFeatures?Math.min(.12,4*cfg.maxImageError):Math.min(.1,3*cfg.maxImageError))).sort((a,b)=>a.error-b.error);
  const refineNearMiss=seed=>{
    const retainsColours=r=>auditImageFeatures(source,gridMask(r.model,resolution,r.phase,r.floor),cfg.width,features).passed;
    const refined=fitGrid(original.probability,n,seed.model.counts,seed.phase,{k:seed.model.k,initial:seed.model.z,floor:seed.floor,
      weights:original.weights,optimizationTarget:original.weights?null:resizeObjective(fullProb,resolution,96).probability,optimizationObjective:original.weights?resizeObjective(fullProb,resolution,96,sourceWeights(source)):null,steps:150,preferCheckpoint:retainsColours});
    const error=mismatch(gridMask(refined.model,n,refined.phase,refined.floor),original.probability,original.weights),featuresPassed=retainsColours(refined);
    const accepted=featuresPassed&&error<=Math.min(.1,3*cfg.maxImageError);
    return{seed:{...refined,error,featuresPassed,seed:'feature-weighted-grid'},report:{counts:seed.model.counts,phase:seed.phase,initialError:seed.error,error,featuresPassed,steps:refined.steps,accepted}};
  };
  let seeds=search(options),jointHypotheses=0,coarseRefinement=null,alternativeRefinement=null;
  if(!seeds.length&&coarseNearMisses.length){
    // A small crop change can put a useful colour-retaining layout just above
    // the coarse error cutoff. Give the closest near miss the ordinary fine
    // grid pass before changing both cut counts. It still has to meet the
    // ORIGINAL cutoff afterwards; this never accepts a cutting template.
    const seed=coarseNearMisses.sort((a,b)=>a.error-b.error)[0];
    const refined=refineNearMiss(seed);coarseRefinement=refined.report;
    if(coarseRefinement.accepted)seeds=[refined.seed];
  }
  if(!seeds.length){
    // Each count/phase already tried uniform, border and separable starts.
    // Its lowest weighted error can lose a feature while a runner-up keeps
    // it. Reuse one base-count layout after the established winners fail.
    // Neither the original error cutoff nor the final feature gate changes.
    const alternatives=alternativeChoices.map(seed=>({...seed,error:mismatch(gridMask(seed.model,n,seed.phase,seed.floor),original.probability,original.weights)}))
      .filter(seed=>seed.error<=Math.min(.12,4*cfg.maxImageError)&&auditImageFeatures(source,gridMask(seed.model,resolution,seed.phase,seed.floor),cfg.width,features).passed)
      .sort((a,b)=>a.error-b.error);
    if(alternatives.length){
      const seed=alternatives[0],refined=refineNearMiss(seed);
      alternativeRefinement={...refined.report,considered:alternativeChoices.length,retained:alternatives.length};
      if(alternativeRefinement.accepted)seeds=[refined.seed];
    }
  }
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
  return{seeds,report:{...report,hypotheses:options.length+jointHypotheses+finerHypotheses,jointHypotheses,finerHypotheses,coarseRefinement,alternativeRefinement,attempts,retained:seeds.length}};
}

/** Preserve every existing region during the extra routing's clearance and
 * curve stages, including regions the ordinary fit already explained. This
 * is a search objective only; it never replaces the original image scores.
 */
export function featureRefinementObjective(source,features,n){
  const weights=new Float64Array(source.mask.length).fill(1/16);
  for(const feature of features)for(const pixel of feature.pixels)weights[pixel]=1;
  return resizeObjective(source.probability||Float32Array.from(source.mask),source.resolution,n,observedFeatureImportance(source,weights));
}

/** A different DP lattice is a fallback starting shape, never a new target or
 * a replacement for a checked fit. Keep the original cut counts and image gate.
 */
export function initializeFeatureSampling({source,features,missed,counts,cfg,evidence}){
  const interior=interiorFeatureIndices(source,features,missed,cfg),initializationResolution=98;
  const report={counts,initializationResolution,emphasizedRegions:interior.length,attempts:[],retained:0};
  if(!interior.length)return{seeds:[],report};
  const resolution=source.resolution,n=Math.min(256,resolution),fullProb=source.probability||Float32Array.from(source.mask);
  const emphasis=new Float64Array(resolution*resolution).fill(1/16);
  for(const index of interior)for(const pixel of features[index].pixels)emphasis[pixel]=1;
  const fullWeights=observedFeatureImportance(source,emphasis);
  const weighted=resizeObjective(fullProb,resolution,n,fullWeights),original=resizeObjective(fullProb,resolution,n,sourceWeights(source));
  const options=[1,-1].map(phase=>({counts,phase}));
  const search=initializeCounts({options,fullProb,resolution,prob:weighted.probability,n,evidence,weights:weighted.weights,fullWeights},{initializationResolution});
  const seeds=search.seeds.map(seed=>{
    const error=mismatch(gridMask(seed.model,n,seed.phase,seed.floor),original.probability,original.weights);
    const featuresPassed=auditImageFeatures(source,gridMask(seed.model,resolution,seed.phase,seed.floor),cfg.width,features).passed;
    report.attempts.push({phase:seed.phase,error,featuresPassed});
    return{...seed,error,featuresPassed,seed:'feature-sampling-grid'};
  }).filter(seed=>seed.featuresPassed&&seed.error<=Math.min(.1,3*cfg.maxImageError)).sort((a,b)=>a.error-b.error);
  report.retained=seeds.length;
  return{seeds,report};
}
