/** Fresh image-to-curve fitting with optional traced feature recovery.
 * Geometry and paper checks remain those used by the app's other solver.
 */
import {fitGrid,gridPaths,gridMask,gridControls,mismatch} from './grid.js';
import {progressReporter,emitCandidate,hasCandidateObserver} from '../progress.js';
import {CurveGraph,renderCurves} from './curves.js';
import {refineCurves,fittingMargin} from './refine.js';
import {recoverShared} from './share.js';
import {finalizeFittedSolution} from './finalize.js';
import {sampleWeave,validate} from '../validate.js';
import {matchingGrid,matchingSummary,symmetryEvidence} from './matching.js';
import {applyTies,orbitMean,orbitObjective,symmetryOrbit,symmetryTies} from './symmetry.js';
import {requestedSymmetry} from '../settings.js';
import {materialAudit,paperKernelChoices} from '../material.js';
import {resize} from './math.js';
import {borderEvidence,supportedBorderCounts,gridCountLimit,gridFinalists,countHypotheses,initializeCounts} from './counts.js';
import {auditImageFeatures,imageFeatures} from '../image-features.js';
import {recoverImageFeatures} from '../feature-recovery.js';
import {loadBoundaryKernel} from './native.js';
import {boundaryKernelChoices} from './boundary.js';
import {maskDisagreement} from './prefer-matching.js';
import {initializeTopology,initializeCoarseTopology} from './topology.js';
import {curvesOf} from '../graph.js';
import {sourceWeights,initializationMask} from '../image-reference.js';
import {resizeObjective} from './image-objective.js';
import {initializeFeatureSeeds,featureRefinementObjective} from './feature-seeds.js';
import {featureDetailPlan} from './feature-details.js';

export {borderEvidence,supportedBorderCounts,gridCountLimit,gridFinalists} from './counts.js';
const featureSeed=c=>['feature-weighted-grid','feature-preserving-grid'].includes(c.seed);
function refinementTimeLeft(deadline){
  const available=deadline-performance.now();
  return available-1700-Math.min(800,available*.15);
}
function refloor(result,floor){
  const {model}=result,controls=gridControls(model,result.floor),z=model.z.slice();
  model.counts.forEach((count,f)=>{for(let j=0;j<model.k;j++){
    const gaps=[];let last=0;for(let i=0;i<=count;i++){const next=i===count?1:controls[f].c[j*count+i];gaps.push(Math.max(.0001,next-last-floor));last=next;}
    const sum=gaps.reduce((s,v)=>s+v,0);for(let i=0;i<=count;i++)z[model.offsets[f]+j*(count+1)+i]=Math.log(gaps[i]/sum);
  }});return z;
}
export async function fitDirect(input,cfg,onProgress=()=>{},{countSearch=initializeCounts}={}){
  const start=performance.now();
  onProgress=progressReporter(onProgress,cfg.progressGeometry);
  // Reuse the image-derived count/phase seeds for the optional matching
  // search. A reusable template can need a different routing and cut count
  // than the best independent pair; copying that pair cannot discover it.
  let matchingSeeds=[];
  const solution=await fitIndependent(input,{...cfg,preferMatchingSheets:false},onProgress,args=>{
    const search=countSearch(args);matchingSeeds=search.seeds;return search;
  });
  const selected=finalizeFittedSolution(solution,cfg,{startedAt:start,onProgress,matchingSeeds});
  // numericalBackend describes module loading; these record actual choices
  // for the individual operations, including a faster JavaScript fallback.
  selected.report.paperKernels=paperKernelChoices();
  selected.report.boundaryKernels=boundaryKernelChoices();
  return selected;
}
async function fitIndependent(input,cfg,onProgress,countSearch){
  // Every per-pixel target the search optimizes is the mean over the requested
  // symmetry group, so each mirroring of the drawing enters the loss directly.
  // The original classified mask stays the reference for symmetry evidence,
  // feature audits and the reported image error.
  const source=input.sourceImage,weights=sourceWeights(source),orbit=symmetryOrbit(cfg.symmetry),symmetryRequested=requestedSymmetry(cfg.symmetry).length>0,
    classified=source.probability||Float32Array.from(source.mask),objective=orbitObjective(classified,source.resolution,orbit,weights),fullProb=objective.probability,fullWeights=objective.weights,
    n=Math.min(256,source.resolution),resized=resizeObjective(fullProb,source.resolution,n,fullWeights),prob=resized.probability,fitWeights=resized.weights,
    gridTarget=fullWeights?null:resize(fullProb,source.resolution,96),rawGuide=weights?Float64Array.from(initializationMask(source)):null,guideProb=rawGuide&&orbit?orbitMean(rawGuide,source.resolution,orbit):rawGuide,
    start=performance.now(),fastSeconds=Math.min(cfg.timeLimit,10),maxDeadline=start+cfg.timeLimit*1000;
  let deadline=start+fastSeconds*1000-Math.min(1300,fastSeconds*200);
  const numericalBackend=await loadBoundaryKernel();
  const sourceFeatures=imageFeatures(source,cfg.width),matchingEvidence=symmetryEvidence(source),evidence=borderEvidence(guideProb||fullProb,source.resolution),supportedCounts=supportedBorderCounts(evidence),attempts=[],timings=[];
  const maximumCount=gridCountLimit(evidence);
  // Dense hypotheses take longer to initialize and refine in browser engines.
  // Use the requested budget for them instead of starving the best candidate
  // with the ten-second fast path intended for simpler photographs.
  if(maximumCount>8)deadline=start+Math.min(cfg.timeLimit,18)*1000-1300;
  const options=countHypotheses({prob,n,cfg,evidence,maximumCount,weights:fitWeights});
  const stage=(name,run)=>{const at=performance.now();onProgress({stage:name});const value=run();timings.push({stage:name,seconds:(performance.now()-at)/1000});return value;};
  let initialWinner=null,countSearchReport=null;
  const coarse=stage('directInitializing',()=>{
    // Finish the small, fixed-size initialization for every count and phase.
    // A shared deadline here starves late candidates on slower browser engines.
    const search=countSearch({options,fullProb,resolution:source.resolution,prob,n,evidence,weights:fitWeights,fullWeights,guideProb});
    const seeds=search.seeds;countSearchReport=search.report;
    // A nearly exact, fully validated seed needs no gradient search. Still
    // finish and report every count/phase initialization before accepting it.
    if(seeds[0].error===0||cfg.earlyStop&&seeds[0].error<=Math.min(.005,cfg.maxImageError)){
      const seed=seeds[0],model=cfg.preferMatchingSheets?matchingGrid(seed.model):seed.model;
      if(model){
        // An exact seed still has to start feasible: project it before scoring.
        const graph=new CurveGraph(gridPaths(model,cfg.width,seed.floor),cfg.width),base=graph.points.slice(),points=graph.points.slice(),ties=symmetryTies(graph,cfg.symmetry);
        const projected=!ties||applyTies(ties,points,points,{fixed:graph.fixed,original:base});
        const solution=graph.solution(points,seed.phase,input),woven=sampleWeave(solution,source.resolution);
        const error=maskDisagreement(source,woven);
        if(projected&&error<=(cfg.earlyStop?Math.min(.005,cfg.maxImageError):0)&&auditImageFeatures(source,woven,cfg.width,sourceFeatures).passed&&validate(solution,cfg).passed&&(!cfg.requireMaterialCore||materialAudit(solution,cfg).passed)){initialWinner={solution,counts:seed.model.counts,error};if(cfg.requireMaterialCore)emitCandidate(onProgress,{stage:"directInitializing",error,geometry:true,paper:"pass"},solution);}
      }
    }
    // Use the fixed-size seed search for every count and phase. Only the
    // strongest candidates need dense grid gradients before free refinement.
    for(const seed of seeds){
      attempts.push({stage:'coarse',counts:seed.model.counts,phase:seed.phase,error:seed.error,initialError:seed.error,initializer:seed.seedKind,initializationRounds:seed.initializationRounds,initializationTerminations:seed.initializationTerminations,steps:seed.steps});
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
      const candidate=stage('directRefining',()=>refineCurves(topology.graph,fullProb,source.resolution,topology.phase,cfg,{input,weights:fullWeights,steps:80,rate:.008,deadline:Math.min(topologyDeadline,performance.now()+700),onProgress:cfg.progressGeometry||hasCandidateObserver(onProgress)?(r,solution)=>onProgress({stage:'directRefining',counts:topology.graph.families.map(f=>f.length),...r},solution):undefined}));
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
  const fitSeed=r=>{
    // Unweighted fine-grid polishing can erase a small opening before the
    // geometry stage starts. Its extra routing goes straight to clearance,
    // retaining the same region emphasis through both refinement stages.
    if(r.protectFeatures)return r;
    const at=performance.now(),next=fitGrid(prob,n,r.model.counts,r.phase,{optimizationTarget:gridTarget,weights:fitWeights,steps:150,initial:r.model.z,deadline:performance.now()+800});
    attempts.push({stage:'fine',counts:r.model.counts,phase:r.phase,error:next.error,steps:next.steps,seconds:(performance.now()-at)/1000});return next.error<r.error?{...next,...(r.seed?{seed:r.seed}:{})}:r;
  };
  const finalists=gridFinalists(coarse,weights?[]:evidence),remainingSeeds=coarse.filter(r=>!finalists.includes(r));
  const fine=stage('directFitting',()=>finalists.map(fitSeed).sort((a,b)=>a.error+.005*(a.model.counts[0]+a.model.counts[1])-b.error-.005*(b.model.counts[0]+b.model.counts[1])));
  let coarseTopology=null,boundaryCandidate=null;
  const poorGrid=coarse[0].error>2*cfg.maxImageError&&fine.every(r=>r.error>cfg.maxImageError);
  // Spend this extra routing budget only when even the best initial grid is
  // far outside the accepted image error and none of the fine grids has
  // reached it. Retain those grids too: a simplified seed must earn its place
  // against the original image.
  if(!topology?.graph&&!weights&&requestedSymmetry(cfg.symmetry).every(name=>name==='transpose')&&poorGrid&&deadline-performance.now()>3500){
    coarseTopology=await initializeCoarseTopology(input,cfg,{seconds:Math.min(2.5,(deadline-performance.now()-1700)/1000),onProgress});
    if(coarseTopology.graph){
      boundaryCandidate=stage('directRefining',()=>refineCurves(coarseTopology.graph,fullProb,source.resolution,coarseTopology.phase,cfg,{input,steps:80,rate:.008,selection:'mask',deadline:Math.min(deadline-1700,performance.now()+500),onProgress:cfg.progressGeometry||hasCandidateObserver(onProgress)?(r,solution)=>onProgress({stage:'directRefining',counts:coarseTopology.graph.families.map(f=>f.length),...r},solution):undefined}));
      boundaryCandidate.counts=coarseTopology.graph.families.map(f=>f.length);boundaryCandidate.seed='coarse-boundary-topology';
    }
  }
  // A local boundary gradient cannot create a remote missing region. Try an
  // alternate traced routing while there is still time within this search.
  const features=auditImageFeatures(source,gridMask(fine[0].model,source.resolution,fine[0].phase,fine[0].floor),cfg.width,sourceFeatures);
  let recovery=null;const recoveredCandidates=[];
  // Traced feature recovery routes through the MILP, which cannot hold a
  // mirrored pairing, and a symmetric fit is expected to drop features of an
  // asymmetric drawing. Stay with the constrained fitter instead.
  // A grid can keep most of one large connected region yet miss its branches.
  // Try the detailed routing when poor grids also defeated coarse topology;
  // it must not depend on a spurious missing component near the crop edge.
  const competitiveGrid=fine.some(r=>r.error<=cfg.maxImageError);
  const recoverySeconds=Math.min(20,competitiveGrid?(refinementTimeLeft(deadline)-2000)/1000:(deadline-performance.now())/1000*.9);
  if((!features.passed||poorGrid&&!boundaryCandidate)&&!symmetryRequested&&!weights&&deadline-performance.now()>2000&&recoverySeconds>=.25){
    // If a grid already explains most of the image, speculative recovery of
    // missing details must leave it time for free-curve refinement. Reserve
    // two seconds plus clearance/polishing. Poor grids still need the larger
    // routing budget: their topology can prevent useful local refinement.
    recovery=await recoverImageFeatures(input,cfg,recoverySeconds,onProgress);
    recovery.report.budgetPolicy=competitiveGrid?'reserve_grid_refinement':'prioritize_routing';
    recovery.report.gridMismatchTrigger=poorGrid&&!boundaryCandidate;
    const seed=recovery.solution||recovery.refinementSeed;
    if(seed){
      const paths=seed.paths.map((family,f)=>family.map((_,i)=>curvesOf(seed,f,i).map(c=>c.p))),graph=new CurveGraph(paths,cfg.width),phase=seed.graph.target.phase?-1:1,counts=graph.families.map(f=>f.length);
      // Refinement can move an endpoint or lose an already useful routing.
      // Keep the unchanged seed too; neither is a successful result until it
      // passes the same original-source gates as the independent grids.
      const raw=graph.solution(graph.points,phase,input),validation=validate(raw,cfg),paper=materialAudit(raw,cfg);
      recoveredCandidates.push({graph,points:graph.points.slice(),phase,counts,seed:'feature-recovery',error:mismatch(renderCurves(graph,graph.points,phase,n,32),prob),geometryPassed:validation.passed,paperPassed:paper.passed,validation,history:[]});
      // A recovered routing can still differ substantially from the image.
      // Give it the normal polishing step count within the same time reserve;
      // eighty steps could return while the image fit was still improving.
      const candidate=stage('directRefining',()=>refineCurves(graph,fullProb,source.resolution,phase,cfg,{input,steps:160,rate:.008,selection:'mask',deadline:Math.min(deadline,performance.now()+700),onProgress:cfg.progressGeometry||hasCandidateObserver(onProgress)?(r,solution)=>onProgress({stage:'directRefining',counts:graph.families.map(f=>f.length),...r},solution):undefined}));
      candidate.counts=counts;candidate.seed='feature-recovery';recoveredCandidates.push(candidate);
      const solution=graph.solution(candidate.points,phase,input),woven=sampleWeave(solution,source.resolution);
      recovery.report.refinement={imageError:maskDisagreement(source,woven),featuresPassed:auditImageFeatures(source,woven,cfg.width,sourceFeatures).passed,geometryPassed:candidate.geometryPassed,paperPassed:candidate.paperPassed,steps:candidate.steps};
      if(candidate.geometryPassed&&candidate.paperPassed&&maskDisagreement(source,woven)<=cfg.maxImageError&&auditImageFeatures(source,woven,cfg.width,sourceFeatures).passed){
        solution.graph.metadata.candidateMethod='Feature-recovery topology followed by joint cubic and straight-span refinement';
        solution.report={countSearch:countSearchReport,algorithm:'direct-bezier',numericalBackend,imported:false,termination:'candidate_found',seconds:(performance.now()-start)/1000,traceUsed:true,selectedCounts:solution.paths.map(p=>p.length),attempts,featureRecovery:{trigger:features,...recovery.report},borderCountsAreHardConstraints:false,checkpoints:candidate.history,primitives:candidate.primitives};
        return solution;
      }
    }
  }
  const floor=fittingMargin(cfg,cfg.width)/cfg.width,candidates=[];
  let featureInitialization=null;
  const assess=c=>{
    if(!c.geometryPassed)return false;
    const s=c.graph.solution(c.points,c.phase,input),woven=sampleWeave(s,source.resolution);
    c.originalImageError=maskDisagreement(source,woven);c.originalFeatures=auditImageFeatures(source,woven,cfg.width,sourceFeatures);
    if(c.originalImageError>cfg.maxImageError||!c.originalFeatures.passed)return false;
    // An uncertain coarse lattice is not a failed geometric construction.
    // Spend one finer audit only on an otherwise acceptable candidate. Keep
    // that resolution through final cleanup/export, which recheck all edits.
    if(!c.paperPassed&&c.paper?.status==='uncertain'&&cfg.materialResolution<700&&maxDeadline-performance.now()>500){
      const paper=materialAudit(s,{...cfg,materialResolution:700});
      c.paperVerification={requestedResolution:cfg.materialResolution,initialStatus:'uncertain',resolution:700,status:paper.status};
      c.paperPassed=paper.passed;c.paper=paper.summary;
    }
    return c.paperPassed;
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
    // Refinement published this checkpoint as paper-uncertain. If a finer
    // audit resolves it, retain the now-verified geometry for graceful Stop.
    if(c.imagePassed&&c.paperVerification?.status==='pass'&&hasCandidateObserver(onProgress)){
      const solution=c.graph.solution(c.points,c.phase,input);
      solution.report={paperVerification:c.paperVerification};
      emitCandidate(onProgress,{stage:'directRefining',error:c.originalImageError,geometry:true,paper:'pass'},solution);
    }
  };
  if(boundaryCandidate)addCandidate(boundaryCandidate);
  for(const candidate of recoveredCandidates)addCandidate(candidate);
  let stoppedEarly=false;
  for(let i=0;i<fine.length&&!stoppedEarly;i++){
    // Initialization (including a speculative topology solve) can exhaust the
    // initial fast allocation on slower browsers. Count only time available
    // to refine: clearance and polishing have their own reserves below. Using
    // the whole remaining allocation here could leave less than two seconds
    // for refinement despite a longer user budget. Ten-second requests retain
    // their existing deadline.
    if(i||cfg.timeLimit>fastSeconds&&refinementTimeLeft(deadline)<3500){
      if(i&&performance.now()>maxDeadline-1000)break;
      deadline=Math.min(maxDeadline-1300,performance.now()+8700);
    }
    const selected=fine[i],remaining=deadline-performance.now(),allocation=remaining,end=Math.min(deadline-1700,performance.now()+allocation);
    const protectedObjective=selected.protectFeatures?featureRefinementObjective(source,sourceFeatures,n):null;
    const objectiveProb=protectedObjective?.probability||prob,objectiveWeights=protectedObjective?.weights||fitWeights;
    const refinementCfg=protectedObjective?{...cfg,materialResolution:Math.max(cfg.materialResolution,700)}:cfg;
    const verification=protectedObjective?{requestedResolution:cfg.materialResolution,resolution:refinementCfg.materialResolution,source:'feature-preserving-refinement'}:null;
    const clear=stage('directClearance',()=>fitGrid(objectiveProb,n,selected.model.counts,selected.phase,{optimizationTarget:protectedObjective?null:gridTarget,weights:objectiveWeights,steps:150,initial:refloor(selected,floor),floor,clearance:floor+.0015,deadline:performance.now()+Math.min(800,allocation*.15)}));
    attempts.push({stage:'clearance',counts:clear.model.counts,phase:clear.phase,error:protectedObjective?mismatch(gridMask(clear.model,n,clear.phase,clear.floor),prob):clear.error,steps:clear.steps,...(protectedObjective?{weightedError:clear.error}:{})});
    const graph=new CurveGraph(gridPaths(clear.model,cfg.width,clear.floor),cfg.width);
    const candidate=stage('directRefining',()=>refineCurves(graph,objectiveProb,n,clear.phase,{...refinementCfg,preferMatchingSheets:false},{deadline:end,input,weights:objectiveWeights,rate:clear.model.counts[0]+clear.model.counts[1]>4?.05:.035,stopWhen:goodEnough,onProgress:(r,solution)=>{
      if(protectedObjective){
        r.weightedError=r.error;r.error=maskDisagreement(source,sampleWeave(solution,source.resolution));
        solution.report={paperVerification:{...verification,status:r.paper}};
      }
      onProgress({stage:'directRefining',counts:clear.model.counts,...r},solution);
    }}));
    if(protectedObjective){
      candidate.error=mismatch(renderCurves(graph,candidate.points,candidate.phase,n,32),prob);
      candidate.paperVerification={...verification,status:candidate.paper?.status};
    }
    candidate.counts=clear.model.counts;candidate.seed=selected.seed;addCandidate(candidate);stoppedEarly=!!(candidate.imagePassed&&candidate.originalImageError<=Math.min(.015,cfg.maxImageError*.5)&&cfg.earlyStop&&(!candidate.paperVerification||featureSeed(candidate)));
    // Preserve the first refined checkpoint and all existing finalists. Only
    // unsuccessful feature retention earns this additional initialization;
    // regular successful designs and exhausted short budgets keep their path.
    if(!candidate.imagePassed&&candidate.originalFeatures?.missing.length&&!featureInitialization&&!weights&&!symmetryRequested&&maxDeadline-performance.now()>6500){
      const missed=candidate.originalFeatures.regions.flatMap((r,j)=>r.retainedFraction<candidate.originalFeatures.minimumRetention?[j]:[]);
      const extra=stage('directInitializing',()=>initializeFeatureSeeds({source,features:sourceFeatures,missed,counts:candidate.counts,cfg,evidence,maximumCount}));
      featureInitialization={...extra.report,scheduled:Math.min(1,extra.seeds.length)};
      fine.splice(i+1,0,...extra.seeds.slice(0,1).map(r=>stage('directFitting',()=>fitSeed(r))));
      // A sound close fit with only crop-edge flecks missing is already the
      // useful fallback. Continuing ordinary layouts can also overfit those
      // flecks, adding visible seams elsewhere just to clear the feature gate.
      // Keep the fidelity warning; do not count this as an accepted image.
      if(!extra.report.emphasizedRegions&&candidate.paperPassed&&candidate.originalImageError<=cfg.maxImageError){
        featureInitialization.deferredBorderOnly=true;break;
      }
    }
    // Border disagreement must not stop a competitive simpler finalist from
    // receiving curve refinement. Its grid error can overestimate its eventual
    // fit: accepting the first valid dense grid would hide that improvement.
    // This is a search allowance, not a relaxed final image/feature/paper gate.
    const simplerRemaining=!weights&&fine.slice(i+1).some(r=>r.model.counts[0]+r.model.counts[1]<candidate.counts[0]+candidate.counts[1]&&r.error<=candidate.error+.01);
    // A newly resolved paper uncertainty must not terminate the ordinary
    // finalists earlier than before. Their initial grid error can conceal a
    // much better final fit (the candle's 1+1 layout is one such case).
    const ordinaryFinalistsRemain=candidate.paperVerification&&!featureSeed(candidate)&&fine.slice(i+1).some(r=>!featureSeed(r));
    if(candidate.imagePassed&&!simplerRemaining&&!ordinaryFinalistsRemain)break;
    // Three seeds are the fast path, not evidence that other routings fail.
    // Spend a longer requested budget on an untried layout only when none of
    // the refined candidates passed the original image, feature and paper
    // checks. Keep the successful fast path and the finalization reserve.
    if(i===fine.length-1&&!candidates.some(c=>c.imagePassed)&&remainingSeeds.length&&maxDeadline-performance.now()>4500){
      fine.push(stage('directFitting',()=>fitSeed(remainingSeeds.shift())));
    }
  }
  candidates.sort((a,b)=>Number(b.paperPassed)-Number(a.paperPassed)||Number(b.geometryPassed)-Number(a.geometryPassed)||Number(b.imagePassed)-Number(a.imagePassed)||a.selectionScore-b.selectionScore);
  // Prefer the simplest valid topology when its independently measured image
  // disagreement is within one percentage point of the best valid candidate.
  // This is deliberately applied after geometry and feature gates, so a
  // simpler but physically invalid or feature-losing fit can never win.
  const validCandidates=candidates.filter(c=>c.imagePassed),bestError=validCandidates.reduce((best,c)=>Math.min(best,c.originalImageError),Infinity);
  if(validCandidates.length&&supportedCounts&&!weights){
    const simple=validCandidates.filter(c=>c.counts.every((count,j)=>count===supportedCounts[j])&&c.originalImageError<=bestError+.01).sort((a,b)=>a.originalImageError-b.originalImageError)[0];
    if(simple){
      const rest=candidates.filter(c=>c!==simple);
      candidates.splice(0,candidates.length,simple,...rest);
    }
  }
  let candidate=candidates[0];
  // Once the extra routing retains the small region, give its shape a bounded
  // local refinement. It uses the existing fitter and physical checks. The
  // original whole-image score must improve before this proposal can replace
  // the checkpoint; weighted scores are never used as acceptance evidence.
  let featureDetail=null;
  if(candidate.seed==='feature-preserving-grid'&&candidate.paperPassed&&maxDeadline-performance.now()>4000){
    const plan=featureDetailPlan(candidate.graph,candidate.points,source,sourceFeatures,cfg,n);
    if(plan){
      const detailCfg={...cfg,preferMatchingSheets:false,materialResolution:Math.max(cfg.materialResolution,700)};
      const verification={requestedResolution:cfg.materialResolution,resolution:detailCfg.materialResolution,source:'feature-detail-refinement'};
      const refined=stage('directPolishing',()=>refineCurves(plan.graph,plan.objective.probability,n,candidate.phase,detailCfg,{input,weights:plan.objective.weights,steps:160,rate:.035,deadline:Math.min(maxDeadline-3000,performance.now()+1800),onProgress:(r,solution)=>{
        solution.report={paperVerification:{...verification,status:r.paper}};
        onProgress({stage:'directPolishing',detail:'small-feature-shape',counts:candidate.counts,...r,weightedError:r.error,error:maskDisagreement(source,sampleWeave(solution,source.resolution))},solution);
      }}));
      refined.error=mismatch(renderCurves(plan.graph,refined.points,refined.phase,n,32),prob);
      refined.paperVerification={...verification,status:refined.paper?.status};
      const accepted=assess(refined)&&refined.originalImageError<=candidate.originalImageError;
      featureDetail={...plan.report,applied:accepted,errorBefore:candidate.originalImageError,errorAfter:refined.originalImageError,steps:refined.steps};
      if(accepted)candidate={...refined,counts:candidate.counts,seed:candidate.seed,matching:matchingSummary(plan.graph.solution(refined.points,refined.phase,input))};
    }
  }
  // This optional early pass precedes polishing. The final selected pair also
  // receives sharing recovery after any matching-sheet replacement.
  if(!featureDetail?.applied&&!candidate.matching?.identical&&!symmetryRequested&&candidate.paperPassed&&performance.now()<deadline-1300){
    const shared=stage('directSharing',()=>recoverShared(candidate,prob,n,cfg,{deadline:deadline-1300,input,weights:fitWeights}));
    if(assess(shared)&&shared.originalImageError<=candidate.originalImageError)candidate={...shared,seed:candidate.seed};
  }
  if(!featureDetail?.applied&&candidate.paperPassed&&performance.now()<deadline-450){
    const graph=new CurveGraph(candidate.graph.nested(candidate.points),cfg.width);
    const polishing=orbitObjective(Float64Array.from(source.mask),source.resolution,orbit,weights);
    const polished=stage('directPolishing',()=>refineCurves(graph,polishing.probability,source.resolution,candidate.phase,{...cfg,preferMatchingSheets:false},{input,weights:polishing.weights,steps:160,rate:.008,deadline:deadline-250,selection:'mask',identicalSheets:candidate.matching?.identical||false,onProgress:hasCandidateObserver(onProgress)?(r,solution)=>onProgress({stage:'directPolishing',counts:candidate.counts,...r},solution):undefined}));
    if(assess(polished)&&polished.originalImageError<=candidate.originalImageError)candidate={...polished,counts:candidate.counts,sharing:candidate.sharing,seed:candidate.seed};
  }
  const solution=candidate.graph.solution(candidate.points,candidate.phase,input);
  const paper={passed:candidate.paperPassed};
  solution.report={countSearch:countSearchReport,algorithm:'direct-bezier',numericalBackend,imported:false,termination:!candidate.geometryPassed?'geometry_failure':!paper.passed?'paper_failure':candidate.originalImageError>cfg.maxImageError?'image_mismatch':'candidate_found',seconds:(performance.now()-start)/1000,
    stoppedEarly,featureInitialization,featureDetail,paperVerification:candidate.paperVerification,matchingPreference:{enabled:cfg.preferMatchingSheets,...matchingEvidence,...matchingSummary(solution),identicalCandidateBonus:0},optimizationResolution:n,sourceResolution:source.resolution,scaleSampling:'Each fitting scale is area-resampled directly from the original classified source; no chained downsampling',initialization:'Fresh ordered grids, soft border endpoint proposals and alternating row dynamic programming; independent shapes for both sheets',countsSearched:attempts.filter(a=>a.stage==='coarse').map(a=>({counts:a.counts,phase:a.phase})),attempts,selectedCounts:candidate.counts,candidates:candidates.map(c=>({counts:c.counts,error:c.error,sourceImageError:c.originalImageError,imagePassed:c.imagePassed,featuresPassed:c.originalFeatures?.passed,score:c.score,geometry:c.geometryPassed,paper:c.paperPassed,paperVerification:c.paperVerification})),
    borderEvidence:evidence,supportedBorderCounts:supportedBorderCounts(evidence),borderCountsAreHardConstraints:false,traceUsed:['coarse-boundary-topology','feature-recovery'].includes(candidate.seed),topologyInitialization:topology?.report,coarseTopologyInitialization:coarseTopology?.report,selectedInitialization:candidate.seed||'grid',featureRecovery:recovery?.report||null,freeCoordinates:'Both coordinates of anchors and handles; endpoints remain on assigned sides',stages:timings,checkpoints:candidate.history,sharing:candidate.sharing||{accepted:[],rejected:[]},estimatedMaskMismatch:candidate.error,minimumNominalWidth:cfg.nominalWidth,physicalAssemblyTested:false};
  return solution;
}
