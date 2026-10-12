/** Alternative routing from the same classified image; no reference templates. */
import {preprocessMask,sampleTarget} from './input.js';
import {oppositeBorderSeeds} from './border.js';
import {buildGraph,reindex,inspectBoundaryEndpoints} from './graph.js';
import {solveBoundary} from './routing.js';
import {sampleWeave,validate} from './validate.js';
import {materialAudit} from './material.js';
import {auditFeatureFidelity} from './feature-shapes.js';

export async function recoverImageFeatures(input,cfg,seconds,onProgress=()=>{}){
  const start=performance.now(),report={method:'trace-milp',budgetSeconds:seconds,accepted:false,attempts:[]};
  try{
    onProgress({stage:'graph'});
    const source=input.sourceImage,remaining=()=>seconds-(performance.now()-start)/1000;
    // First preserve the established trace and vary optional hidden connectors;
    // coarsening the contours themselves can remove necessary routing choices.
    const choices=[{neighbors:Math.min(8,cfg.neighbors),connectorVariants:1},{neighbors:cfg.neighbors,connectorVariants:cfg.connectorVariants}];
    let solution=null;const deferred=[];
    const runSeed=async(smoothRadius,borderSeed=null)=>{
      const seedStarted=performance.now();
      // Explore these provisional edge interpretations with the sparse graph;
      // densifying an earlier seed can consume the whole remaining budget.
      const graphChoices=borderSeed?choices.slice(0,1):choices;
      const target=preprocessMask(borderSeed?.mask||source.mask,source.resolution,{...cfg,algorithm:'trace',fitTolerance:.75,smoothRadius,snapRadius:1.5,maxSpan:30,borderRadius:borderSeed?0:3},input.metadata.preprocessing);
      target.sourceImage=source;
      target.metadata.preprocessing.traceUsed=true;
      target.metadata.sourceImage=input.metadata.sourceImage;
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
        if(remaining()<.1)break;
        const at=performance.now(),graphCfg={...cfg,...graphChoices[i]},left=remaining();
        if(left<=0)break;
        // A timeout is not evidence that the sparse graph lacks a routing.
        // Let it use most of this phase before adding a much larger graph.
        const onlyChoice=graphChoices.length===1||graphChoices[0].neighbors===graphChoices[1].neighbors&&graphChoices[0].connectorVariants===graphChoices[1].connectorVariants,budget=i||onlyChoice?left:left*.8,attempt={...graphChoices[i],smoothRadius,budgetSeconds:budget,...(borderSeed?{borderSeed: {...borderSeed.metadata}}:{})};report.attempts.push(attempt);
        try{
          // This recovery phase already announced graph work before tracing.
          solution=await solveBoundary(target,{...graphCfg,timeLimit:budget},{expandNeighbors:false,announceGraph:false,onProgress,coefficientQuantum:1e-7,stopAfterValidated:true,coreGate:cfg.requireMaterialCore?s=>materialAudit(s,cfg):null});
          attempt.solver=solution.report;break;
        }catch(error){
          attempt.error=error.message;attempt.solver=error.report;report.solver=error.report;
          // This boundary needs a new trace, not more optional connections.
          if(error.report?.connectorIndependentIssue)break;
          // The later ordinary graph covers this sparse proposal. Defer only
          // the final exhausted pool for each boundary interpretation.
          if(error.report?.termination==='candidate_graph_exhausted'&&(onlyChoice||i===graphChoices.length-1))deferred.push({target,graphCfg,initialAttempt:report.attempts.length-1});
        }
        finally{attempt.seconds=(performance.now()-at)/1000;}
      }
    };
    await runSeed(.3);
    if(!solution&&remaining()>=.25&&report.attempts.length&&report.attempts.every(a=>a.solver?.termination==='candidate_graph_exhausted'||a.boundaryIssue?.type==='endpoint_spacing')){
      // Extra search cannot repair an infeasible traced boundary. Suppress
      // thin raster spurs in the seed; the original image stays unchanged.
      report.seedSmoothingRetry=true;
      await runSeed(.5);
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
      }catch(error){attempt.error=error.message;attempt.solver=error.report;report.solver=error.report;}
      finally{attempt.seconds=(performance.now()-at)/1000;}
    }
    if(!solution)throw new Error('Feature recovery found no validated routing within its budget.');
    const woven=sampleWeave(solution,source.resolution);
    let mismatch=0,observed=0;for(let i=0;i<woven.length;i++){if(source.validMask&&!source.validMask[i])continue;observed++;mismatch+=woven[i]!==source.mask[i];}
    report.imageError=mismatch/observed;report.features=auditFeatureFidelity(source,woven,cfg);
    report.geometryPassed=validate(solution,cfg).passed;report.paperPassed=materialAudit(solution,cfg).passed;
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
