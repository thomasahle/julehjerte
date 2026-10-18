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
import {materialAudit,paperKernelChoices,verifiedPaperSettings} from '../material.js';
import {resize} from './math.js';
import {borderEvidence,supportedBorderCounts,gridCountLimit,gridFinalists,clearanceComparisonSeed,simplerComparisonSeed,countHypotheses,extendInteriorCountHypotheses,initializeCounts} from './counts.js';
import {imageFeatures,auditImageFeatures} from '../image-features.js';
import {auditFeatureFidelity,auditFeatureFidelityChange} from '../feature-shapes.js';
import {recoverImageFeatures} from '../feature-recovery.js';
import {loadBoundaryKernel} from './native.js';
import {boundaryKernelChoices} from './boundary.js';
import {maskDisagreement} from './prefer-matching.js';
import {initializeTopology,initializeCoarseTopology} from './topology.js';
import {curvesOf} from '../graph.js';
import {sourceWeights,initializationMask,hasOnlyObservationWeights} from '../image-reference.js';
import {resizeObjective} from './image-objective.js';
import {initializeFeatureSeeds,initializeFeatureSampling,featureRefinementObjective,interiorFeatureIndices} from './feature-seeds.js';
import {featureDetailPlan} from './feature-details.js';
import {rerouteFittedBoundary} from './reroute.js';
import {recoverClampedFeatures} from './clamped-features.js';
import {polishCandidate} from './polish.js';
import {repairClearanceInitializer} from './clearance-repair.js';
import {recoverCornerTopology} from './corner-topology.js';
import {featureImprovingFinalist} from './feature-finalists.js';
import {assessCandidate} from './candidate-verification.js';

export {borderEvidence,supportedBorderCounts,gridCountLimit,gridFinalists} from './counts.js';
const featureSeed=c=>['feature-weighted-grid','feature-preserving-grid','feature-sampling-grid','fitted-boundary-rerouting'].includes(c.seed);
const finerRefinement=c=>['retained-refinement-alternative','rollback-checkpoint'].includes(c.paperVerification?.source);
const SUPPORTED_COUNT_ERROR_ALLOWANCE=.01;
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
export async function fitDirect(input,cfg,onProgress=()=>{},{countSearch=initializeCounts,cornerRecovery=recoverCornerTopology}={}){
  const start=performance.now();
  onProgress=progressReporter(onProgress,cfg.progressGeometry);
  // Reuse the image-derived count/phase seeds for the optional matching
  // search. A reusable template can need a different routing and cut count
  // than the best independent pair; copying that pair cannot discover it.
  let matchingSeeds=[];
  const solution=await fitIndependent(input,{...cfg,preferMatchingSheets:false},onProgress,args=>{
    const search=countSearch(args);matchingSeeds=search.seeds;return search;
  },cornerRecovery);
  const selected=finalizeFittedSolution(solution,cfg,{startedAt:start,onProgress,matchingSeeds});
  // numericalBackend describes module loading; these record actual choices
  // for the individual operations, including a faster JavaScript fallback.
  selected.report.paperKernels=paperKernelChoices();
  selected.report.boundaryKernels=boundaryKernelChoices();
  return selected;
}
async function fitIndependent(input,cfg,onProgress,countSearch,cornerRecovery){
  // Every per-pixel target the search optimizes is the mean over the requested
  // symmetry group, so each mirroring of the drawing enters the loss directly.
  // The original classified mask stays the reference for symmetry evidence,
  // feature audits and the reported image error.
  const source=input.sourceImage,weights=sourceWeights(source),orbit=symmetryOrbit(cfg.symmetry),symmetryRequested=requestedSymmetry(cfg.symmetry).length>0,
    classified=source.probability||Float32Array.from(source.mask),objective=orbitObjective(classified,source.resolution,orbit,weights),fullProb=objective.probability,fullWeights=objective.weights,
    n=Math.min(256,source.resolution),resized=resizeObjective(fullProb,source.resolution,n,fullWeights),prob=resized.probability,fitWeights=resized.weights,
    gridTarget=fullWeights?null:resize(fullProb,source.resolution,96),gridObjective=fullWeights?resizeObjective(fullProb,source.resolution,96,fullWeights):null,rawGuide=weights?Float64Array.from(initializationMask(source)):null,guideProb=rawGuide&&orbit?orbitMean(rawGuide,source.resolution,orbit):rawGuide,
    start=performance.now(),fastSeconds=Math.min(cfg.timeLimit,10),shortBudget=cfg.timeLimit<=fastSeconds;
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
    const context={options,fullProb,resolution:source.resolution,prob,n,evidence,weights:fitWeights,fullWeights,guideProb};
    const expanded=extendInteriorCountHypotheses(context,cfg),search=countSearch({...context,options:expanded.options});
    const seeds=search.seeds;countSearchReport={...search.report,interiorProposal:expanded.report};
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
        if(projected&&error<=(cfg.earlyStop?Math.min(.005,cfg.maxImageError):0)&&auditFeatureFidelity(source,woven,cfg,sourceFeatures).passed&&validate(solution,cfg).passed&&(!cfg.requireMaterialCore||materialAudit(solution,cfg).passed)){initialWinner={solution,counts:seed.model.counts,error};if(cfg.requireMaterialCore)emitCandidate(onProgress,{stage:"directInitializing",error,geometry:true,paper:"pass"},solution);}
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
  let topology=null,cornerTopology=null,cornerComparison=null;
  // A longer allowance can repair a coupled corner disturbance before a
  // lower-error grid opens an enclosed motif. Short searches retain their
  // established budget; this optional route needs time for geometry and paper
  // checks as well as the MILP. No source pixels or count hypotheses change.
  if(cfg.timeLimit>=20&&!weights&&!symmetryRequested){
    // Limit integer search separately from continuous repair. A late integer
    // proposal needs the full repair tail; no integer proposal should release
    // that unused tail to the coarser routing instead of spending it in MILP.
    const seconds=Math.min(16,(start+cfg.timeLimit*1000-performance.now()-2500)/1000),routingSeconds=Math.min(seconds-1,cfg.timeLimit*.35);
    cornerTopology=await cornerRecovery(input,cfg,{seconds,routingSeconds,onProgress,features:sourceFeatures});
    if(cornerTopology.solution||cornerTopology.report.routing){
      let solution=cornerTopology.solution,error=cornerTopology.report.imageError,comparison=null;
      // A valid corner routing can repeatedly roll back image updates around
      // narrow returns. An unsuccessful MILP can consume that same allowance
      // without finding an integer routing at all. In either case compare one
      // coarser routing using the remaining caller budget, before grid work
      // consumes the time needed to preserve the source's enclosed regions.
      // Retain a checked incumbent if the alternative fails.
      const comparisonSeconds=Math.min(12,(start+cfg.timeLimit*1000-performance.now()-1800)/1000);
      if((!solution||error>Math.min(.015,cfg.maxImageError*.5))&&comparisonSeconds>=10){
        // After the first graph found no checked pair, a smaller connector
        // pool leaves more of the remaining allowance for continuous repair.
        const coarseCfg=solution?cfg:{...cfg,neighbors:Math.min(6,cfg.neighbors)};
        const alternative=await initializeCoarseTopology(input,coarseCfg,{seconds:comparisonSeconds,onProgress,repairRejected:true,repairDeadline:start+cfg.timeLimit*1000-1800});
        comparison={...alternative.report,trigger:solution?'improve_checked_routing':'no_checked_corner_routing',beforeImageError:error??null,selected:false};
        cornerComparison=comparison;
        if(alternative.graph){
          const proposed=alternative.graph.solution(alternative.graph.points,alternative.phase,input),checkedCfg=verifiedPaperSettings(alternative,cfg);
          const woven=sampleWeave(proposed,source.resolution),afterError=maskDisagreement(source,woven);
          const featuresPreserved=(solution?auditFeatureFidelityChange(source,sampleWeave(solution,source.resolution),woven,cfg,sourceFeatures):auditFeatureFidelity(source,woven,cfg,sourceFeatures)).passed;
          const geometry=validate(proposed,checkedCfg),paper=materialAudit(proposed,checkedCfg);
          Object.assign(comparison,{imageError:afterError,featuresPreserved,geometryPassed:geometry.passed,paperPassed:paper.passed});
          if(afterError<=cfg.maxImageError&&(!solution||afterError<error)&&featuresPreserved&&geometry.passed&&paper.passed){
            proposed.report={...(alternative.report.paperVerification?{paperVerification:alternative.report.paperVerification}:{})};
            solution=proposed;error=afterError;comparison.selected=true;
          }
        }
      }
      if(solution){
        solution.report={...solution.report,countSearch:countSearchReport,algorithm:'direct-bezier',numericalBackend,imported:false,
          termination:comparison?.selected?'validated_corner_topology_comparison':'validated_corner_topology',seconds:(performance.now()-start)/1000,traceUsed:true,
          selectedCounts:solution.paths.map(p=>p.length),attempts,stages:timings,cornerTopologyInitialization:cornerTopology.report,
          ...(comparison?{cornerTopologyComparison:comparison}:{}),estimatedMaskMismatch:error,borderCountsAreHardConstraints:false};
        return solution;
      }
    }
  }
  // Short searches share one allowance between precise and coarse boundary
  // initialization. Otherwise a difficult first MILP and its coarse retry can
  // consume the time needed to route and refine the original image later.
  const shortTopologyBudget=Math.min(2.5,cfg.timeLimit*.25);
  // The transposed boundary graph can hold identical sheets. Other requested
  // pairings require the compatible subdivisions of a fresh grid.
  if(requestedSymmetry(cfg.symmetry).every(name=>name==='transpose')&&coarse[0].error>.0001&&deadline-performance.now()>1800){
    // Browser engines can take different times on the same MILP. A longer
    // requested budget may fund a 15-second initialization phase; requests
    // of ten seconds or less share their smaller initialization allowance.
    const topologyDeadline=Math.max(deadline,start+Math.min(cfg.timeLimit,15)*1000-1300);
    topology=await initializeTopology(input,cfg,{maximumError:Math.min(.005,coarse[0].error),seconds:Math.min(shortBudget?shortTopologyBudget:10,cfg.timeLimit*.5,(topologyDeadline-performance.now()-800)/1000),onProgress});
    if(topology.graph){
      const candidate=stage('directRefining',()=>refineCurves(topology.graph,fullProb,source.resolution,topology.phase,cfg,{input,weights:fullWeights,steps:80,rate:.008,deadline:Math.min(topologyDeadline,performance.now()+700),onProgress:cfg.progressGeometry||hasCandidateObserver(onProgress)?(r,solution)=>onProgress({stage:'directRefining',counts:topology.graph.families.map(f=>f.length),...r},solution):undefined}));
      const solution=candidate.graph.solution(candidate.points,candidate.phase,input),woven=sampleWeave(solution,source.resolution);
      const error=maskDisagreement(source,woven);
      if(candidate.geometryPassed&&candidate.paperPassed&&error<=Math.min(.01,cfg.maxImageError)&&auditFeatureFidelity(source,woven,cfg,sourceFeatures).passed){
        solution.graph.metadata.candidateMethod='Image-derived topology seed followed by joint cubic and straight-span refinement';
        solution.report={countSearch:countSearchReport,algorithm:'direct-bezier',numericalBackend,imported:false,termination:'validated_topology_seed',seconds:(performance.now()-start)/1000,traceUsed:true,borderCountsAreHardConstraints:false,selectedCounts:solution.paths.map(p=>p.length),attempts,stages:timings,checkpoints:candidate.history,primitives:candidate.primitives,estimatedMaskMismatch:error,topologyInitialization:topology.report};
        return solution;
      }
      topology.report.refinementRejected={geometry:candidate.geometryPassed,paper:candidate.paperPassed,imageError:error};
    }
  }
  const retainsGridColours=r=>auditImageFeatures(source,gridMask(r.model,source.resolution,r.phase,r.floor),cfg.width,sourceFeatures).passed;
  const retainsGridFeature=r=>auditFeatureFidelity(source,gridMask(r.model,source.resolution,r.phase,r.floor),cfg,sourceFeatures).passed;
  const fitSeed=r=>{
    // Unweighted fine-grid polishing can erase a small opening before the
    // geometry stage starts. Its extra routing goes straight to clearance,
    // retaining the same region emphasis through both refinement stages.
    if(r.protectFeatures)return r;
    const at=performance.now(),next=fitGrid(prob,n,r.model.counts,r.phase,{k:r.model.k,optimizationTarget:gridTarget,optimizationObjective:gridObjective,weights:fitWeights,steps:150,initial:r.model.z,deadline:performance.now()+800,preferCheckpoint:featureSeed(r)?retainsGridFeature:null});
    attempts.push({stage:'fine',counts:r.model.counts,controlPoints:r.model.k,phase:r.phase,error:next.error,steps:next.steps,seconds:(performance.now()-at)/1000});return next.error<r.error?{...next,...(r.seed?{seed:r.seed}:{})}:r;
  };
  const finalists=gridFinalists(coarse,weights?[]:evidence),remainingSeeds=coarse.filter(r=>!finalists.includes(r));
  const fine=stage('directFitting',()=>finalists.map(fitSeed).sort((a,b)=>a.error+.005*(a.model.counts[0]+a.model.counts[1])-b.error-.005*(b.model.counts[0]+b.model.counts[1])));
  let coarseTopology=null,boundaryCandidate=null,finalistPreference=null,colourPreferredGrid=false,partialPreferredGrid=false;
  const poorGrid=coarse[0].error>2*cfg.maxImageError&&fine.every(r=>r.error>cfg.maxImageError);
  // On a poor fit, the cut-count bonus can put a simpler grid that erases an
  // opening ahead of a better image fit that keeps it. Order the existing
  // finalists by colour retention first; no count/phase seed is discarded.
  if(poorGrid&&!weights&&!symmetryRequested&&sourceFeatures.length){
    const originalFirst=fine[0],retained=new Map(fine.map(seed=>[seed,retainsGridColours(seed)]));
    const describe=seed=>({counts:seed.model.counts,phase:seed.phase,error:seed.error,featuresRetained:retained.get(seed)});
    finalistPreference={before:fine.map(describe)};
    fine.sort((a,b)=>Number(retained.get(b))-Number(retained.get(a)));
    // Retaining all colours earns an earlier grid, but should reserve its
    // refinement time only when it also improves the previous first fit.
    // A worse colour-retaining grid can still need a different traced route.
    colourPreferredGrid=!retained.get(originalFirst)&&retained.get(fine[0])&&fine[0].error<=originalFirst.error;
    // When no grid retains every feature, a lower-error finalist can still
    // recover missing regions without sacrificing any already retained one.
    // Give that existing routing refinement time before a long MILP retry.
    if(!fine.some(seed=>retained.get(seed))){
      const preference=featureImprovingFinalist(source,fine,cfg,sourceFeatures);
      finalistPreference.partialImprovement=preference.report;
      if(preference.selected){
        fine.splice(fine.indexOf(preference.selected),1);fine.unshift(preference.selected);partialPreferredGrid=true;
      }
    }
    finalistPreference.reservesRefinement=colourPreferredGrid||partialPreferredGrid;
    finalistPreference.after=fine.map(describe);
  }
  // Spend this extra routing budget only when even the best initial grid is
  // far outside the accepted image error and none of the fine grids has
  // reached it. Retain those grids too: a simplified seed must earn its place
  // against the original image.
  const repairCoarseRouting=!shortBudget&&!symmetryRequested&&poorGrid&&hasOnlyObservationWeights(source)
    &&(finalistPreference?finalistPreference.before[0].featuresRetained:retainsGridColours(fine[0]));
  // A near-fitting grid that keeps every source feature can already have the
  // right routing. Refine it before spending twelve seconds on a new integer
  // assignment. Retention alone does not certify usable cuts: keep the same
  // routing and feature initializers as fallbacks after independent checks.
  const deferredRouting=repairCoarseRouting&&retainsGridFeature(fine[0])&&fine[0].error<=cfg.maxImageError+.01
    ?{reason:'feature-complete-near-fit',gridError:fine[0].error,counts:fine[0].model.counts.slice(),attempted:false}:null;
  // A rejected integer routing can need a small continuous clearance repair,
  // not another discrete assignment with the same narrow returns. Longer
  // requests may fund one such attempt; short searches and grids already
  // scheduled for missing-feature recovery keep their existing priorities.
  // Do not extend later stages merely because a coarse attempt was possible:
  // a rejected seed must not change their original reservation decisions.
  const coarseDeadline=repairCoarseRouting?Math.max(deadline,start+Math.min(cfg.timeLimit,20)*1000-1300):deadline;
  const coarseTopologySeconds=shortBudget?Math.max(0,shortTopologyBudget-(topology?.report.seconds||0)):repairCoarseRouting?12:2.5;
  const attemptCoarseRouting=async(until=coarseDeadline)=>{
    if(topology?.graph||weights&&!repairCoarseRouting||!requestedSymmetry(cfg.symmetry).every(name=>name==='transpose')||!poorGrid||coarseTopologySeconds<=.25||until-performance.now()<=3500)return;
    coarseTopology=await initializeCoarseTopology(input,cfg,{seconds:Math.min(coarseTopologySeconds,(until-performance.now()-1700)/1000),onProgress,repairRejected:repairCoarseRouting,
      repairDeadline:repairCoarseRouting?start+cfg.timeLimit*1000-2500:null});
    if(coarseTopology.graph){
      deadline=until;
      const verification=coarseTopology.report.paperVerification,refinementCfg=verifiedPaperSettings(coarseTopology,cfg);
      boundaryCandidate=stage('directRefining',()=>refineCurves(coarseTopology.graph,fullProb,source.resolution,coarseTopology.phase,refinementCfg,{input,weights:fullWeights,steps:80,rate:.008,selection:'mask',deadline:Math.min(deadline-1700,performance.now()+500),onProgress:cfg.progressGeometry||hasCandidateObserver(onProgress)?(r,solution)=>{
        if(verification)solution.report={...solution.report,paperVerification:{...verification,status:r.paper}};
        onProgress({stage:'directRefining',counts:coarseTopology.graph.families.map(f=>f.length),...r},solution);
      }:undefined}));
      if(verification)boundaryCandidate.paperVerification={...verification,status:boundaryCandidate.paper?.status};
      boundaryCandidate.counts=coarseTopology.graph.families.map(f=>f.length);boundaryCandidate.seed='coarse-boundary-topology';
    }
  };
  // If every grid loses a source region, route the detailed trace first.
  // Otherwise a speculative coarse MILP can consume a quarter of a short
  // request before the smaller feature graph gets any search or repair time.
  // Keep coarse routing as a fallback when feature recovery returns no seed.
  const featureRoutingFirst=shortBudget&&!weights&&!symmetryRequested&&!fine.some(retainsGridColours);
  if(!deferredRouting&&!featureRoutingFirst)await attemptCoarseRouting();
  // A local boundary gradient cannot create a remote missing region. Try an
  // alternate traced routing while there is still time within this search.
  const initialGridMask=gridMask(fine[0].model,source.resolution,fine[0].phase,fine[0].floor);
  let features=auditFeatureFidelity(source,initialGridMask,cfg,sourceFeatures);
  let recovery=null;const recoveredCandidates=[],recoveryHistory=[];
  // Traced feature recovery routes through the MILP, which cannot hold a
  // mirrored pairing, and a symmetric fit is expected to drop features of an
  // asymmetric drawing. Stay with the constrained fitter instead.
  // A grid can keep most of one large connected region yet miss its branches.
  // Try the detailed routing when poor grids also defeated coarse topology;
  // it must not depend on a spurious missing component near the crop edge.
  const competitiveGrid=fine.some(r=>r.error<=cfg.maxImageError);
  let featureInitialization=null,earlyFeatureInitialization=null,featureAlternatives=[],featureSamplingContext=null,samplingRecovery=null;
  // A grid can omit a remote opening which no local boundary gradient can
  // see. Longer budgets must also try the useful short-search layout before
  // spending their time on ordinary refinement. Try the image-derived layout
  // early for poor grids that lose colours too. A coarse opening joined to the
  // background may still close during refinement; do not displace that routing
  // just for enclosure. Keep every ordinary finalist as a fallback.
  const lostColour=features.regions.some(r=>r.retainedFraction<features.minimumRetention);
  // Passing the whole-region floor does not establish a useful routing. On
  // poor grids, try emphasizing the weakest region if it is less faithfully
  // reproduced than the image average. This bounded proposal earns priority
  // only by lowering the ORIGINAL image error and retaining every feature;
  // it does not raise the feature gate or discard any ordinary finalist.
  // A lost crop-edge fleck cannot justify new routing on its own, but must not
  // suppress a useful interior proposal or spend its time on tracing. Only
  // proposal scheduling uses this subset; all source features remain mandatory
  // at final acceptance, and a proposal cannot regress their current fidelity.
  const routingIndices=poorGrid&&!features.passed&&!symmetryRequested?interiorFeatureIndices(source,sourceFeatures,sourceFeatures.map((_,j)=>j),cfg):[];
  const routingFeatures=routingIndices.map(j=>sourceFeatures[j]);
  const interiorRetry=routingFeatures.length>0&&auditFeatureFidelity(source,initialGridMask,cfg,routingFeatures).passed;
  const eligible=interiorRetry?routingIndices:features.regions.map((_,j)=>j);
  const weakest=eligible.reduce((best,j)=>best===null||features.regions[j].retainedFraction<features.regions[best].retainedFraction?j:best,null);
  const weakRegion=poorGrid&&(features.passed||interiorRetry)&&weakest!==null&&1-features.regions[weakest].retainedFraction>fine[0].error?weakest:null;
  const missingFeature=(competitiveGrid||poorGrid&&lostColour)&&!features.passed;
  const initializeEarlyFeature=(missed,weakRegion=null,when='before-recovery',insertAt=0)=>{
    featureSamplingContext={missed,counts:fine[0].model.counts};
    const interiorOnly=weakRegion!==null&&interiorRetry,seedFeatures=interiorOnly?routingFeatures:sourceFeatures,seedMissed=interiorOnly?missed.map(j=>routingIndices.indexOf(j)):missed;
    const beforeMask=interiorOnly?gridMask(fine[0].model,source.resolution,fine[0].phase,fine[0].floor):null;
    // When the full count/shape search no longer fits, its same-count sampling
    // alternative can still leave enough time for useful curve refinement.
    // If it loses a region, the ordinary same-count near-miss/runner-up retry
    // can recover that routing without spending time on additional cut counts.
    // Merely allowing the full initializer later can exhaust that time and
    // return a worse fit. Keep the established search when its reserve fits.
    const limitedTime=refinementTimeLeft(deadline)<=2500;
    const extra=stage('directInitializing',()=>{
      const args={source,features:seedFeatures,missed:seedMissed,counts:fine[0].model.counts,cfg,evidence,maximumCount};
      if(!limitedTime)return initializeFeatureSeeds(args);
      const sampling=initializeFeatureSampling(args);
      if(sampling.seeds.length)return sampling;
      const refined=initializeFeatureSeeds(args,{expandCounts:false});
      return{...refined,report:{...refined.report,samplingAttempt:sampling.report,countExpansion:false}};
    });
    if(limitedTime)samplingRecovery={...extra.report,reason:'limited-initialization-time',scheduled:Math.min(1,extra.seeds.length)};
    earlyFeatureInitialization={...extra.report,...(limitedTime?{strategy:extra.report.samplingAttempt?'same-count-refinement':'same-count-sampling'}:{}),stage:when,scheduled:0,...(interiorOnly?{interiorOnly}:{}),...(weakRegion!==null?{trigger:'weak-region',retention:features.regions[weakRegion].retainedFraction,previousError:fine[0].error}:{})};
    if(extra.seeds.length){
      const seed=stage('directFitting',()=>fitSeed(extra.seeds[0]));
      const proposalMask=gridMask(seed.model,source.resolution,seed.phase,seed.floor),audit=auditFeatureFidelity(source,proposalMask,cfg,sourceFeatures);
      // The coarse grid only needs to retain the colours to earn refinement.
      // Local detail can close an initially open eye in the detail pass;
      // enclosure remains mandatory when accepting the resulting template.
      const enclosurePending=!audit.passed&&audit.regions.every(r=>r.retainedFraction>=audit.minimumRetention);
      const routingPassed=interiorOnly?auditFeatureFidelity(source,proposalMask,cfg,routingFeatures).passed:audit.passed;
      const change=interiorOnly?auditFeatureFidelityChange(source,beforeMask,proposalMask,cfg,sourceFeatures):null;
      const preferred=weakRegion===null?audit.passed||enclosurePending:routingPassed&&seed.error<fine[0].error&&(!change||change.passed);
      if(weakRegion!==null)earlyFeatureInitialization.proposal={error:seed.error,featuresPassed:audit.passed,...(interiorOnly?{routingFeaturesPassed:routingPassed,featureChange:change}:{}),preferred};
      if(preferred){
        fine.splice(insertAt,0,seed);features=audit;
        earlyFeatureInitialization.scheduled=1;
        earlyFeatureInitialization.enclosurePending=enclosurePending;
        featureInitialization=earlyFeatureInitialization;
        featureAlternatives=extra.seeds.slice(1,2);
      }
    }
  };
  // Reserve enough TOTAL time for a bounded feature proposal and refinement.
  // The full initializer keeps its stricter post-reserve threshold above;
  // below it, try only the cheaper same-count alternative, including the
  // shorter tail that cannot fund a full count search. A lost region
  // cannot be created by spending all remaining time on an ordinary grid.
  // Feature objectives retain source coverage and importance. Missing pixels
  // do not disable observed-feature proposals; traced recovery keeps its guard.
  // Keep the longer reserve for speculative improvements to retained regions.
  // Only an absent feature justifies starting inside the shorter tail.
  const featureTimeAvailable=(minimum=3500)=>!symmetryRequested&&deadline-performance.now()>minimum;
  if(missingFeature&&featureTimeAvailable(2500))initializeEarlyFeature(features.regions.flatMap((r,j)=>(r.retainedFraction<features.minimumRetention||r.enclosureLost)?[j]:[]));
  if(interiorRetry&&weakRegion!==null&&featureTimeAvailable())initializeEarlyFeature([weakRegion],weakRegion,'before-recovery');
  // Retaining a large region does not mean a coarse grid keeps its branches.
  // Only shorten routing when colour protection selected a better-fitting
  // ordinary layout or scheduled a dedicated feature start. Otherwise trees
  // can lose useful smoothing/edge-profile retries.
  const featurePreferredGrid=colourPreferredGrid||partialPreferredGrid||earlyFeatureInitialization?.scheduled===1;
  const reserveRefinement=competitiveGrid||featurePreferredGrid,probeRouting=featurePreferredGrid&&(features.passed||earlyFeatureInitialization?.enclosurePending===true);
  // A fine grid just above the image limit can still refine into a good fit.
  // Giving it the full routing budget creates a cliff: a one-pixel crop shift
  // can consume the remaining time in MILP before any curve update survives.
  // Blend toward routing priority as its error grows to twice the limit.
  // A missing source region still needs routing: low aggregate error cannot
  // establish that local curve refinement can create the absent feature.
  // Apply the same evidence-based blend to longer allowances: otherwise
  // an adequate traced fit can return before a more faithful grid is tried.
  // This changes search scheduling only, never final acceptance.
  // A lower-error grid that loses a region cannot justify shortening routing
  // for the worse-fitting grid selected to preserve it. Those two different
  // candidates do not establish one promising local-refinement start.
  const featureTradeoff=finalistPreference?.before[0]?.featuresRetained===false&&!colourPreferredGrid&&!partialPreferredGrid;
  const gridRoutingWeight=features.passed&&!featureTradeoff&&cfg.maxImageError>0?Math.max(0,Math.min(1,Math.min(...fine.map(r=>r.error))/cfg.maxImageError-1)):1;
  const reservedRecoverySeconds=Math.max(0,(refinementTimeLeft(deadline)-2000)/1000),ordinaryRecoverySeconds=(deadline-performance.now())/1000*.9;
  const interpolatedRecoverySeconds=reservedRecoverySeconds+(ordinaryRecoverySeconds-reservedRecoverySeconds)*gridRoutingWeight;
  // Tracing/preflight must leave room for a small useful MILP. A shorter
  // initialization tail must not turn interpolation into a token probe that
  // can only exhaust the first graphs. This floor never exceeds the ordinary
  // routing allowance or changes an already reserved feature-grid probe.
  const recoverySeconds=Math.min(probeRouting?.75:20,reserveRefinement?reservedRecoverySeconds:Math.min(ordinaryRecoverySeconds,Math.max(1,interpolatedRecoverySeconds)));
  const needsRecovery=(!features.passed||poorGrid&&!boundaryCandidate)&&!symmetryRequested;
  const fullRecoverySeconds=Math.min(20,deferredRouting?(start+cfg.timeLimit*1000-performance.now()-2200)/1000:competitiveGrid?(refinementTimeLeft(deadline)-2000)/1000:(deadline-performance.now())/1000*.9);
  // A longer allowance need not delay a useful grid behind the entire routing
  // search. Keep its unused routing budget as a fallback after the first grid;
  // retaining a source region never certifies the resulting cutting geometry.
  // A short request cannot afford both a speculative routing probe and the
  // first refinement of a newly recovered feature. Give a feature-complete
  // start its reserved refinement first, retaining routing as a fallback.
  const refineNewFeatureFirst=shortBudget&&earlyFeatureInitialization?.scheduled===1&&features.passed;
  const deferredFeatureRecovery=((!shortBudget&&(probeRouting||deferredRouting))||refineNewFeatureFirst)&&needsRecovery?{maximumSeconds:fullRecoverySeconds,attempted:false}:null;
  const attemptRecovery=async(seconds,budgetPolicy,until=deadline)=>{
    // A missing region, or a worse grid selected to preserve one, cannot
    // replace a nearly verified route. Lend its remaining tail to bounded
    // repair and checks within this deadline; the MILP allowance stays fixed.
    recovery=await recoverImageFeatures(input,cfg,seconds,onProgress,{repairDeadline:!reserveRefinement&&(!features.passed||featureTradeoff)?until:null});
    recovery.report.trigger=features;
    recovery.report.budgetPolicy=budgetPolicy;
    recovery.report.gridRoutingWeight=reserveRefinement?0:gridRoutingWeight;
    recoveryHistory.push(recovery.report);
    recovery.report.gridMismatchTrigger=poorGrid&&!boundaryCandidate;
    const seed=recovery.solution||recovery.refinementSeed;
    if(seed){
      const paths=seed.paths.map((family,f)=>family.map((_,i)=>curvesOf(seed,f,i).map(c=>c.p))),graph=new CurveGraph(paths,cfg.width),phase=seed.graph.target.phase?-1:1,counts=graph.families.map(f=>f.length);
      const verification=seed.report?.paperVerification,recoveryCfg=verifiedPaperSettings(seed,cfg);
      // Refinement can move an endpoint or lose an already useful routing.
      // Keep the unchanged seed too; neither is a successful result until it
      // passes the same original-source gates as the independent grids.
      const raw=graph.solution(graph.points,phase,input),validation=validate(raw,recoveryCfg),paper=materialAudit(raw,recoveryCfg);
      recoveredCandidates.push({graph,points:graph.points.slice(),phase,counts,seed:'feature-recovery',error:mismatch(renderCurves(graph,graph.points,phase,n,32),prob,fitWeights),geometryPassed:validation.passed,paperPassed:paper.passed,paper:paper.summary,validation,history:[],...(verification?{paperVerification:verification}:{})});
      // A late repair may have only the final verification reserve left.
      // Preserve its exact coordinates for assess() instead of starting a
      // refinement checkpoint after this phase's optimization deadline.
      if(seed.report?.status==='repair_needs_paper_verification'&&until-performance.now()<=500)return null;
      // A recovered routing can still differ substantially from the image.
      // Give it the normal polishing step count within the same time reserve;
      // Constraint projection can interrupt the image trajectory. Allow up to
      // 320 steps so the repaired routing can regain its fit, under the same
      // overall deadline and without displacing a better checked checkpoint.
      // An already accepted route needs no reserved grid search. A fixed
      // 0.7-second polish could lose known image quality on a slow checkpoint
      // even with seconds left in the requested budget. Provisional routings
      // retain their small allowance before the remaining grid candidates.
      // A deliberately simpler junction graph needs to recover its displaced
      // boundary before it can compete with the ordinary grid. Its first 160
      // steps can pass the image limit while still visibly underfitting. Keep
      // optimizing that new proposal within the existing overall deadline.
      const topologyRetry=recovery.report.selectedTrace?.smoothRadius>=.75;
      const polishDeadline=topologyRetry?Math.min(until,performance.now()+4000):recovery.solution?until:Math.min(until,performance.now()+700);
      // A checkpoint can finish just beyond the provisional routing's short
      // phase. Let its bounded clearance repair complete before rollback,
      // without extending gradient work or the enclosing search deadline.
      const candidate=stage('directRefining',()=>refineCurves(graph,fullProb,source.resolution,phase,recoveryCfg,{input,weights:fullWeights,steps:topologyRetry?800:320,rate:.008,selection:'mask',deadline:polishDeadline,repairDeadline:Math.min(until,polishDeadline+400),onProgress:cfg.progressGeometry||hasCandidateObserver(onProgress)?(r,solution)=>{
        if(verification)solution.report={...solution.report,paperVerification:{...verification,status:r.paper}};
        onProgress({stage:'directRefining',counts,...r},solution);
      }:undefined}));
      if(verification)candidate.paperVerification={...verification,status:candidate.paper?.status};
      candidate.counts=counts;candidate.seed='feature-recovery';recoveredCandidates.push(candidate);
      const solution=graph.solution(candidate.points,phase,input),woven=sampleWeave(solution,source.resolution);
      recovery.report.refinement={imageError:maskDisagreement(source,woven),featuresPassed:auditFeatureFidelity(source,woven,cfg,sourceFeatures).passed,geometryPassed:candidate.geometryPassed,paperPassed:candidate.paperPassed,steps:candidate.steps};
      if(candidate.geometryPassed&&candidate.paperPassed&&maskDisagreement(source,woven)<=cfg.maxImageError&&auditFeatureFidelity(source,woven,cfg,sourceFeatures).passed){
        solution.graph.metadata.candidateMethod='Feature-recovery topology followed by joint cubic and straight-span refinement';
        solution.report={countSearch:countSearchReport,finalistPreference,deferredRouting,deferredFeatureRecovery,...(recoveryHistory.length>1?{featureRecoveryAttempts:recoveryHistory}:{}),...(candidate.paperVerification?{paperVerification:candidate.paperVerification}:{}),algorithm:'direct-bezier',numericalBackend,imported:false,termination:'candidate_found',seconds:(performance.now()-start)/1000,traceUsed:true,selectedCounts:solution.paths.map(p=>p.length),attempts,cornerTopologyInitialization:cornerTopology?.report,...(cornerComparison?{cornerTopologyComparison:cornerComparison}:{}),featureRoutingFirst,topologyInitialization:topology?.report,coarseTopologyInitialization:coarseTopology?.report,featureRecovery:{trigger:features,...recovery.report},borderCountsAreHardConstraints:false,checkpoints:candidate.history,primitives:candidate.primitives};
        return solution;
      }
    }
    return null;
  };
  if(!deferredRouting&&!refineNewFeatureFirst&&needsRecovery&&deadline-performance.now()>2000&&recoverySeconds>=.25){
    const recovered=await attemptRecovery(recoverySeconds,probeRouting?'probe_before_grid_refinement':reserveRefinement?'reserve_grid_refinement':'prioritize_routing');
    if(recovered)return recovered;
  }
  // A feature grid selected since routing was deferred owns its refinement
  // reserve. An unsuccessful probe must not spend that reserve on coarse MILP.
  if(featureRoutingFirst&&!reserveRefinement&&!recoveredCandidates.length)await attemptCoarseRouting();
  if(deferredFeatureRecovery)deferredFeatureRecovery.remainingSeconds=Math.max(0,fullRecoverySeconds-(recovery?.report.seconds||0));
  // A still-retained region must not shorten a useful traced search. A tree
  // with hidden border endpoints needs that search to recover its simpler
  // three-cut pair. Try the speculative grid only after routing has failed,
  // while fast border-model rejections still leave time for a fresh layout.
  if(!deferredRouting&&!interiorRetry&&weakRegion!==null&&featureTimeAvailable())initializeEarlyFeature([weakRegion],weakRegion,'after-recovery');
  const floor=fittingMargin(cfg,cfg.width)/cfg.width,candidates=[];
  let verifiedAlternative=false;
  let earlyPolishComparison=null;
  // Keep the established 25-second photographic comparison allowance after
  // finding an acceptable alternative. The app's longer maximum is useful
  // when nothing fits; it must not force a usable result through every seed.
  const searchSeconds=()=>verifiedAlternative?Math.min(cfg.timeLimit,25):cfg.timeLimit;
  const searchDeadline=()=>start+searchSeconds()*1000;
  const assess=(c,options={})=>assessCandidate(c,input,cfg,{deadline:searchDeadline(),sourceFeatures,...options});
  const goodEnough=c=>{
    if(!cfg.earlyStop||c.error>Math.min(.0125,cfg.maxImageError*.5))return false;
    const probe={...c,geometryPassed:true,paperPassed:true};
    return assess(probe)&&probe.originalImageError<=Math.min(.015,cfg.maxImageError*.5);
  };
  const earlyClampedFeatureRecovery=[];
  const recoverClampedCandidate=(c,{reserve=1700,phase='refinement'}={})=>{
    if(c.imagePassed||!c.geometryPassed||c.originalImageError>cfg.maxImageError||!c.originalFeatures?.missing.length||searchDeadline()-performance.now()<reserve+500)return null;
    const solution=c.graph.solution(c.points,c.phase,input);
    solution.report={paperVerification:c.paperVerification};
    const recoveryCfg=verifiedPaperSettings(solution,cfg),at=performance.now();
    const repaired=stage('directPolishing',()=>recoverClampedFeatures(solution,recoveryCfg,{deadline:Math.min(searchDeadline()-reserve,at+500),onProgress}));
    const report=repaired.report.clampedFeatureRecovery;
    earlyClampedFeatureRecovery.push({phase,counts:c.counts,seed:c.seed,elapsedSeconds:(at-start)/1000,seconds:(performance.now()-at)/1000,report});
    if(!report?.applied)return null;
    const graph=new CurveGraph(repaired.paths.map((family,f)=>family.map((_,i)=>curvesOf(repaired,f,i).map(curve=>curve.p))),cfg.width);
    const validation=validate(repaired,recoveryCfg,{checkImage:false});
    // The correction has independently checked geometry and strict paper
    // support. Keep the unchanged refinement checkpoint as an alternative;
    // this new candidate is scored again against the original image below.
    const candidate={...c,graph,points:graph.points.slice(),paperAlternative:null,validation,geometryPassed:validation.passed,paperPassed:true,paper:{status:'pass'},
      clampedFeatureRecovery:report,error:mismatch(renderCurves(graph,graph.points,c.phase,n,32),prob,fitWeights),
      ...(c.paperVerification?{paperVerification:{...c.paperVerification,status:'pass'}}:{})};
    candidate.imagePassed=assess(candidate);
    candidate.matching=matchingSummary(repaired);
    return candidate.imagePassed?candidate:null;
  };
  const addCandidate=c=>{
    c.matching=matchingSummary(c.graph.solution(c.points,c.phase,input));c.imagePassed=assess(c);
    if(c.imagePassed&&c.paperVerification?.source==='rollback-checkpoint')verifiedAlternative=true;
    const proposals=[c];
    if(!c.imagePassed&&c.paperAlternative){
      const alternative={...c,...c.paperAlternative,paperAlternative:null,paperVerification:null};
      // Score against the original objective before competing with other
      // routings. assess() also checks every source feature and independently
      // resolves paper uncertainty; an unverified alternative cannot win.
      alternative.error=mismatch(renderCurves(alternative.graph,alternative.points,alternative.phase,n,32),prob,fitWeights);
      alternative.imagePassed=assess(alternative,{approximationReference:c});
      if(alternative.imagePassed||alternative.approximationImproves&&alternative.paperPassed){
        alternative.matching=matchingSummary(alternative.graph.solution(alternative.points,alternative.phase,input));
        alternative.paperVerification={...alternative.paperVerification,source:'retained-refinement-alternative',incumbentImageError:c.originalImageError,...(!alternative.imagePassed?{incompleteFeatures:true}:{})};
        proposals.push(alternative);
        verifiedAlternative||=alternative.imagePassed;
      }
    }
    // Refinement can cross a coarse-paper-failed interval just before its
    // deadline. Recover a useful checkpoint only after all ordinary retained
    // candidates fail, without changing rollback or certifying that failure.
    if(!proposals.some(proposal=>proposal.imagePassed)&&c.rejectedPaperAlternative){
      const alternative={...c,...c.rejectedPaperAlternative,paperAlternative:null,rejectedPaperAlternative:null,paperVerification:null};
      alternative.error=mismatch(renderCurves(alternative.graph,alternative.points,alternative.phase,n,32),prob,fitWeights);
      if(assess(alternative,{recheckFailed:true})){
        alternative.imagePassed=true;
        alternative.matching=matchingSummary(alternative.graph.solution(alternative.points,alternative.phase,input));
        alternative.paperVerification={...alternative.paperVerification,source:'retained-refinement-alternative',incumbentImageError:c.originalImageError};
        proposals.push(alternative);verifiedAlternative=true;
      }
    }
    if(!proposals.some(proposal=>proposal.imagePassed)){
      const repaired=recoverClampedCandidate(c);
      // A checked local correction can end the search for any usable routing.
      // Retain the ordinary finalists and their existing comparison window;
      // the original, uncorrected candidate remains available too.
      if(repaired){proposals.push(repaired);verifiedAlternative=true;}
    }
    for(const proposal of proposals){
      proposal.selectionScore=proposal.originalImageError??Infinity;
      candidates.push(proposal);
      // Refinement published this checkpoint as paper-uncertain. If a finer
      // audit resolves it, retain the now-verified geometry for graceful Stop.
      if(proposal.imagePassed&&proposal.paperVerification?.status==='pass'&&hasCandidateObserver(onProgress)){
        const solution=proposal.graph.solution(proposal.points,proposal.phase,input);
        solution.report={paperVerification:proposal.paperVerification};
        emitCandidate(onProgress,{stage:'directRefining',error:proposal.originalImageError,geometry:true,paper:'pass'},solution);
      }
    }
  };
  let featureDetail=null;const featureDetailAttempts=[];
  const refineFeatureDetail=async candidate=>{
    const canRefine=candidate.geometryPassed&&(candidate.paperPassed||candidate.paper?.status==='uncertain');
    // A checked candidate cannot enter the rejected-boundary rerouting below.
    // Give its local shape pass more of the short budget, keeping one second
    // for finalization. Unaccepted candidates retain time for rerouting;
    // a longer request keeps its existing three-second reserve.
    const detailReserve=shortBudget?(candidate.imagePassed?1000:1700):3000;
    if(!canRefine||searchDeadline()-performance.now()<=detailReserve+(shortBudget?600:1000))return candidate;
    const plan=featureDetailPlan(candidate.graph,candidate.points,source,sourceFeatures,cfg,n,{local:!!candidate.imagePassed&&!symmetryRequested&&!candidate.matching?.identical});
    if(plan){
      const detailCfg={...cfg,preferMatchingSheets:false,materialResolution:Math.max(cfg.materialResolution,700)};
      const verification={requestedResolution:cfg.materialResolution,resolution:detailCfg.materialResolution,source:'feature-detail-refinement'};
      const detailStarted=performance.now(),detailRate=(shortBudget||earlyFeatureInitialization?.enclosurePending) ? .07 : .035;let rejected=null;
      let refined;
      try{refined=stage('directPolishing',()=>refineCurves(plan.graph,plan.objective.probability,n,candidate.phase,detailCfg,{input,weights:plan.objective.weights,steps:160,rate:detailRate,deadline:Math.min(searchDeadline()-detailReserve,performance.now()+1800),onProgress:(r,solution)=>{
        solution.report={paperVerification:{...verification,status:r.paper}};
        const woven=sampleWeave(solution,source.resolution),error=maskDisagreement(source,woven);
        if(!candidate.imagePassed&&!symmetryRequested&&!r.geometry&&error<=cfg.maxImageError&&(!rejected||error<rejected.error)&&auditFeatureFidelity(source,woven,cfg,sourceFeatures).passed)rejected={solution,error};
        onProgress({stage:'directPolishing',detail:'small-feature-shape',counts:candidate.counts,...r,weightedError:r.error,error},solution);
      }}));}finally{
        // Scope this optimization only; later repair and editing retain the
        // graph's original endpoint constraints and shared control identities.
        if(plan.originalFixed)plan.graph.fixed.set(plan.originalFixed);
      }
      refined.error=mismatch(renderCurves(plan.graph,refined.points,refined.phase,n,32),prob,fitWeights);
      refined.paperVerification={...verification,status:refined.paper?.status};
      Object.assign(refined,{counts:candidate.counts,seed:candidate.seed});
      refined.imagePassed=assess(refined);
      if(!refined.imagePassed&&(!candidate.imagePassed||refined.originalImageError<=candidate.originalImageError))refined=recoverClampedCandidate(refined,{reserve:500,phase:'feature-detail'})||refined;
      // An unverified proposal is not an incumbent. Recovering valid paper may
      // cost a few source pixels; it must still pass the unchanged original
      // image and feature limits. An accepted incumbent cannot lose accuracy.
      const accepted=refined.imagePassed&&(!candidate.imagePassed||refined.originalImageError<=candidate.originalImageError);
      featureDetail={...plan.report,refinementRate:detailRate,finalizationReserveSeconds:detailReserve/1000,applied:accepted,errorBefore:candidate.originalImageError,errorAfter:refined.originalImageError,geometryPassed:refined.geometryPassed,paperStatus:refined.paper?.status,featuresPassed:refined.originalFeatures?.passed,steps:refined.steps};
      // A later retry can be shorter than the first attempt. Keep both, along
      // with rejected geometry checkpoints: the returned safe fallback alone
      // cannot explain why local refinement failed to retain an opening.
      featureDetailAttempts.push({...featureDetail,counts:candidate.counts.slice(),phase:candidate.phase,seed:candidate.seed,materialResolution:detailCfg.materialResolution,seconds:(performance.now()-detailStarted)/1000,
        checkpoints:refined.history.map(({step,geometry,paper,issues})=>({step,geometry,paper,issues}))});
      if(accepted)return{...refined,matching:matchingSummary(refined.graph.solution(refined.points,refined.phase,input))};
      // The image can improve by crossing a slit with itself. Such a rejected
      // checkpoint supplies only a visible boundary: a bounded routing search
      // must find a different, independently valid assignment to both sheets.
      // Successful detail fits keep their existing path and pay no MILP cost.
      const rerouteSeconds=Math.min(1.5,(searchDeadline()-performance.now()-1700)/1000);
      if(rejected&&rerouteSeconds>=.4){
        const routed=await rerouteFittedBoundary(rejected.solution,input,detailCfg,{seconds:rerouteSeconds,onProgress});
        featureDetailAttempts.at(-1).rerouting=routed.report;
        if(routed.graph){
          const raw=routed.graph.solution(routed.graph.points,routed.phase,input),validation=validate(raw,detailCfg),paper=materialAudit(raw,detailCfg);
          const result={graph:routed.graph,points:routed.graph.points.slice(),phase:routed.phase,counts:routed.graph.families.map(f=>f.length),seed:'fitted-boundary-rerouting',geometryPassed:validation.passed,paperPassed:paper.passed,paper:paper.summary,validation,history:[],error:mismatch(renderCurves(routed.graph,routed.graph.points,routed.phase,n,32),prob,fitWeights),paperVerification:{...verification,source:'fitted-boundary-rerouting',status:paper.status},matching:matchingSummary(raw)};
          routed.report.refinementAccepted=assess(result);
          if(routed.report.refinementAccepted)return result;
        }
      }
    }
    return candidate;
  };
  if(boundaryCandidate)addCandidate(boundaryCandidate);
  for(const candidate of recoveredCandidates)addCandidate(candidate);
  const samplingSeed=reason=>{
    const remainingSeconds=(searchDeadline()-performance.now())/1000;
    if(remainingSeconds<=3){samplingRecovery={scheduled:0,reason:'insufficient-time',remainingSeconds};return null;}
    const supported=supportedCounts?.every(count=>count<=maximumCount&&(count+1)*(cfg.nominalWidth+.35)<cfg.width);
    const counts=supported?supportedCounts:featureSamplingContext.counts;
    const extra=stage('directInitializing',()=>initializeFeatureSampling({source,features:sourceFeatures,missed:featureSamplingContext.missed,counts,cfg,evidence}));
    samplingRecovery={...extra.report,reason,scheduled:Math.min(1,extra.seeds.length),remainingSeconds,elapsedSeconds:(performance.now()-start)/1000};
    return extra.seeds.length?stage('directFitting',()=>fitSeed(extra.seeds[0])):null;
  };
  // Reordering a fresh alternative must not repeat clearance fitting or lose
  // the original layout. Cache both preparations while they remain queued.
  const preparations=new Map();
  const prepareRefinement=(selected,allocation)=>{
    if(preparations.has(selected))return preparations.get(selected);
    const protectedObjective=selected.protectFeatures?featureRefinementObjective(source,sourceFeatures,n):null;
    const objectiveProb=protectedObjective?.probability||prob,objectiveWeights=protectedObjective?.weights||fitWeights;
    const refinementCfg=protectedObjective?{...cfg,materialResolution:Math.max(cfg.materialResolution,700)}:cfg;
    const verification=protectedObjective?{requestedResolution:cfg.materialResolution,resolution:refinementCfg.materialResolution,source:'feature-preserving-refinement'}:null;
    // Clearance grids need to retain colours; free refinement may still close
    // an opening. Enclosure is mandatory only for the accepted template.
    const clear=stage('directClearance',()=>fitGrid(objectiveProb,n,selected.model.counts,selected.phase,{k:selected.model.k,optimizationTarget:protectedObjective?null:gridTarget,optimizationObjective:protectedObjective?null:gridObjective,weights:objectiveWeights,steps:150,initial:refloor(selected,floor),floor,clearance:floor+.0015,deadline:performance.now()+Math.min(800,allocation*.15),preferCheckpoint:featureSeed(selected)?retainsGridColours:null}));
    attempts.push({stage:'clearance',counts:clear.model.counts,controlPoints:clear.model.k,phase:clear.phase,error:protectedObjective?mismatch(gridMask(clear.model,n,clear.phase,clear.floor),prob,fitWeights):clear.error,steps:clear.steps,...(protectedObjective?{weightedError:clear.error}:{})});
    const graph=new CurveGraph(gridPaths(clear.model,cfg.width,clear.floor),cfg.width);
    const prepared={clear,graph,protectedObjective,objectiveProb,objectiveWeights,refinementCfg,verification};
    preparations.set(selected,prepared);return prepared;
  };
  const extraGridComparisons=[],geometryRecovery=[];
  let countSearchBound=null;
  let clearanceComparison=null;
  let initialGeometryComparison=null;
  let stoppedEarly=false;
  for(let i=0;i<fine.length&&!stoppedEarly;i++){
    // Initialization (including a speculative topology solve) can exhaust the
    // initial fast allocation on slower browsers. Count only time available
    // to refine: clearance and polishing have their own reserves below. Using
    // the whole remaining allocation here could leave less than two seconds
    // for refinement despite a longer user budget. Ten-second requests retain
    // their existing deadline.
    if(i||cfg.timeLimit>fastSeconds&&refinementTimeLeft(deadline)<3500){
      if(i&&performance.now()>searchDeadline()-1000)break;
      deadline=Math.min(searchDeadline()-1300,performance.now()+8700);
    }
    // An expired refinement window cannot improve another clearance grid.
    // Leave this time for polishing the candidates we have already fitted.
    const samplingRetry=fine[i].seed==='feature-sampling-grid';
    if(candidates.some(c=>c.imagePassed)&&deadline-performance.now()<=1700)break;
    if(i&&deadline-performance.now()<=(samplingRetry?700:1700))break;
    // Spend the unsuccessful layout's ordinary polishing window on the fresh
    // shape; the overall deadline and final cleanup/export reserve stay fixed.
    const selected=fine[i],remaining=deadline-performance.now(),allocation=remaining;
    // A sampling start promoted by preflight is the primary candidate, not a
    // last-chance retry. It needs the ordinary outline-polishing reserve too.
    // A late feature start still needs its first useful curve fit. Reserving
    // the full polishing window can leave only a few gradient steps after
    // initialization. Lend that window to the initial fit while keeping a
    // short polish tail and the enclosing final-verification reserve.
    const featurePolishReserve=featureSeed(selected)&&!candidates.some(c=>c.imagePassed)
      ?Math.min(1700,Math.max(450,remaining-2500)):1700;
    const polishingReserve=samplingRetry?(samplingRecovery?.preflight?.preferred?1700:0):featurePolishReserve,end=Math.min(deadline-polishingReserve,performance.now()+allocation);
    const {clear,graph,protectedObjective,objectiveProb,objectiveWeights,refinementCfg,verification}=prepareRefinement(selected,allocation);
    // The unconstrained grid can look best only because its strips are too
    // narrow. If preparation reverses that ranking, give one existing
    // finalist its clearance pass now. Reuse both preparations and keep the
    // former first layout queued; neither the deadline nor acceptance changes.
    // Weak-region starts already retain every source feature. Like ordinary
    // grids, their apparent improvement can disappear under the strip-width
    // constraint; compare the retained ordinary finalist before committing.
    if(i===0&&!clearanceComparison&&!weights&&!symmetryRequested&&(!featureSeed(selected)||earlyFeatureInitialization?.trigger==='weak-region')&&deadline-performance.now()>2500){
      const retry=clearanceComparisonSeed(fine.slice(i+1).filter(r=>!featureSeed(r)),selected,clear);
      if(retry){
        const at=performance.now(),alternate=prepareRefinement(retry,deadline-at);
        const solution=alternate.graph.solution(alternate.graph.points,alternate.clear.phase,input);
        const geometry=validate(solution,alternate.refinementCfg,{checkImage:false});
        const paper=geometry.passed?materialAudit(solution,alternate.refinementCfg):null;
        const originalColours=retainsGridColours(clear),alternativeColours=retainsGridColours(alternate.clear);
        const score=r=>r.error+.005*(r.model.counts[0]+r.model.counts[1]);
        const lowerScore=score(alternate.clear)<score(clear);
        // This short repair can restore features lost during clearance, but
        // cannot invent a routing that never represented them. Leave that
        // work to feature initialization instead of starving its viable seed.
        const alternativeColoursBeforeClearance=lowerScore&&geometry.passed&&!alternativeColours?retainsGridColours(retry):null;
        const recoverFeatures=alternativeColoursBeforeClearance===true;
        // A partial-feature preference must survive clearance scheduling too.
        // The cut-count bonus alone cannot send us back to the layout that
        // erased those regions. Compare actual clearance masks; retain the
        // alternative in the queue even when it cannot take first priority.
        const featureChange=partialPreferredGrid?auditFeatureFidelityChange(source,
          gridMask(clear.model,source.resolution,clear.phase,clear.floor),
          gridMask(alternate.clear.model,source.resolution,alternate.clear.phase,alternate.clear.floor),cfg,sourceFeatures):null;
        const competitive=lowerScore&&(!originalColours||alternativeColours)&&(!featureChange||featureChange.passed);
        let preferred=competitive&&geometry.passed&&(!cfg.requireMaterialCore||paper?.passed),repair=null;
        // A better coarse routing can start with a narrow neck that the
        // common curve fitter repairs quickly. A geometry-valid start can
        // instead need this bounded refinement to recover missing colours.
        // Keep every finalist. A verified improvement can continue refining
        // before meeting the final image limit; it is not an accepted result.
        if((competitive&&!geometry.passed||recoverFeatures)&&clear.error>cfg.maxImageError&&!candidates.some(c=>c.imagePassed)){
          // There is no acceptable candidate to polish yet. Let this bounded
          // repair use that window instead of rejecting a useful alternative
          // just after its clearance check. Its refinement window remains
          // capped at 1.2 seconds; checks share the enclosing deadline, which
          // retains the export reserve.
          repair=stage('directRefining',()=>repairClearanceInitializer(alternate,input,alternate.refinementCfg,{geometry,recoverFeatures,deadline,onProgress:(r,s)=>onProgress({stage:'directRefining',detail:'clearance-initializer',counts:alternate.clear.model.counts,...r},s)}));
          const repaired=repair.candidate||repair.continuation;
          if(repaired){
            addCandidate(repaired);
            if(repaired.imagePassed||repair.continuation){
              preferred=true;verifiedAlternative||=repaired.imagePassed;
              const verification=repaired.paperVerification;
              preparations.set(retry,{...alternate,graph:new CurveGraph(repaired.graph.nested(repaired.points),cfg.width),refinementCfg:verifiedPaperSettings({report:{paperVerification:verification}},alternate.refinementCfg),verification});
            }
          }
        }
        clearanceComparison={initialCounts:clear.model.counts,initialGridError:selected.error,initialClearanceError:clear.error,alternativeCounts:alternate.clear.model.counts,alternativeGridError:retry.error,alternativeClearanceError:alternate.clear.error,initialColours:originalColours,alternativeColours,alternativeColoursBeforeClearance,alternativeGeometry:geometry.passed,alternativePaper:paper?.status,...(featureChange?{featureChange}:{}),...(repair?{repair:repair.report}:{}),seconds:(performance.now()-at)/1000,preferred};
        if(preferred){fine.splice(fine.indexOf(retry),1);fine.splice(i,0,retry);i--;continue;}
      }
    }
    const initialFeatureGeometry=featureSeed(selected)&&!candidates.some(c=>c.geometryPassed&&c.paperPassed)?validate(graph.solution(graph.points,clear.phase,input),refinementCfg,{checkImage:false}):null;
    if(featureSeed(selected)&&selected.model.k===16&&!selected.protectFeatures&&!samplingRecovery&&featureSamplingContext&&!symmetryRequested&&!candidates.some(c=>c.imagePassed)){
      const initialGeometry=initialFeatureGeometry||validate(graph.solution(graph.points,clear.phase,input),refinementCfg,{checkImage:false});
      // Compare this bounded alternate before committing the refinement
      // budget. Waiting for a failed full fit starves it on a cold worker.
      // It must keep source colours, satisfy geometry/paper checks, and beat
      // a valid incumbent's unweighted clearance error to go first.
      const retry=samplingSeed(initialGeometry.passed?'coarse-feature-alternative':'invalid-initial-geometry');
      if(retry){
        const alternate=prepareRefinement(retry,deadline-performance.now()),solution=alternate.graph.solution(alternate.graph.points,alternate.clear.phase,input);
        const geometry=validate(solution,alternate.refinementCfg,{checkImage:false}),paper=geometry.passed?materialAudit(solution,alternate.refinementCfg):null;
        const preferred=geometry.passed&&(!cfg.requireMaterialCore||paper?.passed)&&(!initialGeometry.passed||alternate.clear.error<clear.error);
        samplingRecovery.preflight={initialCounts:clear.model.counts,initialError:clear.error,initialGeometry,alternativeCounts:alternate.clear.model.counts,alternativeError:alternate.clear.error,alternativeGeometry:geometry,alternativePaper:paper?.status,preferred};
        if(preferred){fine.splice(i,0,retry);i--;continue;}
        fine.splice(i+1,0,retry);
      }
    }
    // An illegal feature seed can consume the whole budget before any
    // ordinary finalist is refined. Give an existing geometry-valid layout
    // the first refinement window; retain the feature proposal immediately
    // behind it. Image fidelity and strict paper checks still decide success.
    if(initialFeatureGeometry?.passed===false&&!initialGeometryComparison&&!candidates.some(c=>c.geometryPassed&&c.paperPassed)){
      const ordinary=fine.slice(i+1).find(r=>!featureSeed(r));
      if(ordinary){
        const at=performance.now(),alternative=prepareRefinement(ordinary,Math.max(0,deadline-at));
        const solution=alternative.graph.solution(alternative.graph.points,alternative.clear.phase,input);
        const geometry=validate(solution,alternative.refinementCfg,{checkImage:false}),paper=geometry.passed?materialAudit(solution,alternative.refinementCfg):null;
        const preferred=geometry.passed&&(!cfg.requireMaterialCore||paper?.status!=='fail');
        initialGeometryComparison={initialCounts:clear.model.counts,initialGeometry:initialFeatureGeometry,alternativeCounts:alternative.clear.model.counts,alternativeGeometry:geometry,alternativePaper:paper?.status,preferred,seconds:(performance.now()-at)/1000};
        if(preferred){fine.splice(fine.indexOf(ordinary),1);fine.splice(i,0,ordinary);i--;continue;}
      }
    }
    // Ordinary grids can also repeat an identical failed block after the
    // optimizer resets at its minimum rate. Preserve the final partial block
    // while freeing the redundant work for polishing the retained candidate.
    // Polishing cannot improve a routing whose cuts still violate geometry.
    // If no usable pair exists, let this fit spend part of that reserve on its
    // first checked geometry-and-paper checkpoint. Keep finalization and a
    // short polish window; existing geometric checkpoints keep their cutoff.
    const geometryRecoveryDeadline=candidates.some(c=>c.geometryPassed&&c.paperPassed)?end:Math.max(end,deadline-450);
    let candidate=stage('directRefining',()=>refineCurves(graph,objectiveProb,n,clear.phase,{...refinementCfg,preferMatchingSheets:false},{deadline:end,geometryRecoveryDeadline,input,weights:objectiveWeights,skipRepeatedRollbacks:true,resolvePaperBeforeRollback:true,retryPaperSeparation:true,paperSeparationErrorThreshold:cfg.maxImageError,preferCheckpoint:featureSeed(selected)?(_candidate,solution)=>auditFeatureFidelity(source,sampleWeave(solution,source.resolution),cfg,sourceFeatures).passed:null,rate:clear.model.counts[0]+clear.model.counts[1]>4?.05:.035,stopWhen:value=>{
      if(goodEnough(value))return true;
      if(!selected.protectFeatures||!earlyFeatureInitialization?.enclosurePending)return false;
      // Hand a checked colour-retaining fit to local shape refinement as soon
      // as its global error is acceptable. Waiting for the broad stage's
      // deadline both starves detail and changes its initial geometry with
      // machine speed. This does not accept an open feature as a result.
      const woven=sampleWeave(value.graph.solution(value.points,value.phase,input),source.resolution);
      if(maskDisagreement(source,woven)>cfg.maxImageError||!auditImageFeatures(source,woven,cfg.width,sourceFeatures).passed)return false;
      earlyFeatureInitialization.detailHandoff=true;return true;
    },onProgress:(r,solution)=>{
      if(protectedObjective){
        r.weightedError=r.error;r.error=maskDisagreement(source,sampleWeave(solution,source.resolution));
      }
      if(verification)solution.report={paperVerification:{...verification,status:r.paper}};
      onProgress({stage:'directRefining',counts:clear.model.counts,...r},solution);
    }}));
    if(candidate.geometryRecovery)geometryRecovery.push({counts:clear.model.counts,...candidate.geometryRecovery});
    if(protectedObjective){
      candidate.error=mismatch(renderCurves(graph,candidate.points,candidate.phase,n,32),prob,fitWeights);
    }
    if(verification)candidate.paperVerification={...verification,status:candidate.paper?.status};
    candidate.counts=clear.model.counts;candidate.seed=selected.seed;addCandidate(candidate);
    // A joint protected routing needs its established local detail pass before
    // competing with other starts; that pass can close an initially open eye.
    // Ordinary extra routings get detail once they enclose the feature and
    // fit the original image. A paper-uncertain proposal may earn a valid
    // refinement, but never certifies itself. Never rank weighted detail scores.
    const retainedColours=candidate.originalFeatures?.regions.every(r=>r.retainedFraction>=candidate.originalFeatures.minimumRetention);
    const protectedDetail=candidate.seed==='feature-preserving-grid'&&candidate.paperPassed&&retainedColours&&candidate.originalImageError<=cfg.maxImageError;
    if(protectedDetail||['feature-weighted-grid','feature-sampling-grid'].includes(candidate.seed)&&candidate.originalFeatures?.passed&&candidate.originalImageError<=cfg.maxImageError&&candidate.originalFeatures.enclosures?.components.some(f=>f.componentIoU<.8)){
      const detailed=await refineFeatureDetail(candidate);
      if(detailed!==candidate){addCandidate(detailed);candidate=detailed;}
    }
    // One bounded attempt before starting more grid layouts. Preserve every
    // existing candidate and all acceptance checks. Successful/short fits skip it.
    if(!shortBudget&&!earlyPolishComparison&&!candidates.some(c=>c.imagePassed)&&candidate.geometryPassed&&candidate.paperPassed&&candidate.originalFeatures?.passed&&candidate.originalImageError<=cfg.maxImageError+.01){
      const at=performance.now(),until=Math.min(searchDeadline()-1300,at+6500);
      if(until-at>1800){
        const polishing=orbitObjective(Float64Array.from(source.mask),source.resolution,orbit,weights);
        const refined=stage('directPolishing',()=>polishCandidate(candidate,polishing.probability,source.resolution,{...cfg,preferMatchingSheets:false},{input,weights:polishing.weights,steps:160,rate:.008,deadline:until-250,selection:'mask',identicalSheets:candidate.matching?.identical||false,onProgress:hasCandidateObserver(onProgress)?(r,s)=>onProgress({stage:'directPolishing',detail:'early-feature-complete-comparison',counts:candidate.counts,...r},s):undefined}));
        refined.imagePassed=assess(refined);
        earlyPolishComparison={counts:candidate.counts.slice(),phase:candidate.phase,startedAtSeconds:(at-start)/1000,beforeError:candidate.originalImageError,afterError:refined.originalImageError,featuresPassed:refined.originalFeatures?.passed,geometryPassed:refined.geometryPassed,paperPassed:refined.paperPassed,accepted:refined.imagePassed,seconds:(performance.now()-at)/1000};
        if(refined.imagePassed){addCandidate(refined);candidate=refined;}
      }
    }
    stoppedEarly=!!(candidate.imagePassed&&candidate.originalImageError<=Math.min(.015,cfg.maxImageError*.5)&&cfg.earlyStop&&(!candidate.paperVerification||featureSeed(candidate)));
    if(i===0&&deferredRouting&&!candidates.some(c=>c.imagePassed)){
      deferredRouting.attempted=true;
      const until=Math.min(searchDeadline()-1300,performance.now()+coarseTopologySeconds*1000+1700);
      await attemptCoarseRouting(until);
      if(boundaryCandidate)addCandidate(boundaryCandidate);
    }
    if(i===0&&deferredFeatureRecovery&&!candidates.some(c=>c.imagePassed)){
      const seconds=Math.min(deferredFeatureRecovery.remainingSeconds,(searchDeadline()-performance.now()-2200)/1000);
      if(seconds>=.25){
        deferredFeatureRecovery.attempted=true;
        const before=recoveredCandidates.length,until=Math.min(searchDeadline()-1300,performance.now()+seconds*1000+700);
        const recovered=await attemptRecovery(seconds,'after_grid_refinement',until);
        if(recovered)return recovered;
        for(const proposal of recoveredCandidates.slice(before))addCandidate(proposal);
      }
    }
    if(i===0&&deferredRouting&&!candidates.some(c=>c.imagePassed)&&weakRegion!==null){
      deadline=Math.min(searchDeadline()-1300,performance.now()+8700);
      // Queue the proposal after the grid already tried, retaining every
      // ordinary finalist without repeating its clearance/refinement work.
      if(featureTimeAvailable())initializeEarlyFeature([weakRegion],weakRegion,'after-grid-refinement',i+1);
    }
    // Preserve the first refined checkpoint and all existing finalists. Only
    // unsuccessful feature retention earns this additional initialization;
    // regular successful designs and exhausted short budgets keep their path.
    if(!candidate.imagePassed&&candidate.originalFeatures?.missing.length&&!featureInitialization&&!symmetryRequested&&searchDeadline()-performance.now()>6500){
      const missed=candidate.originalFeatures.regions.flatMap((r,j)=>(r.retainedFraction<candidate.originalFeatures.minimumRetention||r.enclosureLost)?[j]:[]);
      featureSamplingContext={missed,counts:candidate.counts};
      const extra=stage('directInitializing',()=>initializeFeatureSeeds({source,features:sourceFeatures,missed,counts:candidate.counts,cfg,evidence,maximumCount}));
      featureInitialization={...extra.report,scheduled:Math.min(1,extra.seeds.length)};
      fine.splice(i+1,0,...extra.seeds.slice(0,1).map(r=>stage('directFitting',()=>fitSeed(r))));
      featureAlternatives=extra.seeds.slice(1,2);
      // A sound close fit with only crop-edge flecks missing is already the
      // useful fallback. Continuing ordinary layouts can also overfit those
      // flecks, adding visible seams elsewhere just to clear the feature gate.
      // Keep the fidelity warning; do not count this as an accepted image.
      if(!extra.report.emphasizedRegions&&candidate.paperPassed&&candidate.originalImageError<=cfg.maxImageError){
        featureInitialization.deferredBorderOnly=true;break;
      }
    }
    // A coarse routing may lose a feature or open it to the background during
    // refinement. Reuse one alternate from that same bounded initialization;
    // do not repeat count search or displace the ordinary finalists.
    if(featureSeed(candidate)&&candidate.originalFeatures?.missing.length&&featureAlternatives.length&&searchDeadline()-performance.now()>6500){
      const alternate=featureAlternatives.shift();
      fine.splice(i+1,0,stage('directFitting',()=>fitSeed(alternate)));
      featureInitialization.scheduled++;
      featureInitialization.featureRetry={counts:alternate.model.counts,controlPoints:alternate.model.k,phase:alternate.phase,reason:candidate.originalFeatures.enclosures?.opened?'opened':'lost'};
    }
    if(featureSeed(candidate)&&!candidates.some(c=>c.imagePassed)&&featureSamplingContext&&!samplingRecovery&&!symmetryRequested){
      const retry=samplingSeed('unsuccessful-refinement');
      if(retry)fine.splice(i+1,0,retry);
    }
    // The existing final preference always retains a supported-count fit
    // within 1 percentage point of the best image error. Since error cannot
    // be negative, a fully checked fit below 1% cannot lose to another count.
    // Keep every already scheduled same-count alternative eligible.
    const supportedWinner=candidate.imagePassed&&!weights&&supportedCounts&&
      candidate.counts.every((count,j)=>count===supportedCounts[j])&&
      Number.isFinite(candidate.originalImageError)&&candidate.originalImageError>=0&&candidate.originalImageError<=SUPPORTED_COUNT_ERROR_ALLOWANCE&&
      !fine.slice(i+1).some(r=>r.model.counts.every((count,j)=>count===supportedCounts[j]));
    if(supportedWinner){
      countSearchBound={reason:'supported-count-error-bound',counts:candidate.counts.slice(),sourceImageError:candidate.originalImageError,allowance:SUPPORTED_COUNT_ERROR_ALLOWANCE,skippedFineCounts:fine.slice(i+1).map(r=>r.model.counts.slice())};
      break;
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
    // Resolving uncertainty inside refinement must retain the same simpler
    // layout comparison as resolving its retained alternative afterwards.
    const compareSimpler=i===fine.length-1&&!weights&&candidates.some(c=>c.imagePassed)&&!candidates.some(c=>c.imagePassed&&!finerRefinement(c))&&remainingSeeds.length;
    if(candidate.imagePassed&&!simplerRemaining&&!ordinaryFinalistsRemain&&!compareSimpler)break;
    // Three seeds are the fast path, not evidence that other routings fail.
    // Spend a longer requested budget on an untried layout only when none of
    // the refined candidates passed the original image, feature and paper
    // checks. Keep the successful fast path and the finalization reserve.
    // A finer-verified fallback also deserves a simpler-layout comparison:
    // the maple leaf's useful three-cut seed lies outside the first shortlist.
    // Once all ordinary finalists have run, compare competitive simpler seeds
    // directly instead of exhausting the allowance on more elaborate grids.
    // Unresolved and weighted fits keep their original continuation order.
    const comparisonTime=searchDeadline()-performance.now()>4500;
    if(i===fine.length-1&&!candidates.some(c=>c.imagePassed&&!finerRefinement(c))&&remainingSeeds.length&&(compareSimpler||comparisonTime)){
      const acceptedCounts=candidates.filter(c=>c.imagePassed).map(c=>c.counts.slice()),simplify=acceptedCounts.length>0&&!weights;
      const next=simplify?simplerComparisonSeed(remainingSeeds,coarse,acceptedCounts):remainingSeeds[0];
      // Reviewing the existing scores is cheap even when another fit cannot
      // start. Record a deferred candidate instead of hiding it or consuming
      // the final polishing/export reserve.
      extraGridComparisons.push({reason:simplify?'simpler-layout':'unresolved-fit',acceptedCounts,selectedCounts:next?.model.counts.slice()||null,phase:next?.phase??null,...(next&&!comparisonTime?{deferred:'budget'}:{})});
      if(next&&comparisonTime){remainingSeeds.splice(remainingSeeds.indexOf(next),1);fine.push(stage('directFitting',()=>fitSeed(next)));}
    }
  }
  candidates.sort((a,b)=>Number(b.paperPassed)-Number(a.paperPassed)||Number(b.geometryPassed)-Number(a.geometryPassed)||Number(b.imagePassed)-Number(a.imagePassed)||a.selectionScore-b.selectionScore);
  // Prefer the boundary-supported slit counts when their independently
  // measured image error is within one percentage point of the best fit.
  // This is deliberately applied after geometry and feature gates, so a
  // simpler but physically invalid or feature-losing fit can never win.
  const validCandidates=candidates.filter(c=>c.imagePassed),bestError=validCandidates.reduce((best,c)=>Math.min(best,c.originalImageError),Infinity);
  if(validCandidates.length&&supportedCounts&&!weights){
    const simple=validCandidates.filter(c=>c.counts.every((count,j)=>count===supportedCounts[j])&&c.originalImageError<=bestError+SUPPORTED_COUNT_ERROR_ALLOWANCE).sort((a,b)=>a.originalImageError-b.originalImageError)[0];
    if(simple){
      const rest=candidates.filter(c=>c!==simple);
      candidates.splice(0,candidates.length,simple,...rest);
    }
  }
  let candidate=candidates[0];
  // Keep the established detail pass for jointly rerouted feature seeds.
  if(candidate.seed==='feature-preserving-grid'&&candidate.paperVerification?.source!=='feature-detail-refinement')candidate=await refineFeatureDetail(candidate);
  // A long search can leave only a fraction of its comparison window for
  // cleanup. Sharing then changes the geometry just as polishing runs out of
  // time, making final fidelity depend on small timing differences. Use some
  // of the unused requested budget to finish both bounded passes. Ordinary
  // fast fits and short requests retain their existing deadlines; keep the
  // finalization reserve inside the user's hard allowance.
  const cleanupStart=performance.now(),cleanupBefore=deadline,completedFeatureRepair=candidate.clampedFeatureRecovery?.applied===true;
  // An early feature correction already earned the bounded comparison path;
  // optional cleanup must not reopen that deliberately completed search.
  if(!completedFeatureRepair&&!shortBudget&&cleanupStart-start>=fastSeconds*1000)deadline=Math.min(start+cfg.timeLimit*1000-1300,Math.max(deadline,cleanupStart+6500));
  const cleanupBudget={startedAtSeconds:(cleanupStart-start)/1000,previousSeconds:(cleanupBefore-cleanupStart)/1000,availableSeconds:(deadline-cleanupStart)/1000,addedSeconds:(deadline-cleanupBefore)/1000};
  // This optional early pass precedes polishing. The final selected pair also
  // receives sharing recovery after any matching-sheet replacement.
  if(!featureDetail?.applied&&!candidate.matching?.identical&&!symmetryRequested&&candidate.paperPassed&&performance.now()<deadline-1300){
    const sharingCfg=verifiedPaperSettings({report:{paperVerification:candidate.paperVerification}},cfg);
    const shared=stage('directSharing',()=>recoverShared(candidate,prob,n,sharingCfg,{deadline:deadline-1300,input,weights:fitWeights}));
    if(assess(shared)&&shared.originalImageError<=candidate.originalImageError)candidate={...shared,seed:candidate.seed};
  }
  let outlineDetail=null,cleanupContinuation=null;
  // Shared-cut recovery has variable cost and can consume nearly the entire
  // cleanup window. A long caller with unused time must still fund a bounded
  // full-resolution polish, rather than receiving only its first few steps.
  const polishingStart=performance.now(),beforePolishing=deadline;
  if(!completedFeatureRepair&&!featureDetail?.applied&&candidate.paperPassed&&cleanupBudget.addedSeconds>0)deadline=Math.min(start+cfg.timeLimit*1000-1300,Math.max(deadline,polishingStart+4000));
  cleanupBudget.polishingExtensionSeconds=(deadline-beforePolishing)/1000;
  if(!featureDetail?.applied&&candidate.paperPassed&&performance.now()<deadline-450){
    const polishing=orbitObjective(Float64Array.from(source.mask),source.resolution,orbit,weights);
    let polished=stage('directPolishing',()=>polishCandidate(candidate,polishing.probability,source.resolution,{...cfg,preferMatchingSheets:false},{input,weights:polishing.weights,steps:160,rate:.008,deadline:deadline-250,selection:'mask',identicalSheets:candidate.matching?.identical||false,onProgress:hasCandidateObserver(onProgress)?(r,solution)=>onProgress({stage:'directPolishing',counts:candidate.counts,...r},solution):undefined}));
    polished.imagePassed=assess(polished,{approximationReference:candidate});
    // The ordinary refiner return prioritizes a coarse paper pass. A better
    // geometry-valid checkpoint can remain uncertain only because that paper
    // lattice is too coarse. Recheck the retained coordinates before losing
    // them, even when the ordinary polish is already an acceptable fit.
    if((polished.paperVerification?.resolution??cfg.materialResolution)<700&&polished.paperAlternative&&(!polished.imagePassed||polished.paperAlternative.error<polished.error)){
      const alternative={...polished,...polished.paperAlternative,paperAlternative:null,paperVerification:null};
      alternative.imagePassed=assess(alternative);
      if(alternative.imagePassed&&alternative.originalImageError<candidate.originalImageError&&(!polished.imagePassed||alternative.originalImageError<polished.originalImageError)){
        alternative.paperVerification={...alternative.paperVerification,source:'polishing-alternative',incumbentImageError:polished.originalImageError};
        polished=alternative;
      }
    }
    // A better polish may still stop at the extra clearance cushion. Try the
    // same checked correction before discarding it, keeping time for export.
    if(!polished.imagePassed&&polished.originalImageError<=candidate.originalImageError)polished=recoverClampedCandidate(polished,{reserve:500,phase:'polishing'})||polished;
    // Additional parameters must improve the source fit. An unchanged
    // subdivision is not a useful replacement for the simpler incumbent.
    // Keep a better legal approximation even when neither fit meets the
    // image limit. That limit still controls the final mismatch warning;
    // it must not discard useful work or weaken geometry/paper/feature gates.
    const polishValid=polished.geometryPassed&&polished.paperPassed&&(polished.originalFeatures?.passed||polished.approximationImproves);
    const polishAccepted=polishValid&&(polished.outlineDetail?polished.originalImageError<candidate.originalImageError:polished.originalImageError<=candidate.originalImageError);
    if(polished.outlineDetail)outlineDetail={...polished.outlineDetail,applied:polishAccepted,errorBefore:candidate.originalImageError,errorAfter:polished.originalImageError,steps:polished.steps,geometryPassed:polished.geometryPassed,paperStatus:polished.paper?.status};
    if(polishAccepted)candidate=polished;
    // A fixed 160-step polish may still be improving when a long request has
    // ample unused time. Continue the checked trajectory instead of making
    // the returned quality depend on which earlier timed checkpoint seeded
    // that pass. A fast fit may use only its existing cleanup remainder;
    // exhausted callers and newly subdivided outlines keep their work. Every
    // replacement still faces the same source, feature and physical gates.
    const middle=polished.history.find(h=>h.step>=80&&h.geometry&&h.paper==='pass');
    const continuationStart=performance.now(),hardCleanupDeadline=start+cfg.timeLimit*1000-1300;
    const continuationDeadline=cleanupBudget.addedSeconds>0?Math.min(hardCleanupDeadline,continuationStart+4000):deadline;
    if(!completedFeatureRepair&&polishAccepted&&polished.imagePassed&&!polished.outlineDetail&&polished.steps===160&&middle&&polished.error<middle.error
      &&continuationDeadline-continuationStart>=1000){
      deadline=continuationDeadline;
      const next=stage('directPolishing',()=>polishCandidate(candidate,polishing.probability,source.resolution,{...cfg,preferMatchingSheets:false},{input,weights:polishing.weights,steps:480,rate:.008,deadline:deadline-250,selection:'mask',identicalSheets:candidate.matching?.identical||false,onProgress:hasCandidateObserver(onProgress)?(r,solution)=>onProgress({stage:'directPolishing',counts:candidate.counts,...r},solution):undefined}));
      next.imagePassed=assess(next);
      const applied=next.imagePassed&&next.originalImageError<candidate.originalImageError;
      cleanupContinuation={reason:'polish_still_improving',budgetSeconds:(deadline-continuationStart)/1000,seconds:(performance.now()-continuationStart)/1000,
        errorBefore:candidate.originalImageError,errorAfter:next.originalImageError,initialSteps:polished.steps,steps:next.steps,geometryPassed:next.geometryPassed,paperPassed:next.paperPassed,applied};
      if(applied)candidate=next;
    }
  }
  // A feature-complete layout just above the image limit can still improve
  // during full-resolution polishing. A lower-error layout missing a motif
  // detail is not a valid incumbent. Preserve its ordinary cleanup first,
  // then use otherwise unused requested time for one complete alternative.
  // This is the same eligibility band used by polishCandidate's outline pass;
  // acceptance still requires every unchanged source-image and physical gate.
  let cleanupComparison=null;
  if(!shortBudget&&!candidate.imagePassed)candidate.imagePassed=assess(candidate);
  if(!shortBudget&&!candidate.imagePassed){
    const alternative=candidates.filter(c=>c!==candidate&&c.geometryPassed&&c.paperPassed&&c.originalFeatures?.passed&&c.originalImageError<=cfg.maxImageError+.01)
      .sort((a,b)=>a.originalImageError-b.originalImageError)[0];
    const comparisonStarted=performance.now(),comparisonDeadline=Math.min(start+cfg.timeLimit*1000-1300,comparisonStarted+6500);
    if(alternative&&comparisonDeadline-comparisonStarted>1800){
      const polishing=orbitObjective(Float64Array.from(source.mask),source.resolution,orbit,weights);
      const refined=stage('directPolishing',()=>polishCandidate(alternative,polishing.probability,source.resolution,{...cfg,preferMatchingSheets:false},{input,weights:polishing.weights,steps:160,rate:.008,deadline:comparisonDeadline-250,selection:'mask',identicalSheets:alternative.matching?.identical||false,onProgress:hasCandidateObserver(onProgress)?(r,solution)=>onProgress({stage:'directPolishing',detail:'feature-complete-comparison',counts:alternative.counts,...r},solution):undefined}));
      refined.imagePassed=assess(refined);
      cleanupComparison={beforeCounts:candidate.counts,beforeError:candidate.originalImageError,proposedCounts:alternative.counts,proposedError:alternative.originalImageError,accepted:refined.imagePassed,finalError:refined.originalImageError,featuresPassed:refined.originalFeatures?.passed,geometryPassed:refined.geometryPassed,paperPassed:refined.paperPassed,steps:refined.steps,seconds:(performance.now()-comparisonStarted)/1000};
      if(refined.imagePassed)candidate=refined;
    }
  }
  const solution=candidate.graph.solution(candidate.points,candidate.phase,input);
  const paper={passed:candidate.paperPassed};
  solution.report={countSearch:countSearchReport,finalistPreference,deferredRouting,deferredFeatureRecovery,...(recoveryHistory.length>1?{featureRecoveryAttempts:recoveryHistory}:{}),algorithm:'direct-bezier',numericalBackend,imported:false,termination:!candidate.geometryPassed?'geometry_failure':!paper.passed?'paper_failure':candidate.originalImageError>cfg.maxImageError?'image_mismatch':'candidate_found',seconds:(performance.now()-start)/1000,
    earlyPolishComparison,stoppedEarly,cleanupBudget,cleanupContinuation,cleanupComparison,countSearchBound,clearanceComparison,initialGeometryComparison,extraGridComparisons,earlyClampedFeatureRecovery,clampedFeatureRecovery:candidate.clampedFeatureRecovery,refinementFeaturesPassed:candidate.originalFeatures?.passed,refinementBudget:{requestedSeconds:cfg.timeLimit,maximumSearchSeconds:searchSeconds(),verifiedAlternative},earlyFeatureInitialization,featureInitialization,samplingRecovery,featureDetail,featureDetailAttempts,outlineDetail,paperVerification:candidate.paperVerification,matchingPreference:{enabled:cfg.preferMatchingSheets,...matchingEvidence,...matchingSummary(solution),identicalCandidateBonus:0},optimizationResolution:n,sourceResolution:source.resolution,scaleSampling:'Each fitting scale is area-resampled directly from the original classified source; no chained downsampling',initialization:'Fresh ordered grids, soft border endpoint proposals and alternating row dynamic programming; independent shapes for both sheets',countsSearched:attempts.filter(a=>a.stage==='coarse').map(a=>({counts:a.counts,phase:a.phase})),attempts,selectedCounts:candidate.counts,candidates:candidates.map(c=>({counts:c.counts,phase:c.phase,seed:c.seed||'grid',error:c.error,sourceImageError:c.originalImageError,imagePassed:c.imagePassed,featuresPassed:c.originalFeatures?.passed,enclosuresOpened:c.originalFeatures?.enclosures?.opened,score:c.score,geometry:c.geometryPassed,paper:c.paperPassed,paperVerification:c.paperVerification})),
    ...(geometryRecovery.length?{geometryRecovery}:{}),borderEvidence:evidence,supportedBorderCounts:supportedBorderCounts(evidence),borderCountsAreHardConstraints:false,traceUsed:['coarse-boundary-topology','feature-recovery'].includes(candidate.seed),cornerTopologyInitialization:cornerTopology?.report,...(cornerComparison?{cornerTopologyComparison:cornerComparison}:{}),featureRoutingFirst,topologyInitialization:topology?.report,coarseTopologyInitialization:coarseTopology?.report,selectedInitialization:candidate.seed||'grid',featureRecovery:recovery?.report||null,freeCoordinates:'Both coordinates of anchors and handles; endpoints remain on assigned sides',stages:timings,checkpoints:candidate.history,localFeaturePolish:candidate.localFeaturePolish,sharing:candidate.sharing||{accepted:[],rejected:[]},estimatedMaskMismatch:candidate.error,minimumNominalWidth:cfg.nominalWidth,physicalAssemblyTested:false};
  return solution;
}
