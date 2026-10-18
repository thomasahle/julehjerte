/** Recover a source-supported enclosure from a coupled corner disturbance.
 * Uses the common routing graph, clearance projection and Bézier refiner.
 * Every proposed border remains provisional; original pixels judge the fit. */
import {cornerBorderSeeds} from '../corner-border-seeds.js';
import {preprocessMask,sampleTarget} from '../input.js';
import {buildGraph,curvesOf,reindex,inspectBoundaryEndpoints} from '../graph.js';
import {solveBoundary} from '../routing.js';
import {settings,requestedSymmetry} from '../settings.js';
import {MATCHING_GRID_PRESET} from '../presets.js';
import {validate,sampleWeave} from '../validate.js';
import {materialAudit,verifiedPaperSettings} from '../material.js';
import {auditFeatureFidelity,featureComponentMetrics} from '../feature-shapes.js';
import {imageFeatures} from '../image-features.js';
import {stableInteriorFeatures} from '../feature-enclosures.js';
import {sourceWeights} from '../image-reference.js';
import {CurveGraph} from './curves.js';
import {projectShortReturns} from './short-return-project.js';
import {fittingMargin,refineCurves} from './refine.js';
import {maskDisagreement} from './prefer-matching.js';

export async function recoverCornerTopology(input,cfg,{seconds=15,routingSeconds=seconds-1,onProgress=()=>{},features=imageFeatures(input.sourceImage,cfg.width)}={}){
  const start=performance.now(),deadline=start+seconds*1000,source=input.sourceImage;
  const report={method:'corner-topology-recovery',budgetSeconds:seconds,routingBudgetSeconds:routingSeconds,accepted:false,attempts:[]};
  const finish=reason=>({solution:null,report:{...report,reason,seconds:(performance.now()-start)/1000}});
  if(!Number.isFinite(seconds)||seconds<=0)return finish('insufficient_time');
  if(!Number.isFinite(routingSeconds)||routingSeconds<=0)return finish('insufficient_routing_time');
  if(!source||sourceWeights(source)||requestedSymmetry(cfg.symmetry).length)return finish('unsupported_constraints');
  if(seconds<2)return finish('insufficient_routing_time');
  const stable=stableInteriorFeatures(source,features,cfg);
  if(!stable.length)return finish('no_stable_enclosures');
  const seeds=cornerBorderSeeds(source.mask,source.resolution,cfg.width,cfg.nominalWidth);
  if(!seeds.length)return finish('no_corner_proposals');
  report.protectedRegions=stable.map(({pixels:_pixels,...feature})=>feature);
  const faithful=solution=>{
    const woven=sampleWeave(solution,source.resolution),error=maskDisagreement(source,woven),fidelity=auditFeatureFidelity(source,woven,cfg,features);
    const components=featureComponentMetrics(source,woven,cfg.width,stable);
    return{passed:error<=cfg.maxImageError&&fidelity.passed&&components.every(c=>c.intersectionPixels>0&&c.touchesBorder===false),error,features:fidelity,components};
  };
  // One smallest-change seed: do not spend a long allowance on a sequence of
  // increasingly speculative changes to the source boundary.
  const seed=seeds[0];report.seed=seed.metadata;
  // Retain the ordinary topology initializer's 0.5% border-recovery allowance.
  // A large inward-band change is not evidence of a small corner disturbance:
  // spending a full routing allowance on it can delay an already good grid.
  report.maximumBorderChangeFraction=Math.min(.005,cfg.maxImageError);
  if(seed.metadata.changeFraction>report.maximumBorderChangeFraction)return finish('border_change_exceeds_allowance');
  let target;
  try{
    target=preprocessMask(seed.mask,source.resolution,{...cfg,fitTolerance:.0075*cfg.width,maxSpan:.3*cfg.width,
      smoothRadius:.003*cfg.width,snapRadius:.0075*cfg.width,borderRadius:0,polygonal:false,mixedBoundaries:true},input.metadata?.preprocessing);
  }catch(error){report.traceError=error.message;return finish('trace_failed');}
  target.sourceImage=source;
  report.trace={curves:target.curves.length,imageError:maskDisagreement(source,sampleTarget(target,source.resolution))};
  if(!target.curves.length||target.curves.length>160||report.trace.imageError>cfg.maxImageError)return finish('trace_rejected');
  const boundary=reindex({target,edges:target.curves.map(curve=>({curve,visible:true}))});
  report.endpointIssue=inspectBoundaryEndpoints(boundary,cfg.nominalWidth).issue??null;
  if(report.endpointIssue)return finish('endpoint_rejected');
  if(deadline-performance.now()<2000)return finish('insufficient_routing_time');
  // Grid-aligned connector proposals are useful even when the two sheets
  // themselves are independent. Do not impose a matching-sheet constraint.
  const graphCfg=settings({...cfg,...MATCHING_GRID_PRESET,maxTurn:cfg.maxTurn,localNeighborhoodFactor:cfg.localNeighborhoodFactor});
  let solution=null,repairUsed=false;
  const checkPaper=candidate=>{
    let paper=materialAudit(candidate,cfg),verification=null;
    if(paper.status==='uncertain'&&cfg.materialResolution<700&&deadline-performance.now()>300){
      paper=materialAudit(candidate,{...cfg,materialResolution:700});
      verification={requestedResolution:cfg.materialResolution,initialStatus:'uncertain',resolution:700,status:paper.status};
    }
    if(verification)candidate.report={...candidate.report,paperVerification:verification};
    return{paper:paper.summary,passed:paper.passed};
  };
  try{
    const initialGraph=buildGraph({...target,curves:target.curves.slice()},graphCfg),remaining=(deadline-performance.now())/1000;
    if(remaining<1)return finish('insufficient_routing_time');
    // Keep a tail for an image-faithful rejected integer candidate. The
    // observer can repair it, but cannot certify it as a MILP incumbent.
    const routingLeft=Math.min(remaining-1,routingSeconds-(performance.now()-start)/1000);
    if(routingLeft<.1)return finish('insufficient_routing_time');
    const routed=await solveBoundary(target,{...graphCfg,timeLimit:routingLeft},
      {initialGraph,expandNeighbors:false,coefficientQuantum:1e-7,stopAfterValidated:true,onProgress,
        coreGate:s=>materialAudit(s,cfg),onRejectedCandidate:(proposal,timing)=>{
          const attempt={timing};report.attempts.push(attempt);
          if(repairUsed||deadline-performance.now()<750){attempt.reason=repairUsed?'repair_already_attempted':'insufficient_time';return false;}
          const audit=validate(proposal,cfg,{checkImage:false});
          if(!audit.issues.length||audit.issues.some(i=>!['short_self_clearance','nonlocal_self_clearance'].includes(i.type))){attempt.reason='other_geometry';return false;}
          attempt.before=faithful(proposal);if(!attempt.before.passed){attempt.reason='source_features';return false;}
          repairUsed=true;
          const graph=new CurveGraph(proposal.paths.map((family,f)=>family.map((_,i)=>curvesOf(proposal,f,i).map(c=>c.p))),cfg.width),phase=proposal.graph.target.phase?-1:1;
          const projected=projectShortReturns(graph,graph.points,phase,input,cfg,{initialAudit:audit,deadline:deadline-500,
            clearanceMargin:fittingMargin(cfg,cfg.width),maxIterations:128,maxMilliseconds:5000});
          attempt.projection=projected.report;if(!projected.points)return false;
          const candidate=graph.solution(projected.points,phase,input);attempt.after=faithful(candidate);
          if(!attempt.after.passed)return false;
          const physical=checkPaper(candidate);attempt.paper=physical.paper;
          if(!physical.passed||performance.now()>deadline)return false;
          candidate.report={...candidate.report,status:'continuously_repaired',algorithm:'direct-bezier'};
          solution=candidate;attempt.reason='validated_repair';return true;
        }});
    report.routing=routed.report;
    if(faithful(routed).passed)solution=routed;
  }catch(error){report.routing=error.report;report.routingError=error.message;}
  if(!solution)return finish('no_checked_routing');
  const initial=faithful(solution),checkedCfg=verifiedPaperSettings(solution,cfg);
  report.routedImageError=initial.error;
  // The accepted routing is a rollback candidate. Ordinary refinement may
  // improve it, but may not trade away its source-supported enclosures.
  const refinementStart=performance.now(),allowance=Math.min(4000,deadline-refinementStart-250);
  if(allowance>=500){
    const graph=new CurveGraph(solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(c=>c.p))),cfg.width),phase=solution.graph.target.phase?-1:1;
    const refined=refineCurves(graph,source.probability||Float32Array.from(source.mask),source.resolution,phase,checkedCfg,{input,
      steps:800,checkpointEvery:20,rate:.008,selection:'mask',skipRepeatedRollbacks:true,deadline:refinementStart+allowance});
    const candidate=graph.solution(refined.points,phase,input),fit=faithful(candidate);
    const accepted=refined.geometryPassed&&refined.paperPassed&&fit.passed&&fit.error<=initial.error;
    report.refinement={seconds:(performance.now()-refinementStart)/1000,steps:refined.steps,skippedSteps:refined.skippedSteps,error:fit.error,accepted,history:refined.history};
    if(accepted){candidate.report={...solution.report};solution=candidate;}
  }
  const final=faithful(solution);report.imageError=final.error;report.components=final.components;
  report.geometry=validate(solution,checkedCfg);report.paper=materialAudit(solution,checkedCfg).summary;
  report.accepted=final.passed&&report.geometry.passed&&report.paper.status==='pass';report.seconds=(performance.now()-start)/1000;
  return report.accepted?{solution,report}:finish('final_checks');
}
