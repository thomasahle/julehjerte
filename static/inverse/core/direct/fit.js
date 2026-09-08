/** Fresh image-to-curve fitting with optional traced feature recovery.
 * Geometry and paper checks remain those used by the app's other solver.
 */
import {fitGrid,gridPaths,gridModel,gridMask,gridControls,mismatch} from './grid.js';
import {CurveGraph} from './curves.js';
import {refineCurves,fittingMargin} from './refine.js';
import {recoverShared} from './share.js';
import {sampleWeave,validate} from '../validate.js';
import {matchingGrid,matchingSummary,symmetryEvidence} from './matching.js';
import {materialAudit} from '../material.js';
import {resize} from './math.js';
import {initializeGrid,borderGrid,separableGrid} from './initialize.js';
import {auditImageFeatures,imageFeatures} from '../image-features.js';
import {recoverImageFeatures} from '../feature-recovery.js';
import {loadBoundaryKernel} from './native.js';
import {preferMatchingSolution} from './prefer-matching.js';

export function borderEvidence(prob,n){
  const rows=[];
  for(let side=0;side<4;side++)for(const fraction of[.015,.025,.04]){
    const depth=Math.max(1,Math.round(n*fraction)),band=Math.max(1,Math.round(n*.015)),profile=new Float64Array(n),smooth=new Float64Array(n);
    for(let t=0;t<n;t++){for(let k=depth;k<depth+band;k++){const x=side===0||side===2?t:side===1?n-1-k:k,y=side===1||side===3?t:side===0?k:n-1-k;profile[t]+=prob[y*n+x]/band;}}
    const radius=Math.max(1,Math.round(n*.006));for(let t=0;t<n;t++){let sum=0;for(let j=-radius;j<=radius;j++)sum+=profile[Math.max(0,Math.min(n-1,t+j))];smooth[t]=sum/(2*radius+1);}
    const transitions=[];for(let t=Math.ceil(n*.015)+1;t<n*.985;t++)if((smooth[t]>.5)!==(smooth[t-1]>.5))transitions.push(t/n);
    rows.push({side,inset:fraction,count:transitions.length,transitions});
  }return rows;
}
/** Repeated counts are useful evidence, even though a single pixel row is not
 * a reliable constraint. Require a majority on every opposing edge before
 * reserving one finalist. Other candidates remain free to disagree.
 */
export function supportedBorderCounts(evidence){
  const counts=[];
  for(const sides of[[0,2],[1,3]]){
    const perSide=sides.map(side=>{
      const rows=evidence.filter(r=>r.side===side),votes=new Map();
      for(const r of rows)votes.set(r.count,(votes.get(r.count)||0)+1);
      return[...votes].find(([,n])=>n>rows.length/2)?.[0];
    });
    if(!perSide[0]||perSide[0]!==perSide[1])return null;
    counts.push(perSide[0]);
  }
  return counts;
}
/** Expand the count search only when repeated inset measurements on opposing
 * edges both indicate a dense family. One noisy row never raises the ceiling.
 * Counts below the ceiling remain candidates; these are not endpoint rules.
 */
export function gridCountLimit(evidence){
  const repeated=side=>{
    const rows=evidence.filter(r=>r.side===side),votes=new Map();
    for(const row of rows)votes.set(row.count,(votes.get(row.count)||0)+1);
    return [...votes].find(([,n])=>n>rows.length/2)?.[0]??0;
  };
  let limit=8;
  for(const sides of [[0,2],[1,3]]){
    const counts=sides.map(repeated);
    if(counts.every(n=>n>8))limit=Math.max(limit,Math.max(...counts)+1);
  }
  return Math.min(16,limit);
}
export function gridFinalists(coarse,evidence,limit=3){
  const chosen=coarse.slice(0,limit),supported=supportedBorderCounts(evidence);
  if(supported&&!chosen.some(r=>r.model.counts.every((c,i)=>c===supported[i]))){
    const reserve=coarse.find(r=>r.model.counts.every((c,i)=>c===supported[i]));
    if(reserve)chosen[Math.min(limit-1,chosen.length)]=reserve;
  }
  return chosen;
}
function refloor(result,floor){
  const {model}=result,controls=gridControls(model,result.floor),z=model.z.slice();
  model.counts.forEach((count,f)=>{for(let j=0;j<model.k;j++){
    const gaps=[];let last=0;for(let i=0;i<=count;i++){const next=i===count?1:controls[f].c[j*count+i];gaps.push(Math.max(.0001,next-last-floor));last=next;}
    const sum=gaps.reduce((s,v)=>s+v,0);for(let i=0;i<=count;i++)z[model.offsets[f]+j*(count+1)+i]=Math.log(gaps[i]/sum);
  }});return z;
}
export async function fitDirect(input,cfg,onProgress=()=>{}){
  const start=performance.now();
  const solution=await fitIndependent(input,{...cfg,preferMatchingSheets:false},onProgress);
  const result=preferMatchingSolution(solution,cfg,{deadline:start+Math.min(cfg.timeLimit,10)*1000-400,onProgress});
  result.report.seconds=(performance.now()-start)/1000;
  return result;
}
async function fitIndependent(input,cfg,onProgress){
  const source=input.sourceImage,fullProb=source.probability||Float32Array.from(source.mask),n=Math.min(256,source.resolution),prob=resize(fullProb,source.resolution,n),gridTarget=resize(fullProb,source.resolution,96),start=performance.now(),fastSeconds=Math.min(cfg.timeLimit,10),maxDeadline=start+cfg.timeLimit*1000;
  let deadline=start+fastSeconds*1000-Math.min(1300,fastSeconds*200);
  const numericalBackend=await loadBoundaryKernel();
  const sourceFeatures=imageFeatures(source,cfg.width),matchingEvidence=symmetryEvidence(source),evidence=borderEvidence(fullProb,source.resolution),attempts=[],timings=[],options=[],seen=new Set();
  const maximumCount=gridCountLimit(evidence);
  const add=(counts,phase)=>{if(counts.some(c=>c<1||c>maximumCount||(c+1)*(cfg.nominalWidth+.35)>=cfg.width))return;const key=counts+':'+phase;if(!seen.has(key)){seen.add(key);options.push({counts,phase});}};
  for(let count=1;count<=maximumCount;count++)for(const phase of[1,-1])add([count,count],phase);
  const modes=sides=>{const counts=new Map();for(const r of evidence)if(sides.includes(r.side)&&r.count>=1&&r.count<=maximumCount)counts.set(r.count,(counts.get(r.count)||0)+1);return[...counts].sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]);};
  for(const a of modes([0,2]))for(const b of modes([1,3]))for(const phase of[1,-1])add([a,b],phase);
  const small=resize(prob,n,64);
  for(const o of options){const model=gridModel(o.counts);model.z.fill(0);o.initialError=mismatch(gridMask(model,64,o.phase),small);}
  options.sort((a,b)=>a.initialError-b.initialError||a.counts[0]+a.counts[1]-b.counts[0]-b.counts[1]);
  if(!options.length)throw new Error('The requested strip width leaves no room for a woven grid.');
  const stage=(name,run)=>{const at=performance.now();onProgress({stage:name});const value=run();timings.push({stage:name,seconds:(performance.now()-at)/1000});return value;};
  let initialWinner=null;
  const coarse=stage('directInitializing',()=>{
    // Finish the small, fixed-size initialization for every count and phase.
    // A shared deadline here starves late candidates on slower browser engines.
    const seeds=[];
    for(const o of options){
      const uniform=gridModel(o.counts);uniform.z.fill(0);
      const raw={model:uniform,phase:o.phase,floor:.008,error:mismatch(gridMask(uniform,n,o.phase),prob),steps:0};
      const choices=[raw];
      // Keep both uniform and border-informed proposals: photographed endpoints
      // are useful evidence, but must not eliminate a better interior layout.
      for(const initial of[null,borderGrid(o.counts,evidence)?.z,separableGrid(fullProb,source.resolution,o.counts,o.phase).z].filter(v=>v!==undefined)){
        const result=initializeGrid(fullProb,source.resolution,o.counts,o.phase,{initial,scoreResolution:96});
        result.error=mismatch(gridMask(result.model,n,result.phase,result.floor),prob);
        choices.push(result);
      }
      const initializationRounds=choices.filter(r=>r!==raw).map(r=>r.steps);
      choices.sort((a,b)=>a.error-b.error);seeds.push({...choices[0],initializationRounds,seedKind:choices[0]===raw?'uniform':'row-dynamic-programming'});
    }
    seeds.sort((a,b)=>a.error+.001*(a.model.counts[0]+a.model.counts[1])-b.error-.001*(b.model.counts[0]+b.model.counts[1]));
    // A nearly exact, fully validated seed needs no gradient search. Still
    // finish and report every count/phase initialization before accepting it.
    if(seeds[0].error===0||cfg.earlyStop&&seeds[0].error<=Math.min(.005,cfg.maxImageError)){
      const seed=seeds[0],model=cfg.preferMatchingSheets?matchingGrid(seed.model):seed.model;
      if(model){
        const graph=new CurveGraph(gridPaths(model,cfg.width,seed.floor),cfg.width),solution=graph.solution(graph.points,seed.phase,input),woven=sampleWeave(solution,source.resolution);
        let observed=0,errors=0;for(let i=0;i<woven.length;i++){if(source.validMask&&!source.validMask[i])continue;observed++;errors+=woven[i]!==source.mask[i];}
        const error=errors/observed;
        if(error<=(cfg.earlyStop?Math.min(.005,cfg.maxImageError):0)&&auditImageFeatures(source,woven,cfg.width,sourceFeatures).passed&&validate(solution,cfg).passed&&(!cfg.requireMaterialCore||materialAudit(solution,cfg).passed))initialWinner={solution,counts:seed.model.counts,error};
      }
    }
    // Use the fixed-size seed search for every count and phase. Only the
    // strongest candidates need dense grid gradients before free refinement.
    for(const seed of seeds){
      attempts.push({stage:'coarse',counts:seed.model.counts,phase:seed.phase,error:seed.error,initialError:seed.error,initializer:seed.seedKind,initializationRounds:seed.initializationRounds,steps:seed.steps});
      onProgress({stage:'directInitializing',counts:seed.model.counts,error:seed.error});
    }
    return seeds;
  });
  if(initialWinner){
    const {solution,counts,error}=initialWinner;
    solution.report={algorithm:'direct-bezier',numericalBackend,imported:false,termination:'validated_initial_grid',stoppedEarly:true,seconds:(performance.now()-start)/1000,traceUsed:false,borderCountsAreHardConstraints:false,selectedCounts:counts,attempts,stages:timings,estimatedMaskMismatch:error,matchingPreference:{enabled:cfg.preferMatchingSheets,...matchingEvidence,...matchingSummary(solution),identicalCandidateBonus:0}};
    return solution;
  }
  const fine=stage('directFitting',()=>gridFinalists(coarse,evidence).map(r=>{
    const at=performance.now(),next=fitGrid(prob,n,r.model.counts,r.phase,{optimizationTarget:gridTarget,steps:150,initial:r.model.z,deadline:performance.now()+800});
    attempts.push({stage:'fine',counts:r.model.counts,phase:r.phase,error:next.error,steps:next.steps,seconds:(performance.now()-at)/1000});return next.error<r.error?next:r;
  }).sort((a,b)=>a.error+.005*(a.model.counts[0]+a.model.counts[1])-b.error-.005*(b.model.counts[0]+b.model.counts[1])));
  // A local boundary gradient cannot create a remote missing region. Try an
  // alternate traced routing while there is still time within this search.
  const features=auditImageFeatures(source,gridMask(fine[0].model,source.resolution,fine[0].phase,fine[0].floor),cfg.width,sourceFeatures);
  let recovery=null;
  if(!features.passed&&deadline-performance.now()>2000){
    recovery=await recoverImageFeatures(input,cfg,Math.min(20,(deadline-performance.now())/1000*.9),onProgress);
    if(recovery.solution){
      const solution=recovery.solution;
      solution.report={algorithm:'hybrid-bezier-trace',imported:false,termination:'candidate_found',seconds:(performance.now()-start)/1000,traceUsed:true,selectedCounts:solution.paths.map(p=>p.length),attempts,featureRecovery:{trigger:features,...recovery.report},borderCountsAreHardConstraints:true};
      return solution;
    }
  }
  const floor=fittingMargin(cfg,cfg.width)/cfg.width,candidates=[];
  const assess=c=>{
    if(!c.geometryPassed||!c.paperPassed)return false;
    const s=c.graph.solution(c.points,c.phase,input),woven=sampleWeave(s,source.resolution);
    let mismatch=0,observed=0;for(let i=0;i<woven.length;i++){if(source.validMask&&!source.validMask[i])continue;observed++;mismatch+=woven[i]!==source.mask[i];}
    c.originalImageError=mismatch/observed;c.originalFeatures=auditImageFeatures(source,woven,cfg.width,sourceFeatures);
    return c.originalImageError<=cfg.maxImageError&&c.originalFeatures.passed;
  };
  const goodEnough=c=>{
    if(!cfg.earlyStop||c.error>Math.min(.0125,cfg.maxImageError*.5))return false;
    const probe={...c,geometryPassed:true,paperPassed:true};
    return assess(probe)&&probe.originalImageError<=Math.min(.015,cfg.maxImageError*.5);
  };
  const addCandidate=c=>{
    c.matching=matchingSummary(c.graph.solution(c.points,c.phase,input));c.imagePassed=assess(c);
    c.selectionScore=c.originalImageError??Infinity;
    candidates.push(c);
  };
  let stoppedEarly=false;
  for(let i=0;i<fine.length&&!stoppedEarly;i++){
    if(i){if(performance.now()>maxDeadline-1000)break;deadline=Math.min(maxDeadline-1300,performance.now()+8700);}
    const selected=fine[i],remaining=deadline-performance.now(),allocation=remaining,end=Math.min(deadline-1700,performance.now()+allocation);
    const clear=stage('directClearance',()=>fitGrid(prob,n,selected.model.counts,selected.phase,{optimizationTarget:gridTarget,steps:150,initial:refloor(selected,floor),floor,clearance:floor+.0015,deadline:performance.now()+Math.min(800,allocation*.15)}));
    attempts.push({stage:'clearance',counts:clear.model.counts,phase:clear.phase,error:clear.error,steps:clear.steps});
    const graph=new CurveGraph(gridPaths(clear.model,cfg.width,clear.floor),cfg.width);
    const candidate=stage('directRefining',()=>refineCurves(graph,prob,n,clear.phase,{...cfg,preferMatchingSheets:false},{deadline:end,input,rate:clear.model.counts[0]+clear.model.counts[1]>4?.05:.035,stopWhen:goodEnough,onProgress:r=>onProgress({stage:'directRefining',counts:clear.model.counts,...r})}));
    candidate.counts=clear.model.counts;addCandidate(candidate);stoppedEarly=!!(candidate.imagePassed&&candidate.originalImageError<=Math.min(.015,cfg.maxImageError*.5)&&cfg.earlyStop);
    if(candidate.imagePassed)break;
  }
  candidates.sort((a,b)=>Number(b.paperPassed)-Number(a.paperPassed)||Number(b.geometryPassed)-Number(a.geometryPassed)||Number(b.imagePassed)-Number(a.imagePassed)||a.selectionScore-b.selectionScore);
  let candidate=candidates[0];
  if(!candidate.matching?.identical&&candidate.paperPassed&&performance.now()<deadline-1300){
    const shared=stage('directSharing',()=>recoverShared(candidate,prob,n,cfg,{deadline:deadline-1300,input}));
    if(assess(shared)&&shared.originalImageError<=candidate.originalImageError)candidate=shared;
  }
  if(candidate.paperPassed&&performance.now()<deadline-450){
    const graph=new CurveGraph(candidate.graph.nested(candidate.points),cfg.width);
    const polished=stage('directPolishing',()=>refineCurves(graph,Float64Array.from(source.mask),source.resolution,candidate.phase,{...cfg,preferMatchingSheets:false},{input,steps:160,rate:.008,deadline:deadline-250,selection:'mask',identicalSheets:candidate.matching?.identical||false}));
    if(assess(polished)&&polished.originalImageError<=candidate.originalImageError)candidate={...polished,counts:candidate.counts,sharing:candidate.sharing};
  }
  const solution=candidate.graph.solution(candidate.points,candidate.phase,input);
  const paper={passed:candidate.paperPassed};
  solution.report={algorithm:'direct-bezier',numericalBackend,imported:false,termination:!candidate.geometryPassed?'geometry_failure':!paper.passed?'paper_failure':candidate.originalImageError>cfg.maxImageError?'image_mismatch':'candidate_found',seconds:(performance.now()-start)/1000,
    stoppedEarly,matchingPreference:{enabled:cfg.preferMatchingSheets,...matchingEvidence,...matchingSummary(solution),identicalCandidateBonus:0},optimizationResolution:n,sourceResolution:source.resolution,scaleSampling:'Each fitting scale is area-resampled directly from the original classified source; no chained downsampling',initialization:'Fresh ordered grids, soft border endpoint proposals and alternating row dynamic programming; independent shapes for both sheets',countsSearched:attempts.filter(a=>a.stage==='coarse').map(a=>({counts:a.counts,phase:a.phase})),attempts,selectedCounts:candidate.counts,candidates:candidates.map(c=>({counts:c.counts,error:c.error,score:c.score,geometry:c.geometryPassed,paper:c.paperPassed})),
    borderEvidence:evidence,supportedBorderCounts:supportedBorderCounts(evidence),borderCountsAreHardConstraints:false,traceUsed:false,featureRecovery:recovery?.report||null,freeCoordinates:'Both coordinates of anchors and handles; endpoints remain on assigned sides',stages:timings,checkpoints:candidate.history,sharing:candidate.sharing||{accepted:[],rejected:[]},estimatedMaskMismatch:candidate.error,minimumNominalWidth:cfg.nominalWidth,physicalAssemblyTested:false};
  return solution;
}
