/** Bounded continuous repair of clearance violations in a rejected routing.
 * This does not relax any cut rule or confer the original MILP's objective bound.
 */
import {curvesOf,reindex} from '../graph.js';
import {validate,sampleWeave} from '../validate.js';
import {materialAudit} from '../material.js';
import {auditFeatureFidelity} from '../feature-shapes.js';
import {requestedSymmetry} from '../settings.js';
import {CurveGraph} from './curves.js';
import {refineCurves} from './refine.js';
import {maskDisagreement} from './prefer-matching.js';
import {shortSelfReturns} from '../self-returns.js';

/** Quality evidence, not an infeasibility proof: optional hidden connectors
 * can switch sheets along these unbranched visible chains.
 */
export function visibleReturnEvidence(target,cfg){
  const graph=reindex({target,edges:target.curves.map(curve=>({curve,visible:true}))}),used=new Set(),chains=[];
  const walk=(vertex,first)=>{
    const chain=[];let edge=first;
    while(!used.has(edge)){
      used.add(edge);const item=graph.edges[edge],forward=item.u===vertex;
      chain.push([edge,forward]);vertex=forward?item.v:item.u;
      const incident=graph.incident[vertex];if(incident.length!==2)break;
      edge=incident.find(e=>e!==edge);
    }
    if(chain.length)chains.push(chain);
  };
  for(const [v,incident]of graph.incident.entries())if(incident.length!==2)for(const edge of incident)walk(v,edge);
  for(const [edge,item]of graph.edges.entries())if(!used.has(edge))walk(item.u,edge);
  const issues=shortSelfReturns({graph,paths:[chains,[]]},cfg);
  return{chains:chains.length,shortReturns:issues.length,maximumRelativeDeficit:Math.max(0,...issues.map(i=>(i.required-i.distanceUpper)/i.required)),issues};
}

export function rejectedRoutingQuality(solution,cfg){
  const geometry=validate(solution,cfg,{checkImage:false}),issues=geometry.issues;
  // A long return can miss the same clearance rule as a short one. Its
  // conservative chord-distance bound has a different required width. This
  // only selects proposals for a bounded repair; it certifies no geometry.
  const gaps=issues.map(i=>i.type==='short_self_clearance'?{distance:i.distanceUpper,required:i.required}:i.type==='nonlocal_self_clearance'?{distance:i.distanceLower,required:cfg.nominalWidth}:null);
  // One physical return can produce several witnesses, including records
  // from both local and nonlocal checks. Bound repair scope by affected cuts,
  // not a count that changes when the same cutting path is subdivided.
  const affectedCuts=new Set(issues.map(i=>`${i.family}:${i.slit}`)).size;
  const clearanceOnly=issues.length>0&&affectedCuts<=4&&gaps.every(g=>g&&g.required>0&&Number.isFinite(g.distance));
  // These are bounded witness lists, not the narrowest gap on each cut.
  // Exact subdivision can expose a different witness for the same shape.
  // Keep the observed deficit for diagnostics, never as a repair cutoff.
  // Time and affected cuts bound the attempt; final checks decide acceptance.
  const relativeDeficit=clearanceOnly?Math.max(...gaps.map(g=>(g.required-g.distance)/g.required)):null;
  return{geometry,clearanceOnly,affectedCuts,relativeDeficit,repairable:clearanceOnly};
}

export function repairRejectedRouting(proposal,input,cfg,{deadline=Infinity,quality=null}={}){
  // Complete return checks and constraint projection need room to retain a
  // valid checkpoint. This local allowance never extends the caller deadline.
  const started=performance.now(),until=Math.min(deadline,started+2000),report={accepted:false,method:'continuous-rejected-routing'};
  const finish=reason=>({solution:null,report:{...report,reason,seconds:(performance.now()-started)/1000}});
  if(until-started<250)return finish('insufficient_time');
  if(!input.sourceImage||input.sourceImage.weights||requestedSymmetry(cfg.symmetry).length)return finish('unsupported_constraints');
  const initial=quality||rejectedRoutingQuality(proposal,cfg);report.initialGeometry=initial.geometry;report.relativeDeficit=initial.relativeDeficit;
  if(!initial.repairable)return finish('geometry_not_repairable');
  const source=input.sourceImage,initialMask=sampleWeave(proposal,source.resolution);
  report.initialImageError=maskDisagreement(source,initialMask);
  // Border interpretation admits a bounded provisional trace before fitting
  // the original pixels. A near-valid routing can need that same image repair:
  // requiring final accuracy here prevents any gradient step from improving it.
  // Keep the final error limit below unchanged, including stricter user limits.
  report.maximumInitialImageError=Math.max(cfg.maxImageError,Math.min(.05,2*cfg.maxImageError));
  if(report.initialImageError>report.maximumInitialImageError)return finish('initial_image');
  report.initialFeatures=auditFeatureFidelity(source,initialMask,cfg);
  if(!report.initialFeatures.passed)return finish('initial_image');
  const graph=new CurveGraph(proposal.paths.map((family,f)=>family.map((_,i)=>curvesOf(proposal,f,i).map(c=>c.p))),cfg.width),phase=proposal.graph.target.phase?-1:1;
  // Leave room for the final geometry, source-image and paper audits. A late
  // integer proposal can otherwise produce a valid checkpoint and then lose
  // it solely because those required checks overrun the recovery allowance.
  const fitted=refineCurves(graph,source.probability||Float32Array.from(source.mask),source.resolution,phase,cfg,{input,steps:160,rate:.008,selection:'mask',deadline:until-500});
  report.steps=fitted.steps;report.history=fitted.history;
  // The local allowance stops further optimization. Its last checkpoint may
  // finish just after that cutoff; retain it for final checks when the overall
  // recovery still has time. Never discard an already valid earlier checkpoint
  // merely because a later rejected update used the end of this small phase.
  if(performance.now()>deadline)return finish('deadline');
  const solution=graph.solution(fitted.points,phase,input),woven=sampleWeave(solution,source.resolution);
  report.geometry=validate(solution,cfg);report.imageError=maskDisagreement(source,woven);report.features=auditFeatureFidelity(source,woven,cfg);
  if(!report.geometry.passed||report.imageError>cfg.maxImageError||!report.features.passed)return finish('refinement_rejected');
  report.paper=materialAudit(solution,cfg).summary;
  // Resolve a conservative lattice ambiguity just as the main fitter does.
  // Uncertainty itself never passes, and every later edit must retain the
  // finer verified lattice rather than reverting to the coarser one.
  if(report.paper.status==='uncertain'&&cfg.materialResolution<700&&deadline-performance.now()>300){
    const paper=materialAudit(solution,{...cfg,materialResolution:700});
    report.paperVerification={requestedResolution:cfg.materialResolution,initialStatus:'uncertain',resolution:700,status:paper.status};
    report.paper=paper.summary;
  }
  if(report.paper.status!=='pass')return finish('paper_rejected');
  if(performance.now()>deadline)return finish('deadline');
  report.accepted=true;report.seconds=(performance.now()-started)/1000;
  solution.report={status:'continuously_repaired',algorithm:'direct-bezier',rejectedRoutingRepair:report,...(report.paperVerification?{paperVerification:report.paperVerification}:{}),physicalAssemblyTested:false};
  return{solution,report};
}
