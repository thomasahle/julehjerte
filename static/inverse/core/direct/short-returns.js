/** Remove short out-and-back runs as a topology proposal for the main fitter.
 * An image gradient can move a spur without removing its redundant corner.
 * Short edges contract at real shared junctions; every adjacent curve follows.
 * Independent coincident branches and fixed slit endpoints stay intact.
 */
import {Cubic,distance,turnAngle} from '../bezier.js';
import {curvesOf} from '../graph.js';
import {sampleWeave} from '../validate.js';
import {auditImageFeatures} from '../image-features.js';
import {referenceError,sourceWeights} from '../image-reference.js';
import {CurveGraph} from './curves.js';
import {refineCurves} from './refine.js';
import {matchingSummary} from './matching.js';
import {orbitObjective,symmetryOrbit,symmetryReport} from './symmetry.js';

const pointKey=p=>p.map(v=>Math.round(v*1e7)).join(',');

export function shortReturnProposal(graph,points,cfg){
  const controls=graph.controls(points),curves=controls.map(c=>new Cubic(c)),vertices=new Map(),plans=new Map(),removed=new Set();
  const endpoint=(entry,start)=>graph.edges[entry[0]][start?(entry[1]===1?0:3):(entry[1]===1?3:0)];
  for(const ids of graph.edges)for(const id of [ids[0],ids[3]]){
    const key=pointKey([points[2*id],points[2*id+1]]);
    if(!vertices.has(key))vertices.set(key,new Set());vertices.get(key).add(id);
  }
  for(const [a,b]of graph.joins){
    const joint=endpoint(a,false);
    if(joint!==endpoint(b,true)||graph.fixed[2*joint]||graph.fixed[2*joint+1])continue;
    // Coincident independent paths are not necessarily connected. Moving a
    // real shared junction moves its adjacent controls together, but cannot
    // silently detach another path that only meets it geometrically.
    if(vertices.get(pointKey([points[2*joint],points[2*joint+1]])).size!==1)continue;
    const A=a[1]===1?curves[a[0]]:curves[a[0]].reversed(),B=b[1]===1?curves[b[0]]:curves[b[0]].reversed();
    if(turnAngle(A,B)<135)continue;
    const la=A.length(),lb=B.length(),chord=distance(A.p[0],B.p[3]);
    if(la+lb>4*cfg.nominalWidth||la+lb<=2*chord||chord<=cfg.geometryTolerance)continue;
    const cut=la<lb?a:b,target=la<lb?endpoint(a,true):endpoint(b,false);
    if(Math.min(la,lb)>cfg.nominalWidth||distance([points[2*joint],points[2*joint+1]],[points[2*target],points[2*target+1]])<=cfg.geometryTolerance)continue;
    if(plans.has(joint)&&plans.get(joint)!==target)return null;
    plans.set(joint,target);removed.add(cut[0]);
  }
  if(!plans.size)return null;
  const destination=id=>{
    const seen=new Set();while(plans.has(id)){if(seen.has(id))return null;seen.add(id);id=plans.get(id);}return id;
  };
  const updates=new Map(),set=(id,p)=>{
    const other=updates.get(id);if(other&&distance(other,p)>1e-7)return false;
    updates.set(id,p);return true;
  };
  for(let e=0;e<graph.edges.length;e++){
    if(removed.has(e))continue;
    const ids=graph.edges[e];
    for(const [k,h]of [[0,1],[3,2]]){
      const id=ids[k],target=destination(id);if(target===null)return null;
      if(target===id)continue;
      const next=[points[2*target],points[2*target+1]],delta=next.map((v,axis)=>v-points[2*id+axis]);
      if(!set(id,next)||!set(ids[h],[points[2*ids[h]]+delta[0],points[2*ids[h]+1]+delta[1]]))return null;
    }
  }
  const next=points.slice();for(const [id,p]of updates)next.set(p,2*id);
  let removedOccurrences=0,empty=false;
  const paths=graph.families.map(f=>f.map(pi=>{
    const out=[];for(const [e,d]of graph.paths[pi]){
      if(removed.has(e)){removedOccurrences++;continue;}
      const ids=d===1?graph.edges[e]:graph.edges[e].toReversed();out.push(ids.map(id=>[next[2*id],next[2*id+1]]));
    }
    if(!out.length)empty=true;return out;
  }));
  if(empty)return null;
  const proposal=new CurveGraph(paths,graph.width);
  return {graph:proposal,removedOccurrences,segmentsBefore:graph.edges.length,segmentsAfter:proposal.edges.length};
}

export function finalizeShortReturns(solution,cfg,{deadline=Infinity,onProgress=()=>{}}={}){
  const input=solution.graph.target,source=input.sourceImage;
  if(!source?.mask||input.metadata?.originalCubicsPreserved||performance.now()>=deadline)return solution;
  const start=performance.now(),graph=new CurveGraph(solution.paths.map((f,k)=>f.map((_,i)=>curvesOf(solution,k,i).map(c=>c.p))),input.width);
  const proposal=shortReturnProposal(graph,graph.points,cfg);if(!proposal||performance.now()>=deadline)return solution;
  const phase=input.phase?-1:1,n=source.resolution,weights=sourceWeights(source),beforeMatching=matchingSummary(solution);
  const error=s=>referenceError(source,sampleWeave(s,n)).mismatchFraction;
  const report={segmentsBefore:proposal.segmentsBefore,segmentsAfter:proposal.segmentsAfter,removedOccurrences:proposal.removedOccurrences,sourceErrorBefore:error(solution),applied:false};
  const compatible=s=>{const sym=symmetryReport(s,cfg.symmetry);return sym.requested.length===sym.honoured.length&&(!beforeMatching.identical||matchingSummary(s).identical);};
  let result=solution;
  const accept=()=>{
    const seed=proposal.graph.solution(proposal.graph.points,phase,input);
    if(!compatible(seed))return 'symmetry';
    // Topology changes can initially cost a few pixels. Let the ordinary
    // constrained fitter recover that loss; do not grant extra image error.
    const objective=orbitObjective(Float64Array.from(source.mask),n,symmetryOrbit(cfg.symmetry),weights);
    const fitted=refineCurves(proposal.graph,objective.probability,n,phase,{...cfg,preferMatchingSheets:false},{input,weights:objective.weights,steps:160,rate:.008,selection:'mask',identicalSheets:beforeMatching.identical,deadline:deadline-200,onProgress:(r,s)=>onProgress({stage:'directPolishing',detail:'short-return-refinement',...r},s)});
    report.refinementSteps=fitted.steps;
    if(!fitted.geometryPassed||!fitted.paperPassed)return 'refinement_geometry';
    const candidate=fitted.graph.solution(fitted.points,phase,input);report.sourceErrorAfter=error(candidate);
    if(report.sourceErrorAfter>report.sourceErrorBefore)return 'original_image_error';
    if(performance.now()>=deadline)return 'deadline';
    if(!compatible(candidate))return 'symmetry';
    if(!auditImageFeatures(source,sampleWeave(candidate,n),input.width).passed)return 'image_features';
    // The immutable fitted checkpoint already passed geometry and paper
    // checks. Source scoring and symmetry inspection above do not move it;
    // rerunning the same audits here only consumes the cleanup reserve.
    if(performance.now()>=deadline)return 'deadline';
    result=candidate;report.applied=true;return null;
  };
  report.rejection=accept();report.seconds=(performance.now()-start)/1000;
  const matching=solution.report.matchingPreference;
  result.report={...solution.report,shortReturnRepair:report,stages:[...(solution.report.stages||[]),{stage:'directPolishing',detail:'short-return-refinement',seconds:report.seconds}],
    ...(report.applied?{estimatedMaskMismatch:report.sourceErrorAfter}:{}),
    ...(report.applied&&matching?{matchingPreference:{...matching,...matchingSummary(result),selectedImageError:report.sourceErrorAfter,...(Number.isFinite(matching.baselineImageError)?{additionalImageError:report.sourceErrorAfter-matching.baselineImageError}:{})}}:{})};
  return result;
}
