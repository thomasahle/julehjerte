/** Fresh image-to-curve fitting with optional traced feature recovery.
 * Geometry and paper checks remain those used by the app's other solver.
 */
import {fitGrid,gridPaths,gridMask,gridControls} from './grid.js';
import {CurveGraph} from './curves.js';
import {refineCurves,fittingMargin} from './refine.js';
import {recoverShared} from './share.js';
import {sampleWeave,validate} from '../validate.js';
import {matchingGrid,matchingSummary,symmetryEvidence} from './matching.js';
import {applyTies,orbitMean,symmetryOrbit,symmetryTies} from './symmetry.js';
import {requestedSymmetry} from '../settings.js';
import {materialAudit} from '../material.js';
import {resize} from './math.js';
import {borderEvidence,supportedBorderCounts,gridCountLimit,gridFinalists,countHypotheses,initializeCounts} from './counts.js';
import {auditImageFeatures,imageFeatures} from '../image-features.js';
import {recoverImageFeatures} from '../feature-recovery.js';
import {loadBoundaryKernel} from './native.js';
import {preferMatchingSolution,maskDisagreement} from './prefer-matching.js';
import {initializeTopology} from './topology.js';
import {curvesOf} from '../graph.js';

export {borderEvidence,supportedBorderCounts,gridCountLimit,gridFinalists} from './counts.js';
function refloor(result,floor){
  const {model}=result,controls=gridControls(model,result.floor),z=model.z.slice();
  model.counts.forEach((count,f)=>{for(let j=0;j<model.k;j++){
    const gaps=[];let last=0;for(let i=0;i<=count;i++){const next=i===count?1:controls[f].c[j*count+i];gaps.push(Math.max(.0001,next-last-floor));last=next;}
    const sum=gaps.reduce((s,v)=>s+v,0);for(let i=0;i<=count;i++)z[model.offsets[f]+j*(count+1)+i]=Math.log(gaps[i]/sum);
  }});return z;
}
export async function fitDirect(input,cfg,onProgress=()=>{},{countSearch=initializeCounts}={}){
  const start=performance.now();
  const solution=await fitIndependent(input,{...cfg,preferMatchingSheets:false},onProgress,countSearch);
  const result=preferMatchingSolution(solution,cfg,{deadline:start+Math.min(cfg.timeLimit,10)*1000-400,onProgress});
  result.report.seconds=(performance.now()-start)/1000;
  return result;
}
async function fitIndependent(input,cfg,onProgress,countSearch){
  // Every per-pixel target the search optimizes is the mean over the requested
  // symmetry group, so each mirroring of the drawing enters the loss directly.
  // The original classified mask stays the reference for symmetry evidence,
  // feature audits and the reported image error.
  const source=input.sourceImage,orbit=symmetryOrbit(cfg.symmetry),symmetryRequested=requestedSymmetry(cfg.symmetry).length>0,
    classified=source.probability||Float32Array.from(source.mask),fullProb=orbit?orbitMean(classified,source.resolution,orbit):classified,n=Math.min(256,source.resolution),prob=resize(fullProb,source.resolution,n),gridTarget=resize(fullProb,source.resolution,96),start=performance.now(),fastSeconds=Math.min(cfg.timeLimit,10),maxDeadline=start+cfg.timeLimit*1000;
  let deadline=start+fastSeconds*1000-Math.min(1300,fastSeconds*200);
  const numericalBackend=await loadBoundaryKernel();
  const sourceFeatures=imageFeatures(source,cfg.width),matchingEvidence=symmetryEvidence(source),evidence=borderEvidence(fullProb,source.resolution),attempts=[],timings=[];
  const maximumCount=gridCountLimit(evidence);
  // Dense hypotheses take longer to initialize and refine in browser engines.
  // Use the requested budget for them instead of starving the best candidate
  // with the ten-second fast path intended for simpler photographs.
  if(maximumCount>8)deadline=start+Math.min(cfg.timeLimit,18)*1000-1300;
  const options=countHypotheses({prob,n,cfg,evidence,maximumCount});
  const stage=(name,run)=>{const at=performance.now();onProgress({stage:name});const value=run();timings.push({stage:name,seconds:(performance.now()-at)/1000});return value;};
  let initialWinner=null,countSearchReport=null;
  const coarse=stage('directInitializing',()=>{
    // Finish the small, fixed-size initialization for every count and phase.
    // A shared deadline here starves late candidates on slower browser engines.
    const search=countSearch({options,fullProb,resolution:source.resolution,prob,n,evidence});
    const seeds=search.seeds;countSearchReport=search.report;
    // A nearly exact, fully validated seed needs no gradient search. Still
    // finish and report every count/phase initialization before accepting it.
    if(seeds[0].error===0||cfg.earlyStop&&seeds[0].error<=Math.min(.005,cfg.maxImageError)){
      const seed=seeds[0],model=cfg.preferMatchingSheets?matchingGrid(seed.model):seed.model;
      if(model){
        // An exact seed still has to start feasible: project it before scoring.
        const graph=new CurveGraph(gridPaths(model,cfg.width,seed.floor),cfg.width),base=graph.points.slice(),points=graph.points.slice(),ties=symmetryTies(graph,cfg.symmetry);
        if(ties)applyTies(ties,points,points,{fixed:graph.fixed,original:base});
        const solution=graph.solution(points,seed.phase,input),woven=sampleWeave(solution,source.resolution);
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
    solution.report={countSearch:countSearchReport,algorithm:'direct-bezier',numericalBackend,imported:false,termination:'validated_initial_grid',stoppedEarly:true,seconds:(performance.now()-start)/1000,traceUsed:false,borderCountsAreHardConstraints:false,selectedCounts:counts,attempts,stages:timings,estimatedMaskMismatch:error,matchingPreference:{enabled:cfg.preferMatchingSheets,...matchingEvidence,...matchingSummary(solution),identicalCandidateBonus:0}};
    return solution;
  }
  let topology=null;
  // The transposed boundary graph can hold identical sheets. Other requested
  // pairings require the compatible subdivisions of a fresh grid.
  if(requestedSymmetry(cfg.symmetry).every(name=>name==='transpose')&&coarse[0].error>.0001&&deadline-performance.now()>1800){
    // Browser engines can take different times on the same MILP. A longer
    // requested budget may fund a 15-second initialization phase; requests
    // of ten seconds or less retain the existing fast-path allocation.
    const topologyDeadline=Math.max(deadline,start+Math.min(cfg.timeLimit,15)*1000-1300);
    topology=await initializeTopology(input,cfg,{maximumError:Math.min(.005,coarse[0].error),seconds:Math.min(10,cfg.timeLimit*.5,(topologyDeadline-performance.now()-800)/1000),onProgress});
    if(topology.graph){
      const candidate=stage('directRefining',()=>refineCurves(topology.graph,fullProb,source.resolution,topology.phase,cfg,{input,steps:80,rate:.008,deadline:Math.min(topologyDeadline,performance.now()+700)}));
      const solution=candidate.graph.solution(candidate.points,candidate.phase,input),woven=sampleWeave(solution,source.resolution);
      const error=maskDisagreement(source,woven);
      if(candidate.geometryPassed&&candidate.paperPassed&&error<=Math.min(.01,cfg.maxImageError)&&auditImageFeatures(source,woven,cfg.width,sourceFeatures).passed){
        solution.graph.metadata.candidateMethod='Image-derived topology seed followed by joint cubic and straight-span refinement';
        solution.report={countSearch:countSearchReport,algorithm:'direct-bezier',numericalBackend,imported:false,termination:'validated_topology_seed',seconds:(performance.now()-start)/1000,traceUsed:true,borderCountsAreHardConstraints:false,selectedCounts:solution.paths.map(p=>p.length),attempts,stages:timings,checkpoints:candidate.history,primitives:candidate.primitives,estimatedMaskMismatch:error,topologyInitialization:topology.report};
        return solution;
      }
      topology.report.refinementRejected={geometry:candidate.geometryPassed,paper:candidate.paperPassed,imageError:error};
    }
  }
  const fine=stage('directFitting',()=>gridFinalists(coarse,evidence).map(r=>{
    const at=performance.now(),next=fitGrid(prob,n,r.model.counts,r.phase,{optimizationTarget:gridTarget,steps:150,initial:r.model.z,deadline:performance.now()+800});
    attempts.push({stage:'fine',counts:r.model.counts,phase:r.phase,error:next.error,steps:next.steps,seconds:(performance.now()-at)/1000});return next.error<r.error?next:r;
  }).sort((a,b)=>a.error+.005*(a.model.counts[0]+a.model.counts[1])-b.error-.005*(b.model.counts[0]+b.model.counts[1])));
  // A local boundary gradient cannot create a remote missing region. Try an
  // alternate traced routing while there is still time within this search.
  const features=auditImageFeatures(source,gridMask(fine[0].model,source.resolution,fine[0].phase,fine[0].floor),cfg.width,sourceFeatures);
  let recovery=null;
  // Traced feature recovery routes through the MILP, which cannot hold a
  // mirrored pairing, and a symmetric fit is expected to drop features of an
  // asymmetric drawing. Stay with the constrained fitter instead.
  if(!features.passed&&!symmetryRequested&&deadline-performance.now()>2000){
    recovery=await recoverImageFeatures(input,cfg,Math.min(20,(deadline-performance.now())/1000*.9),onProgress);
    if(recovery.solution){
      const seed=recovery.solution,paths=seed.paths.map((family,f)=>family.map((_,i)=>curvesOf(seed,f,i).map(c=>c.p))),graph=new CurveGraph(paths,cfg.width),phase=seed.graph.target.phase?-1:1;
      const candidate=stage('directRefining',()=>refineCurves(graph,fullProb,source.resolution,phase,cfg,{input,steps:80,rate:.008,selection:'mask',deadline:Math.min(deadline,performance.now()+700)}));
      const solution=graph.solution(candidate.points,phase,input),woven=sampleWeave(solution,source.resolution);
      if(candidate.geometryPassed&&candidate.paperPassed&&maskDisagreement(source,woven)<=cfg.maxImageError&&auditImageFeatures(source,woven,cfg.width,sourceFeatures).passed){
        solution.graph.metadata.candidateMethod='Feature-recovery topology followed by joint cubic and straight-span refinement';
        solution.report={countSearch:countSearchReport,algorithm:'direct-bezier',imported:false,termination:'candidate_found',seconds:(performance.now()-start)/1000,traceUsed:true,selectedCounts:solution.paths.map(p=>p.length),attempts,featureRecovery:{trigger:features,...recovery.report},borderCountsAreHardConstraints:false,checkpoints:candidate.history,primitives:candidate.primitives};
        return solution;
      }
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
  // Shared-cut recovery re-subdivides one cut of a pair, which no symmetry
  // pairing can follow; skip it rather than leave the constraint broken.
  if(!candidate.matching?.identical&&!symmetryRequested&&candidate.paperPassed&&performance.now()<deadline-1300){
    const shared=stage('directSharing',()=>recoverShared(candidate,prob,n,cfg,{deadline:deadline-1300,input}));
    if(assess(shared)&&shared.originalImageError<=candidate.originalImageError)candidate=shared;
  }
  if(candidate.paperPassed&&performance.now()<deadline-450){
    const graph=new CurveGraph(candidate.graph.nested(candidate.points),cfg.width);
    const polished=stage('directPolishing',()=>refineCurves(graph,orbit?orbitMean(source.mask,source.resolution,orbit):Float64Array.from(source.mask),source.resolution,candidate.phase,{...cfg,preferMatchingSheets:false},{input,steps:160,rate:.008,deadline:deadline-250,selection:'mask',identicalSheets:candidate.matching?.identical||false}));
    if(assess(polished)&&polished.originalImageError<=candidate.originalImageError)candidate={...polished,counts:candidate.counts,sharing:candidate.sharing};
  }
  const solution=candidate.graph.solution(candidate.points,candidate.phase,input);
  const paper={passed:candidate.paperPassed};
  solution.report={countSearch:countSearchReport,algorithm:'direct-bezier',numericalBackend,imported:false,termination:!candidate.geometryPassed?'geometry_failure':!paper.passed?'paper_failure':candidate.originalImageError>cfg.maxImageError?'image_mismatch':'candidate_found',seconds:(performance.now()-start)/1000,
    stoppedEarly,matchingPreference:{enabled:cfg.preferMatchingSheets,...matchingEvidence,...matchingSummary(solution),identicalCandidateBonus:0},optimizationResolution:n,sourceResolution:source.resolution,scaleSampling:'Each fitting scale is area-resampled directly from the original classified source; no chained downsampling',initialization:'Fresh ordered grids, soft border endpoint proposals and alternating row dynamic programming; independent shapes for both sheets',countsSearched:attempts.filter(a=>a.stage==='coarse').map(a=>({counts:a.counts,phase:a.phase})),attempts,selectedCounts:candidate.counts,candidates:candidates.map(c=>({counts:c.counts,error:c.error,score:c.score,geometry:c.geometryPassed,paper:c.paperPassed})),
    borderEvidence:evidence,supportedBorderCounts:supportedBorderCounts(evidence),borderCountsAreHardConstraints:false,traceUsed:false,topologyInitialization:topology?.report,featureRecovery:recovery?.report||null,freeCoordinates:'Both coordinates of anchors and handles; endpoints remain on assigned sides',stages:timings,checkpoints:candidate.history,sharing:candidate.sharing||{accepted:[],rejected:[]},estimatedMaskMismatch:candidate.error,minimumNominalWidth:cfg.nominalWidth,physicalAssemblyTested:false};
  return solution;
}
