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

export function prepareBoundary(input,cfg){
  if(input.boundarySeed?.width===cfg.width)return input.boundarySeed;
  const source=input.sourceImage,target=preprocessMask(source.mask,source.resolution,{...cfg,fitTolerance:Math.max(.35,1.2*cfg.width/source.resolution),maxSpan:40,smoothRadius:0,snapRadius:0,borderRadius:0,polygonal:false,mixedBoundaries:true},input.metadata.preprocessing);
  target.sourceImage=source;
  return target;
}

export async function initializeTopology(input,cfg,{maximumError=.005,seconds=3,onProgress=()=>{}}={}){
  const start=performance.now(),source=input.sourceImage,report={method:'mixed-boundary-topology',accepted:false};
  try{
    let target=prepareBoundary(input,cfg);
    report.boundarySegments=target.curves.length;
    report.traceError=maskDisagreement(source,sampleTarget(target,source.resolution));
    // An initializer that already loses the image cannot improve a good grid.
    if(!target.curves.length||target.curves.length>160||report.traceError>maximumError)return{report};
    if(symmetryEvidence(source).minimumIdenticalImageError<=.005){target=transposeTarget(target);report.matchingProposal=true;}
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
