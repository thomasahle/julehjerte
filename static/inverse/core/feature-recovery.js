/** Alternative routing from the same classified image; no reference templates. */
import {preprocessMask,sampleTarget} from './input.js';
import {oppositeBorderSeeds} from './border.js';
import {buildGraph,reindex,inspectBoundaryEndpoints} from './graph.js';
import {solveBoundary} from './routing.js';
import {sampleWeave,validate} from './validate.js';
import {materialAudit,verifiedPaperSettings} from './material.js';
import {auditFeatureFidelity} from './feature-shapes.js';
import {visibleReturnEvidence,rejectedRoutingQuality,repairRejectedRouting} from './direct/rejected-routing.js';
import {visibleMarginIssue} from './solver.js';
import {visibleSelfIntersectionIssue} from './self-intersections.js';

// Trace-order heuristic only; bounded repair has no witness-deficit cutoff.
const VISIBLE_RETURN_TRACE_DEFICIT=.15;

export async function recoverImageFeatures(input,cfg,seconds,onProgress=()=>{}){
  const start=performance.now(),report={method:'trace-milp',budgetSeconds:seconds,accepted:false,attempts:[]};
  try{
    onProgress({stage:'graph'});
    const source=input.sourceImage,remaining=()=>seconds-(performance.now()-start)/1000;
    const choices=[{neighbors:Math.min(8,cfg.neighbors),connectorVariants:1},{neighbors:cfg.neighbors,connectorVariants:cfg.connectorVariants}];
    let solution=null,rejectedRepairUsed=false;const deferred=[],denseSeeds=[],ordinaryTargets=new Map();
    const trace=(smoothRadius,borderSeed=null)=>{
      if(!borderSeed&&ordinaryTargets.has(smoothRadius))return ordinaryTargets.get(smoothRadius);
      const target=preprocessMask(borderSeed?.mask||source.mask,source.resolution,{...cfg,algorithm:'trace',fitTolerance:.75,smoothRadius,snapRadius:1.5,maxSpan:30,borderRadius:borderSeed?0:3},input.metadata.preprocessing);
      target.sourceImage=source;
      target.metadata.preprocessing.traceUsed=true;
      target.metadata.sourceImage=input.metadata.sourceImage;
      if(!borderSeed)ordinaryTargets.set(smoothRadius,target);
      return target;
    };
    const runSeed=async(smoothRadius,borderSeed=null,maximumSeconds=Infinity,denseRetryOf=null)=>{
      const seedStarted=performance.now();
      const seedRemaining=()=>Math.min(remaining(),maximumSeconds-(performance.now()-seedStarted)/1000);
      // Explore these provisional edge interpretations with the sparse graph;
      // densifying an earlier seed can consume the whole remaining budget.
      const graphChoices=borderSeed?choices.slice(0,1):denseRetryOf!==null?choices.slice(1):choices,target=trace(smoothRadius,borderSeed);
      if(borderSeed){
        const sampled=sampleTarget(target,source.resolution),imageError=sampled.reduce((sum,v,i)=>sum+Number(v!==source.mask[i]),0)/sampled.length;
        // A larger inset may reach the motif itself. Keep this provisional
        // geometry within a small whole-image error before spending MILP time.
        if(imageError>Math.min(.05,2*cfg.maxImageError)){
          (report.rejectedBorderSeeds??=[]).push({...borderSeed.metadata,smoothRadius,traceImageError:imageError,maximumImageError:Math.min(.05,2*cfg.maxImageError),reason:'seed_image_error'});return;
        }
        borderSeed.metadata.traceImageError=imageError;
      }
      // Hidden connectors cannot change visible border endpoints. Reject
      // impossible counts or spacing before generating either connector graph
      // or initializing HiGHS; retain the reason so this is not a search timeout.
      const boundaryGraph=reindex({target,edges:target.curves.map(curve=>({curve,visible:true}))});
      const boundaryIssue=inspectBoundaryEndpoints(boundaryGraph,cfg.nominalWidth).issue;
      if(boundaryIssue){
        report.attempts.push({stage:'boundary',smoothRadius,...(borderSeed?{borderSeed:{...borderSeed.metadata}}:{}),boundaryIssue,error:boundaryIssue.message,seconds:(performance.now()-seedStarted)/1000});return;
      }
      for(let i=0;i<graphChoices.length;i++){
        if(i&&graphChoices[i].neighbors===graphChoices[0].neighbors&&graphChoices[i].connectorVariants===graphChoices[0].connectorVariants)break;
        if(seedRemaining()<.1)break;
        const at=performance.now(),graphCfg={...cfg,...graphChoices[i]},left=seedRemaining();
        if(left<=0)break;
        // A timeout is not evidence that the sparse graph lacks a routing.
        // Reserving a fraction for a larger graph can interrupt its second
        // validation round just before it finds a sound, simpler pair. Use
        // the remaining phase allowance here; proven exhaustion still returns
        // early and leaves later graphs and boundary interpretations available.
        const onlyChoice=graphChoices.length===1||graphChoices[0].neighbors===graphChoices[1].neighbors&&graphChoices[0].connectorVariants===graphChoices[1].connectorVariants,budget=left,attempt={...graphChoices[i],smoothRadius,budgetSeconds:budget,...(borderSeed?{borderSeed: {...borderSeed.metadata}}:{}),...(denseRetryOf!==null?{denseRetryOf}:{})};report.attempts.push(attempt);
        const observeRejected=async(proposal,timing)=>{
          try{
            if(rejectedRepairUsed||seedRemaining()<.75)return false;
            const quality=rejectedRoutingQuality(proposal,cfg);
            if(!quality.repairable)return false;
            rejectedRepairUsed=true;
            const repaired=repairRejectedRouting(proposal,input,cfg,{deadline:Math.min(start+seconds*1000,seedStarted+maximumSeconds*1000),quality});
            attempt.continuousRepair={...repaired.report,integerCandidateSeconds:timing.elapsedSeconds};
            if(repaired.solution){solution=repaired.solution;return true;}
            return false;
          }catch(error){attempt.continuousProbeError=error.message;return false;}
        };
        try{
          // This recovery phase already announced graph work before tracing.
          solution=await solveBoundary(target,{...graphCfg,timeLimit:budget},{expandNeighbors:false,announceGraph:false,onProgress,coefficientQuantum:1e-7,stopAfterValidated:true,onRejectedCandidate:observeRejected,coreGate:cfg.requireMaterialCore?s=>materialAudit(s,cfg):null});
          attempt.solver=solution.report;break;
        }catch(error){
          attempt.error=error.message;attempt.solver=error.report;report.solver=error.report;
          if(solution)break;
          // This boundary needs a new trace, not more optional connections.
          if(error.report?.connectorIndependentIssue)break;
          // Let the sparse graph finish, including all its validation rounds.
          // Once exhausted, try alternative boundary interpretations before
          // spending the remaining allowance on denser hidden connections.
          // Keep that ordinary dense graph queued; exhaustion of a sparse
          // graph does not prove its boundary or the whole design impossible.
          if(error.report?.termination==='candidate_graph_exhausted'&&!onlyChoice&&i===0){
            denseSeeds.push({smoothRadius,initialAttempt:report.attempts.length-1,maximumSeconds:seedRemaining()});break;
          }
          // The later ordinary graph covers this sparse proposal. Defer only
          // the final exhausted pool for each boundary interpretation.
          if(error.report?.termination==='candidate_graph_exhausted'&&(onlyChoice||i===graphChoices.length-1))deferred.push({target,graphCfg,initialAttempt:report.attempts.length-1});
        }
        finally{
          attempt.seconds=(performance.now()-at)/1000;
          if(solution)report.selectedTrace={smoothRadius,...graphChoices[i],...(borderSeed?{borderSeed:{...borderSeed.metadata}}:{})};
        }
      }
    };
    let initialRadius=.3;
    const original=trace(.3),boundary=reindex({target:original,edges:original.curves.map(curve=>({curve,visible:true}))});
    // Keep traces with small observed defects unless smoothing improves both
    // their deficit and image fit. For larger raster returns, fewer chains can
    // earn the first routing attempt even with slightly worse trace fidelity.
    // Hidden edges can switch sheets along a chain, so neither its worst gap
    // nor its return count proves that the final routing will be valid. Every
    // proposal still faces the unchanged source-image and physical checks.
    if(remaining()>=1&&!inspectBoundaryEndpoints(boundary,cfg.nominalWidth).issue&&!visibleMarginIssue(boundary,cfg)&&!visibleSelfIntersectionIssue(boundary,cfg)){
      const before=visibleReturnEvidence(original,cfg);
      if(before.shortReturns){
        const smoother=trace(.5),after=visibleReturnEvidence(smoother,cfg);
        const mismatch=target=>{const mask=sampleTarget(target,source.resolution);return{mask,error:mask.reduce((s,v,i)=>s+Number(v!==source.mask[i]),0)/mask.length};};
        const a=mismatch(original),b=mismatch(smoother);
        const graph=reindex({target:smoother,edges:smoother.curves.map(curve=>({curve,visible:true}))}),endpoints=inspectBoundaryEndpoints(graph,cfg.nominalWidth).issue;
        const severeReturns=before.maximumRelativeDeficit>VISIBLE_RETURN_TRACE_DEFICIT;
        const betterTrace=after.maximumRelativeDeficit<=before.maximumRelativeDeficit&&b.error<=a.error;
        const preferred=!endpoints&&!visibleMarginIssue(graph,cfg)&&!visibleSelfIntersectionIssue(graph,cfg)&&after.shortReturns<before.shortReturns&&(severeReturns||betterTrace)&&b.error<=cfg.maxImageError&&auditFeatureFidelity(source,b.mask,cfg).passed;
        report.traceQualityPreference={preferred,severeReturns,before:{smoothRadius:.3,shortReturns:before.shortReturns,maximumRelativeDeficit:before.maximumRelativeDeficit,imageError:a.error},after:{smoothRadius:.5,shortReturns:after.shortReturns,maximumRelativeDeficit:after.maximumRelativeDeficit,imageError:b.error},reason:severeReturns?'fewer visible-chain returns above the trace-order deficit threshold':'fewer visible-chain returns with no worse deficit or source-image disagreement'};
        if(preferred)initialRadius=.5;
      }
    }
    await runSeed(initialRadius);
    if(initialRadius!==.3&&!solution&&remaining()>=.25)await runSeed(.3);
    if(!solution&&initialRadius===.3&&remaining()>=.25&&report.attempts.length&&report.attempts.every(a=>a.solver?.termination==='candidate_graph_exhausted'||a.boundaryIssue?.type==='endpoint_spacing')){
      // Extra search cannot repair an infeasible traced boundary. Suppress
      // thin raster spurs in the seed; the original image stays unchanged.
      report.seedSmoothingRetry=true;
      await runSeed(.5);
    }
    if(!solution&&remaining()>=.25&&report.attempts.some(a=>a.solver?.connectorIndependentIssue?.type==='visible_edge_self_intersection'||a.solver?.history?.some(h=>h.selfIntersectionChains>0))&&report.attempts.every(a=>a.solver?.termination==='candidate_graph_exhausted')){
      // A locally crossing raster spur can make both established traces
      // infeasible. Chain cuts establish exhaustion quickly enough to try one
      // smoother seed; all image, feature and paper checks stay unchanged.
      report.seedIntersectionRetry=true;
      await runSeed(.75);
    }
    if(!solution&&remaining()>=.25){
      // A fringe can hide endpoints on just one side. Try deeper profiles on
      // that side only, retaining the ordinary interpretation elsewhere. A
      // timeout is not a reason to abandon a viable graph for another seed.
      const retryable=report.attempts.every(a=>!a.solver||a.solver.termination==='candidate_graph_exhausted');
      if(retryable)for(const seed of oppositeBorderSeeds(source.mask,source.resolution,cfg.width,cfg.nominalWidth)){
        for(const smoothRadius of [.3,.5]){
          if(remaining()<.25)break;
          report.borderSeedRetry=true;
          await runSeed(smoothRadius,seed);
          if(solution||report.attempts.some(a=>a.solver&&a.solver.termination!=='candidate_graph_exhausted'))break;
        }
        if(solution||remaining()<.25||report.attempts.some(a=>a.solver&&a.solver.termination!=='candidate_graph_exhausted'))break;
      }
    }
    if(!solution&&!report.seedIntersectionRetry&&remaining()>=.75&&report.attempts.length&&report.attempts.every(a=>a.solver?.termination==='candidate_graph_exhausted')){
      // A tiny raster bridge can add a junction without producing an illegal
      // visible chain. More hidden connectors cannot change that boundary
      // interpretation. Try one simpler trace after the established border
      // alternatives; the original image still judges its eventual fit.
      const before=trace(.5),after=trace(.75),graphOf=target=>reindex({target,edges:target.curves.map(curve=>({curve,visible:true}))});
      const a=graphOf(before),b=graphOf(after),junctions=g=>g.incident.filter(edges=>edges.length>2).length;
      const proposal={smoothRadius:.75,junctionsBefore:junctions(a),junctionsAfter:junctions(b),attempted:false,recovered:false};
      report.seedTopologyRetry=proposal;
      if(proposal.junctionsAfter<proposal.junctionsBefore&&!inspectBoundaryEndpoints(b,cfg.nominalWidth).issue&&!visibleMarginIssue(b,cfg)&&!visibleSelfIntersectionIssue(b,cfg)){
        const mask=sampleTarget(after,source.resolution);
        proposal.traceImageError=mask.reduce((sum,v,i)=>sum+Number(v!==source.mask[i]),0)/mask.length;
        proposal.maximumImageError=Math.min(.05,2*cfg.maxImageError);
        proposal.featuresPassed=auditFeatureFidelity(source,mask,cfg).passed;
        if(proposal.traceImageError<=proposal.maximumImageError&&proposal.featuresPassed){
          // This is an extra topology proposal, not permission to consume the
          // remaining grid/refinement allowance with another large MILP.
          proposal.budgetSeconds=Math.min(2,remaining()/2);proposal.attempted=true;
          await runSeed(.75,null,proposal.budgetSeconds);
          proposal.recovered=!!solution;
        }
      }
    }
    report.deferredDenseGraphs=denseSeeds.length;
    for(const pending of denseSeeds){
      if(solution||remaining()<.1)break;
      if(pending.maximumSeconds>=.1)await runSeed(pending.smoothRadius,null,pending.maximumSeconds,pending.initialAttempt);
    }
    // All established border/smoothing alternatives get their turn before
    // densifying one speculative interpretation. The leaf photo needs a later
    // border seed; immediate expansion spent its entire remaining budget on an
    // earlier seed that never yielded a validated routing.
    report.deferredNeighborExpansions=deferred.length;
    for(const pending of deferred){
      if(solution||remaining()<.1)break;
      const at=performance.now(),original=report.attempts[pending.initialAttempt];
      let graph;
      try{graph=buildGraph({...pending.target,curves:pending.target.curves.slice()},pending.graphCfg,{onProgress,unconnectedNeighbors:true});}
      catch(error){(report.rejectedNeighborExpansions??=[]).push({initialAttempt:pending.initialAttempt,error:error.message,seconds:(performance.now()-at)/1000});continue;}
      if(graph.metadata.hiddenCandidates<=original.solver.graph.hiddenCandidates)continue;
      const budget=remaining();if(budget<.1)break;
      const attempt={neighbors:pending.graphCfg.neighbors,connectorVariants:pending.graphCfg.connectorVariants,smoothRadius:original.smoothRadius,
        ...(original.borderSeed?{borderSeed:{...original.borderSeed}}:{}),neighborExpansion:true,initialAttempt:pending.initialAttempt,
        addedCandidates:graph.metadata.hiddenCandidates-original.solver.graph.hiddenCandidates,budgetSeconds:budget};report.attempts.push(attempt);
      try{
        solution=await solveBoundary(pending.target,{...pending.graphCfg,timeLimit:budget},{initialGraph:graph,expandNeighbors:false,unconnectedNeighbors:true,announceGraph:false,onProgress,coefficientQuantum:1e-7,stopAfterValidated:true,coreGate:cfg.requireMaterialCore?s=>materialAudit(s,cfg):null});
        attempt.solver=solution.report;
        report.selectedTrace={smoothRadius:original.smoothRadius,neighbors:pending.graphCfg.neighbors,connectorVariants:pending.graphCfg.connectorVariants,...(original.borderSeed?{borderSeed:{...original.borderSeed}}:{}),neighborExpansion:true};
      }catch(error){attempt.error=error.message;attempt.solver=error.report;report.solver=error.report;}
      finally{attempt.seconds=(performance.now()-at)/1000;}
    }
    if(!solution)throw new Error('Feature recovery found no validated routing within its budget.');
    const woven=sampleWeave(solution,source.resolution);
    let mismatch=0,observed=0;for(let i=0;i<woven.length;i++){if(source.validMask&&!source.validMask[i])continue;observed++;mismatch+=woven[i]!==source.mask[i];}
    report.imageError=mismatch/observed;report.features=auditFeatureFidelity(source,woven,cfg);
    const verifiedCfg=verifiedPaperSettings(solution,cfg);
    report.geometryPassed=validate(solution,verifiedCfg).passed;report.paperPassed=materialAudit(solution,verifiedCfg).passed;
    report.accepted=report.imageError<=cfg.maxImageError&&report.features.passed&&report.geometryPassed&&(!cfg.requireMaterialCore||report.paperPassed);
    report.solver=solution.report;
    if(report.accepted)return{solution,report};
    // A final image rejection does not invalidate this routing as an initial
    // geometry for the common fitter. Keep it explicitly provisional: callers
    // must still apply the original image and feature checks after refinement.
    report.refinementSeedAvailable=report.geometryPassed&&report.paperPassed;
    if(report.refinementSeedAvailable)return{solution:null,refinementSeed:solution,report};
  }catch(error){report.error=error.message;report.solver=error.report;}
  finally{report.seconds=(performance.now()-start)/1000;}
  return{solution:null,report};
}
