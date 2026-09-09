/** Optional topology initialization for the common Bézier optimizer.
 * Curves and straight spans coexist in one boundary graph; no image-style gate.
 */
import {preprocessMask,sampleTarget} from '../input.js';
import {transposeTarget} from '../symmetry.js';
import {buildGraph,curvesOf} from '../graph.js';
import {solveGraph} from '../solver.js';
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

export function prepareBoundary(input,cfg,{useInitializationGuide=true,guidePhase=0}={}){
  if(useInitializationGuide&&guidePhase===0&&input.boundarySeed?.width===cfg.width)return input.boundarySeed;
  const source=input.sourceImage,tolerance=Math.max(.35,1.2*cfg.width/source.resolution);
  const mask=useInitializationGuide?initializationMask(source,guidePhase):source.mask;
  const trace=fitTolerance=>preprocessMask(mask,source.resolution,{...cfg,fitTolerance,maxSpan:40,smoothRadius:0,snapRadius:0,borderRadius:0,polygonal:false,mixedBoundaries:true},input.metadata.preprocessing);
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

export async function initializeTopology(input,cfg,{maximumError=.005,seconds=3,onProgress=()=>{}}={}){
  const source=input.sourceImage,weights=source.weights?sourceWeights(source):null;
  if(!weights?.some(w=>w===0))return initializeTopologyPhase(input,cfg,{maximumError,seconds,onProgress});
  // A free band's two colour phases can have very different paper routings.
  // Trying one phase for the whole allocation can spend it rejecting necks,
  // while the other phase has a simple valid weave. Neither is a target: score
  // both against the same protected artwork, and leave time for curve fitting.
  const start=performance.now(),budget=Math.min(seconds,2.5),attempts=[],candidates=[];
  let last;
  for(const guidePhase of [0,1]){
    const remaining=budget-(performance.now()-start)/1000;if(remaining<.1)break;
    last=await initializeTopologyPhase(input,cfg,{maximumError,seconds:Math.min(1.25,remaining),onProgress,guidePhase});
    last.report.guidePhase=guidePhase;attempts.push(last.report);
    if(last.graph){candidates.push(last);if(last.report.imageError===0)break;}
  }
  candidates.sort((a,b)=>a.report.imageError-b.report.imageError);
  const selected=candidates[0]||last||{report:{method:'mixed-boundary-topology',accepted:false}};
  return{...selected,report:{...selected.report,guidePhases:attempts,guideBudgetSeconds:budget,seconds:(performance.now()-start)/1000}};
}

async function initializeTopologyPhase(input,cfg,{maximumError,seconds,onProgress,guidePhase=0}){
  const start=performance.now(),source=input.sourceImage,report={method:'mixed-boundary-topology',accepted:false};
  try{
    let target=prepareBoundary(input,cfg,{guidePhase});
    report.boundarySegments=target.curves.length;
    if(target.metadata.boundarySimplification)report.boundarySimplification=target.metadata.boundarySimplification;
    report.traceError=maskDisagreement(source,sampleTarget(target,source.resolution));
    // An initializer that already loses the image cannot improve a good grid.
    if(!target.curves.length||target.curves.length>160||report.traceError>maximumError)return{report};
    const guideSource=source.weights?{mask:initializationMask(source,guidePhase),resolution:source.resolution}:source;
    if(symmetryEvidence(guideSource).minimumIdenticalImageError<=.005){target=transposeTarget({...target,sourceImage:guideSource});target.sourceImage=source;report.matchingProposal=true;}
    const graphCfg=settings({...cfg,...MATCHING_GRID_PRESET,maxTurn:cfg.maxTurn,localNeighborhoodFactor:cfg.localNeighborhoodFactor,timeLimit:Math.max(.1,seconds-(performance.now()-start)/1000)});
    const graph=buildGraph(target,graphCfg,{onProgress});
    const solution=await solveGraph(graph,graphCfg,{onProgress,coefficientQuantum:1e-7,stopAfterValidated:true,coreGate:cfg.requireMaterialCore?s=>materialAudit(s,cfg):null});
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
