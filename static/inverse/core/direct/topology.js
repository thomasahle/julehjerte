/** Optional topology initialization for the common Bézier optimizer.
 * Curves and straight spans coexist in one boundary graph; no image-style gate.
 */
import {preprocessMask,sampleTarget} from '../input.js';
import {transposeTarget} from '../symmetry.js';
import {buildGraph,curvesOf,reindex,inspectBoundaryEndpoints} from '../graph.js';
import {solveBoundary} from '../routing.js';
import {sampleWeave} from '../validate.js';
import {materialAudit} from '../material.js';
import {auditImageFeatures} from '../image-features.js';
import {settings} from '../settings.js';
import {MATCHING_GRID_PRESET} from '../presets.js';
import {symmetryEvidence} from './matching.js';
import {maskDisagreement} from './prefer-matching.js';
import {CurveGraph} from './curves.js';
import {symmetryTies} from './symmetry.js';
import {initializationMask,sourceWeights} from '../image-reference.js';

export function prepareBoundary(input,cfg,{useInitializationGuide=true,guidePhase=0,borderRadius=0}={}){
  if(useInitializationGuide&&guidePhase===0&&borderRadius===0&&input.boundarySeed?.width===cfg.width)return input.boundarySeed;
  const source=input.sourceImage,tolerance=Math.max(.35,1.2*cfg.width/source.resolution);
  const mask=useInitializationGuide?initializationMask(source,guidePhase):source.mask;
  const trace=fitTolerance=>preprocessMask(mask,source.resolution,{...cfg,fitTolerance,maxSpan:40,smoothRadius:0,snapRadius:0,borderRadius,polygonal:false,mixedBoundaries:true},input.metadata.preprocessing);
  let target=trace(tolerance);
  // Upsampling a binary mask makes its old pixel stairs look like deliberate
  // tiny corners. Try a smaller graph before handing hundreds of redundant
  // turns to the MILP. This changes only the initialization, and every proposal
  // is measured against the original mask, including its small features.
  if(target.curves.length>64){
    // A protected motif can occupy much less than the square: a 0.2% weighted
    // cap can reject a straight outline over just a few raster stairs. Use the
    // topology initializer's 0.5% cap for explicitly free borders; the original
    // weighted image and feature checks still decide which solutions survive.
    const attempts=[],maximumError=source.weights?.some(w=>w===0)?.005:.002;
    for(const fitTolerance of [.005*cfg.width,.006*cfg.width,.0075*cfg.width]){
      if(fitTolerance<=tolerance)continue;
      const candidate=trace(fitTolerance),woven=sampleTarget(candidate,source.resolution),error=maskDisagreement(source,woven);
      const accepted=candidate.curves.length<target.curves.length&&error<=maximumError&&auditImageFeatures(source,woven,cfg.width).passed;
      attempts.push({fitTolerance,segments:candidate.curves.length,imageError:error,maximumError,accepted});
      if(accepted)target=candidate;
    }
    target.metadata.boundarySimplification=attempts;
  }
  target.sourceImage=source;
  return target;
}

function endpointIssue(target,cfg){
  const graph=reindex({target,edges:target.curves.map(curve=>({curve,visible:true}))});
  return inspectBoundaryEndpoints(graph,cfg.nominalWidth).issue?.message??null;
}

/** Recover a routing seed from noisy edges without editing its image reference.
 * Only impossible endpoint counts/spacing trigger the inward-profile proposals.
 * The smallest repair must pass the original image and feature gates first.
 */
export function prepareTopologyBoundary(input,cfg,{maximumError=.005,guidePhase=0}={}){
  const original=prepareBoundary(input,cfg,{guidePhase}),source=input.sourceImage,issue=endpointIssue(original,cfg);
  if(!issue||source.weights)return{target:original};
  const report={trigger:issue,accepted:false,attempts:[]};
  for(const borderRadius of [.5,1,2,3]){
    const target=prepareBoundary(input,cfg,{guidePhase,borderRadius}),woven=sampleTarget(target,source.resolution),error=maskDisagreement(source,woven),problem=endpointIssue(target,cfg);
    const accepted=!problem&&target.curves.length>0&&target.curves.length<=160&&error<=maximumError&&auditImageFeatures(source,woven,cfg.width).passed;
    report.attempts.push({borderRadius,imageError:error,endpointIssue:problem,segments:target.curves.length,accepted});
    if(accepted){report.accepted=true;report.borderRadius=borderRadius;report.border=target.metadata.preprocessing.border;return{target,report};}
  }
  return{target:original,report};
}

/** A small routing portfolio for poor grid fits. Coarsening changes only the
 * seed; its source pixels and the final geometry/paper gates are unchanged.
 */
export async function initializeCoarseTopology(input,cfg,{maximumError=Math.min(.025,cfg.maxImageError),seconds=2.5,onProgress=()=>{}}={}){
  const started=performance.now(),source=input.sourceImage,report={method:'coarse-boundary-topology',maximumError,accepted:false,attempts:[]},candidates=[];
  const remaining=()=>seconds-(performance.now()-started)/1000;
  if(source.weights)return{report};
  for(const borderRadius of [...new Set([.01,.02,.03].map(v=>Math.min(3,v*cfg.width)))])for(const tolerance of [.01,.015]){
    if(remaining()<.1)break;
    const options={fitTolerance:Math.min(3,tolerance*cfg.width),smoothRadius:.003*cfg.width,snapRadius:Math.min(3,.0075*cfg.width),borderRadius,maxSpan:40,polygonal:false,mixedBoundaries:true};
    const attempt={preprocessing:options};report.attempts.push(attempt);
    try{
      const target=preprocessMask(source.mask,source.resolution,{...cfg,...options},input.metadata.preprocessing);
      target.sourceImage=source;
      const woven=sampleTarget(target,source.resolution),error=maskDisagreement(source,woven),problem=endpointIssue(target,cfg),featuresPassed=auditImageFeatures(source,woven,cfg.width).passed;
      Object.assign(attempt,{segments:target.curves.length,imageError:error,endpointIssue:problem,featuresPassed});
      if(!problem&&featuresPassed&&error<=maximumError&&target.curves.length>0&&target.curves.length<=64)candidates.push({target,attempt});
    }catch(error){attempt.error=error.message;}
  }
  candidates.sort((a,b)=>a.attempt.segments-b.attempt.segments||a.attempt.imageError-b.attempt.imageError);
  for(const {target,attempt}of candidates.slice(0,2)){
    if(remaining()<.1)break;
    const seed=await initializeTopology({...input,boundarySeed:target},cfg,{maximumError,seconds:remaining(),onProgress});
    attempt.routing=seed.report;
    if(seed.graph){report.accepted=true;report.seconds=(performance.now()-started)/1000;return{...seed,report};}
  }
  report.seconds=(performance.now()-started)/1000;
  return{report};
}

export async function initializeTopology(input,cfg,{maximumError=.005,seconds=3,onProgress=()=>{}}={}){
  const source=input.sourceImage,weights=source.weights?sourceWeights(source):null;
  if(!weights?.some(w=>w===0))return initializeTopologyPhase(input,cfg,{maximumError,seconds,onProgress});
  // Probe both free-band phases as LPs before spending the small budget on
  // branch-and-bound. Integral LP answers still face the original binary,
  // geometry, image and paper checks. Fractional answers are never rounded.
  const start=performance.now(),budget=Math.min(seconds,2.5),phases=[],candidates=[];
  const remaining=()=>budget-(performance.now()-start)/1000;
  for(const guidePhase of[0,1]){
    if(remaining()<.1)break;
    const at=performance.now(),prepared=prepareTopologyPhase(input,cfg,{maximumError,guidePhase,onProgress});
    phases.push({guidePhase,prepared,elapsed:(performance.now()-at)/1000,last:null,probe:null});
  }
  const run=async(entry,allocation,relaxationOnly)=>{
    const at=performance.now(),result=await initializeTopologyPhase(input,cfg,{maximumError,seconds:allocation,onProgress,guidePhase:entry.guidePhase,prepared:entry.prepared,relaxationOnly});
    entry.elapsed+=(performance.now()-at)/1000;result.report.guidePhase=entry.guidePhase;entry.last=result;
    if(relaxationOnly)entry.probe=result.report;
    if(result.graph)candidates.push(result);
  };
  for(const entry of phases){
    if(!entry.prepared.graph||remaining()<.1)continue;
    await run(entry,Math.min(.5,Math.max(.1,budget*.2),remaining()),true);
  }
  if(!candidates.length){
    const fallback=phases.filter(p=>p.prepared.graph&&p.probe?.solver?.termination!=='candidate_graph_exhausted');
    for(const [i,entry]of fallback.entries()){
      if(remaining()<.1)break;
      await run(entry,Math.min(1.25,remaining()/(fallback.length-i)),false);
      if(entry.last.graph&&entry.last.report.imageError===0)break;
    }
  }
  candidates.sort((a,b)=>a.report.imageError-b.report.imageError);
  const attempts=phases.map(p=>({...p.last?.report||p.prepared.report,guidePhase:p.guidePhase,seconds:p.elapsed,
    ...(p.probe&&p.probe!==p.last?.report?{relaxation:p.probe}:{})}));
  const selected=candidates[0]||phases.at(-1)?.last||{report:{method:'mixed-boundary-topology',accepted:false}};
  return{...selected,report:{...selected.report,guidePhases:attempts,guideBudgetSeconds:budget,seconds:(performance.now()-start)/1000}};
}

function prepareTopologyPhase(input,cfg,{maximumError,guidePhase,onProgress}){
  const source=input.sourceImage,report={method:'mixed-boundary-topology',accepted:false};
  try{
    const boundary=prepareTopologyBoundary(input,cfg,{maximumError,guidePhase});
    let target=boundary.target;
    if(boundary.report)report.borderRecovery=boundary.report;
    report.boundarySegments=target.curves.length;
    if(target.metadata.boundarySimplification)report.boundarySimplification=target.metadata.boundarySimplification;
    report.traceError=maskDisagreement(source,sampleTarget(target,source.resolution));
    // An initializer that already loses the image cannot improve a good grid.
    if(!target.curves.length||target.curves.length>160||report.traceError>maximumError)return{report};
    const guideSource=source.weights?{mask:initializationMask(source,guidePhase),resolution:source.resolution}:source;
    if(symmetryEvidence(guideSource).minimumIdenticalImageError<=.005){target=transposeTarget({...target,sourceImage:guideSource});target.sourceImage=source;report.matchingProposal=true;}
    const graphCfg=settings({...cfg,...MATCHING_GRID_PRESET,maxTurn:cfg.maxTurn,localNeighborhoodFactor:cfg.localNeighborhoodFactor});
    const seed={...target,curves:target.curves.slice()};
    return{graph:buildGraph(target,graphCfg,{onProgress}),target:seed,cfg:graphCfg,report};
  }catch(error){report.error=error.message;return{report};}
}

async function initializeTopologyPhase(input,cfg,{maximumError,seconds,onProgress,guidePhase=0,prepared=null,relaxationOnly=false}){
  const start=performance.now(),source=input.sourceImage;
  const phase=prepared||prepareTopologyPhase(input,cfg,{maximumError,guidePhase,onProgress}),report={...phase.report};
  try{
    if(!phase.graph)return{report};
    const graphCfg=settings({...phase.cfg,timeLimit:Math.max(.1,seconds-(performance.now()-start)/1000),...(relaxationOnly?{maxRounds:1}:{})});
    const solution=await solveBoundary(phase.target,graphCfg,{initialGraph:phase.graph,onProgress,coefficientQuantum:1e-7,stopAfterValidated:true,relaxationOnly,coreGate:cfg.requireMaterialCore?s=>materialAudit(s,cfg):null});
    report.solver=solution.report;report.imageError=maskDisagreement(source,sampleWeave(solution,source.resolution));
    if(report.imageError>maximumError||!auditImageFeatures(source,sampleWeave(solution,source.resolution),cfg.width).passed)return{report};
    const paths=solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(c=>c.p)));
    const curveGraph=new CurveGraph(paths,cfg.width),ties=symmetryTies(curveGraph,cfg.symmetry);
    if(ties&&(ties.skipped.length||ties.conflicts.length)){
      report.symmetryRejected={skipped:ties.skipped,conflicts:ties.conflicts};return{report};
    }
    report.accepted=true;
    return{graph:curveGraph,phase:solution.graph.target.phase?-1:1,report};
  }catch(error){report.error=error.message;report.solver=error.report;return{report};}
  finally{report.seconds=(performance.now()-start)/1000;}
}
