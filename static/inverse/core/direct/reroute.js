/** Reassign a close fitted boundary after local refinement changes its topology.
 * Rejected geometry is only an image-derived proposal. The small MILP must
 * independently earn geometry, feature and paper validity before it is usable.
 */
import {solveBoundary} from '../routing.js';
import {curvesOf} from '../graph.js';
import {materialAudit} from '../material.js';
import {sampleTarget} from '../input.js';
import {sampleWeave} from '../validate.js';
import {auditFeatureFidelity} from '../feature-shapes.js';
import {maskDisagreement} from './prefer-matching.js';
import {CurveGraph} from './curves.js';
import {requestedSymmetry} from '../settings.js';

export async function rerouteFittedBoundary(proposal,input,cfg,{seconds=1.5,onProgress=()=>{}}={}){
  const started=performance.now(),source=input.sourceImage;
  const report={method:'fitted-boundary-rerouting',accepted:false};
  try{
    if(requestedSymmetry(cfg.symmetry).length||seconds<.1)return{report};
    // Graph construction nodes its target in place. Preserve both the live
    // candidate and its source image for any subsequent refinement/fallback.
    const target={...proposal.graph.target,curves:proposal.graph.target.curves.slice(),sourceImage:source};
    report.boundarySegments=target.curves.length;
    if(!target.curves.length||target.curves.length>200)return{report};
    const predicted=sampleTarget(target,source.resolution);
    report.proposalError=maskDisagreement(source,predicted);
    report.proposalFeaturesPassed=auditFeatureFidelity(source,predicted,cfg).passed;
    if(report.proposalError>cfg.maxImageError||!report.proposalFeaturesPassed)return{report};
    // A fitted boundary already has both families' crossings. Inferred grid
    // portals add many irrelevant choices; start with just nearby connectors.
    const routeCfg={...cfg,gridPortals:false,neighbors:2,connectorVariants:1,timeLimit:Math.max(.001,seconds-(performance.now()-started)/1000)};
    const solution=await solveBoundary(target,routeCfg,{onProgress,expandNeighbors:false,coefficientQuantum:1e-7,stopAfterValidated:true,
      coreGate:cfg.requireMaterialCore?s=>materialAudit(s,cfg):null});
    report.solver=solution.report;
    const woven=sampleWeave(solution,source.resolution);
    report.imageError=maskDisagreement(source,woven);
    report.featuresPassed=auditFeatureFidelity(source,woven,cfg).passed;
    if(report.imageError>cfg.maxImageError||!report.featuresPassed)return{report};
    const graph=new CurveGraph(solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(c=>c.p))),cfg.width);
    report.accepted=true;
    return{graph,phase:solution.graph.target.phase?-1:1,report};
  }catch(error){report.error=error.message;report.solver=error.report;return{report};}
  finally{report.seconds=(performance.now()-started)/1000;}
}
