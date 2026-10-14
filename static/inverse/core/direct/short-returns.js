/** Remove short out-and-back runs as a topology proposal for the main fitter.
 * An image gradient can move a spur without removing its redundant corner.
 * Short edges contract at real shared junctions; every adjacent curve follows.
 * Independent coincident branches and fixed slit endpoints stay intact.
 */
import {Cubic,distance,turnAngle} from '../bezier.js';
import {curvesOf} from '../graph.js';
import {sampleWeave} from '../validate.js';
import {auditFeatureFidelityChange} from '../feature-shapes.js';
import {referenceError,sourceWeights} from '../image-reference.js';
import {CurveGraph} from './curves.js';
import {refineCurves} from './refine.js';
import {matchingSummary} from './matching.js';
import {orbitObjective,symmetryOrbit,symmetryReport} from './symmetry.js';

const pointKey=p=>p.map(v=>Math.round(v*1e7)).join(',');

/** At a shared cut's endpoint the visible outline can switch sheets. These
 * two boundary edges need not be consecutive in either cutting path. Only
 * real shared vertices with an unambiguous visible continuation qualify.
 */
function visibleBoundaryJoins(graph){
  const visible=new Map(),hidden=new Set();
  graph.edges.forEach((ids,e)=>{for(const [id,d]of [[ids[0],-1],[ids[3],1]]){
    if(!graph.visible[e]){hidden.add(id);continue;}
    if(!visible.has(id))visible.set(id,[]);visible.get(id).push([e,d]);
  }});
  const joins=[];
  for(const [id,entries]of visible)if(hidden.has(id)&&entries.length===2){
    const [a,b]=entries;joins.push([a,[b[0],-b[1]],true]);
  }
  return joins;
}

/** A visible boundary deep inside one observed colour is unsupported. Keep
 * near-boundary joins: their apparent returns can be real corners or pixel
 * fringes. Use the same quarter-strip scale as outline-detail selection,
 * with at least 1.5 source pixels to avoid reacting to raster phase alone.
 */
function unsupportedVisibleJoint(source,point,width,cfg){
  const {mask,resolution:n,validMask,weights}=source;
  const x=point[0]*n/width,y=point[1]*n/width,r=Math.max(1.5,cfg.minWidth*n/(4*width));
  const cx=Math.floor(x),cy=Math.floor(y);
  if(cx<0||cy<0||cx>=n||cy>=n)return false;
  const value=mask[cy*n+cx];
  for(let yy=Math.floor(y-r);yy<=Math.floor(y+r);yy++)for(let xx=Math.floor(x-r);xx<=Math.floor(x+r);xx++){
    const dx=Math.max(0,xx-x,x-xx-1),dy=Math.max(0,yy-y,y-yy-1);
    if(dx*dx+dy*dy>=r*r)continue;
    if(xx<0||yy<0||xx>=n||yy>=n)return false;
    const i=yy*n+xx;
    if(validMask&&!validMask[i]||weights&&!(weights[i]>0)||mask[i]!==value)return false;
  }
  return true;
}

export function shortReturnProposal(graph,points,cfg,{source=null}={}){
  const controls=graph.controls(points),curves=controls.map(c=>new Cubic(c)),vertices=new Map(),plans=new Map(),cuts=new Map(),blocked=new Set(),removed=new Set(),boundaryPlans=new Set();
  const endpoint=(entry,start)=>graph.edges[entry[0]][start?(entry[1]===1?0:3):(entry[1]===1?3:0)];
  for(const ids of graph.edges)for(const id of [ids[0],ids[3]]){
    const key=pointKey([points[2*id],points[2*id+1]]);
    if(!vertices.has(key))vertices.set(key,new Set());vertices.get(key).add(id);
  }
  for(const [a,b,visibleBoundary]of [...graph.joins,...(source?visibleBoundaryJoins(graph):[])]){
    const joint=endpoint(a,false);
    if(blocked.has(joint))continue;
    if(joint!==endpoint(b,true)||graph.fixed[2*joint]||graph.fixed[2*joint+1])continue;
    if(visibleBoundary&&!unsupportedVisibleJoint(source,[points[2*joint],points[2*joint+1]],graph.width,cfg))continue;
    // Coincident independent paths are not necessarily connected. Moving a
    // real shared junction moves its adjacent controls together, but cannot
    // silently detach another path that only meets it geometrically.
    if(vertices.get(pointKey([points[2*joint],points[2*joint+1]])).size!==1)continue;
    const A=a[1]===1?curves[a[0]]:curves[a[0]].reversed(),B=b[1]===1?curves[b[0]]:curves[b[0]].reversed();
    if(turnAngle(A,B)<135)continue;
    const la=A.length(),lb=B.length(),chord=distance(A.p[0],B.p[3]);
    // Fitted cubics can spread a narrow return across two spans, making both
    // slightly longer than the nominal strip width even though their chord is
    // still a sub-width spur. Keep the extension bounded and require the
    // short chord so legitimate broad bends remain untouched.
    // Two separately fitted sheets can spread a visible return farther than
    // one path's spur. This only broadens proposal generation: contraction
    // moves every incident shared branch, and final acceptance still requires
    // the original image, features, geometry and paper checks.
    if(la+lb>6*cfg.nominalWidth||la+lb<=2*chord||chord<=cfg.geometryTolerance||chord>(visibleBoundary?1.5:1)*cfg.nominalWidth)continue;
    const cut=la<lb?a:b,target=la<lb?endpoint(a,true):endpoint(b,false);
    if(Math.min(la,lb)>(visibleBoundary?2:1.5)*cfg.nominalWidth||distance([points[2*joint],points[2*joint+1]],[points[2*target],points[2*target+1]])<=cfg.geometryTolerance)continue;
    // A real sharp tip can extend past its first sampled source pixel. Its
    // neighbouring boundary must also lack support; testing only the tip
    // would mistake subpixel corner coverage for an unwanted spur.
    if(visibleBoundary&&!unsupportedVisibleJoint(source,(la<lb?A:B).point(.5),graph.width,cfg))continue;
    // Multiple incident branches can suggest different contractions at one
    // junction. That junction is ambiguous, but unrelated proposals remain
    // safe to apply. Drop only the competing plan instead of abandoning every
    // repair found in this graph.
    if(plans.has(joint)&&plans.get(joint)!==target){plans.delete(joint);cuts.delete(joint);blocked.add(joint);continue;}
    plans.set(joint,target);cuts.set(joint,cut[0]);
    if(visibleBoundary)boundaryPlans.add(joint);
  }
  if(!plans.size)return null;
  for(const edge of cuts.values())removed.add(edge);
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
  return {graph:proposal,removedOccurrences,segmentsBefore:graph.edges.length,segmentsAfter:proposal.edges.length,conflictingJunctions:blocked.size,visibleBoundaryContractions:[...plans.keys()].filter(id=>boundaryPlans.has(id)).length};
}

export function finalizeShortReturns(solution,cfg,{deadline=Infinity,completionDeadline=deadline,onProgress=()=>{}}={}){
  const input=solution.graph.target,source=input.sourceImage;
  if(!source?.mask||input.metadata?.originalCubicsPreserved||performance.now()>=deadline)return solution;
  const start=performance.now(),graph=new CurveGraph(solution.paths.map((f,k)=>f.map((_,i)=>curvesOf(solution,k,i).map(c=>c.p))),input.width);
  const proposal=shortReturnProposal(graph,graph.points,cfg,{source});if(!proposal||performance.now()>=deadline)return solution;
  const phase=input.phase?-1:1,n=source.resolution,weights=sourceWeights(source),beforeMatching=matchingSummary(solution);
  const before=sampleWeave(solution,n);
  const report={segmentsBefore:proposal.segmentsBefore,segmentsAfter:proposal.segmentsAfter,removedOccurrences:proposal.removedOccurrences,conflictingJunctions:proposal.conflictingJunctions,visibleBoundaryContractions:proposal.visibleBoundaryContractions,sourceErrorBefore:referenceError(source,before).mismatchFraction,applied:false};
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
    const candidate=fitted.graph.solution(fitted.points,phase,input),woven=sampleWeave(candidate,n);report.sourceErrorAfter=referenceError(source,woven).mismatchFraction;
    if(report.sourceErrorAfter>report.sourceErrorBefore)return 'original_image_error';
    if(performance.now()>=completionDeadline)return 'deadline';
    if(!compatible(candidate))return 'symmetry';
    report.featureChange=auditFeatureFidelityChange(source,before,woven,cfg);
    if(!report.featureChange.passed)return 'image_features';
    // The immutable fitted checkpoint already passed geometry and paper
    // checks. Source scoring and symmetry inspection above do not move it;
    // rerunning the same audits here only consumes the cleanup reserve.
    // The phase cutoff stops further refinement. A completed checkpoint may
    // still be accepted before the overall solve's export reserve begins.
    if(performance.now()>=completionDeadline)return 'deadline';
    result=candidate;report.applied=true;return null;
  };
  report.rejection=accept();report.seconds=(performance.now()-start)/1000;
  const matching=solution.report.matchingPreference;
  result.report={...solution.report,shortReturnRepair:report,stages:[...(solution.report.stages||[]),{stage:'directPolishing',detail:'short-return-refinement',seconds:report.seconds}],
    ...(report.applied?{estimatedMaskMismatch:report.sourceErrorAfter}:{}),
    ...(report.applied&&matching?{matchingPreference:{...matching,...matchingSummary(result),selectedImageError:report.sourceErrorAfter,...(Number.isFinite(matching.baselineImageError)?{additionalImageError:report.sourceErrorAfter-matching.baselineImageError}:{})}}:{})};
  return result;
}
