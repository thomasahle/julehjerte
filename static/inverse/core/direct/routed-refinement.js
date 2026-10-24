/** Refine an externally routed pair with the ordinary image fitter and cleanup.
 * The source image is independent of the seed. Shared cubics retain one set of
 * controls; every accepted replacement passes the normal final geometry rules.
 */
import {CurveGraph} from './curves.js';
import {refineCurves,fittingMargin} from './refine.js';
import {projectShortReturns} from './short-return-project.js';
import {finalizeFittedSolution} from './finalize.js';
import {repairFinalReturns} from './final-return-repair.js';
import {repairFinalPaper} from './final-paper-repair.js';
import {sharedRunTopology} from './shared-runs.js';
import {curvesOf} from '../graph.js';
import {sampleWeave,validate,easeMetrics} from '../validate.js';
import {finalMaterialAudit} from '../geometric-material.js';
import {verifiedPaperSettings} from '../material.js';
import {referenceError,sourceWeights} from '../image-reference.js';
import {auditFeatureFidelity} from '../feature-shapes.js';
import {symmetryReport} from './symmetry.js';
import {matchingSummary} from './matching.js';
import {imageFeatures} from '../image-features.js';
import {Cubic,segmentDistance} from '../bezier.js';

const asGraph=solution=>new CurveGraph(solution.paths.map((f,k)=>f.map((_,i)=>curvesOf(solution,k,i).map(c=>c.p))),solution.graph.target.width);

export function routedComplexity(solution){
  const graph=asGraph(solution),topology=sharedRunTopology(graph);
  if(!topology)throw new Error('Cannot count the routed shared paths.');
  return{slits:solution.paths.map(f=>f.length),hiddenRuns:topology.runs.filter(r=>!graph.visible[r.edges[0]]).length,curves:graph.edges.length};
}

/** seconds funds fitting and cleanup; the final independent audit completes
 * even at the deadline. It can add bounded verification time, not more search.
 */
export function refineRoutedSolution(original,cfg,{seconds=10,steps=800,onProgress=()=>{}}={}){
  if(!Number.isFinite(seconds)||seconds<0)throw new RangeError('Refinement needs a finite nonnegative time allowance.');
  const source=original.graph.target.sourceImage;
  if(!source?.mask||!Number.isInteger(source.resolution)||source.resolution<2||source.mask.length!==source.resolution**2)throw new Error('Routed refinement needs the original source mask.');
  if(original.graph.target.width!==cfg.width)throw new Error('Routed geometry and settings must use the same square width.');
  const start=performance.now(),deadline=start+seconds*1000,counts=routedComplexity(original);
  const input={...original.graph.target,metadata:{...original.graph.target.metadata}};
  const phase=input.phase?-1:1,report={method:'routed-bezier-refinement',budgetSeconds:seconds,countsBefore:counts,attempts:[]};
  const preserveVisibleBoundary=input.metadata?.preserveVisibleBoundary===true;
  const originalVisible=input.metadata?.originalVisibleBoundary||[];
  const boundarySegments=curves=>curves.flatMap(points=>{const flattened=new Cubic(points).flatten(.01,cfg.width/5,true).points;return flattened.slice(1).map((b,i)=>[flattened[i],b]);});
  const originalBoundarySegments=boundarySegments(originalVisible);
  const visibleBoundaryMetrics=solution=>{
    if(!preserveVisibleBoundary)return{exact:true,maxDistance:0,rmsDistance:0,samples:0};
    const candidate=boundarySegments(solution.graph.edges.filter(e=>e.visible).map(e=>e.curve.p));
    if(!originalBoundarySegments.length||!candidate.length)return{exact:false,maxDistance:Infinity,rmsDistance:Infinity,samples:0};
    let maxDistance=0,sum=0,samples=0;
    for(const [a]of originalBoundarySegments){const d=Math.min(...candidate.map(([c,e])=>segmentDistance(a,c,e)));maxDistance=Math.max(maxDistance,d);sum+=d*d;samples++;}
    for(const [a]of candidate){const d=Math.min(...originalBoundarySegments.map(([c,e])=>segmentDistance(a,c,e)));maxDistance=Math.max(maxDistance,d);sum+=d*d;samples++;}
    return{exact:maxDistance<=1e-6,maxDistance,rmsDistance:Math.sqrt(sum/Math.max(1,samples)),samples};
  };
  // A visible edge is the primary artwork. If an exact-boundary search cannot
  // make the route cuttable, permit a bounded fallback drift (about 1.4
  // nominal cut widths) so the hidden routing still gets a chance to pass.
  const visibleBoundaryLimit=1.4*cfg.nominalWidth;
  const sourceFeatures=imageFeatures(source,cfg.width);
  const assess=(solution,{allowVisibleBoundaryDrift=false}={})=>{
    const checkedCfg=verifiedPaperSettings(solution,cfg),woven=sampleWeave(solution,source.resolution);
    const image=referenceError(source,woven),features=auditFeatureFidelity(source,woven,checkedCfg,sourceFeatures),complexity=routedComplexity(solution);
    const geometry=validate(solution,checkedCfg,{checkImage:false,finalGeometry:true});
    const paper=geometry.passed?finalMaterialAudit(solution,checkedCfg):null;
    const symmetry=symmetryReport(solution,cfg.symmetry),ease=easeMetrics(solution,checkedCfg);
    const boundary=visibleBoundaryMetrics(solution);
    const gates={geometry:geometry.passed,paper:!cfg.requireMaterialCore||paper?.passed===true,
      image:image.mismatchFraction<=cfg.maxImageError,features:features.passed,
      sameSlitCounts:complexity.slits.every((n,i)=>n===counts.slits[i]),
      noExtraHiddenRuns:complexity.hiddenRuns<=counts.hiddenRuns,
      symmetry:symmetry.requested.length===symmetry.honoured.length,
      visibleBoundary:boundary.exact||(allowVisibleBoundaryDrift&&boundary.maxDistance<=visibleBoundaryLimit)};
    return{passed:Object.values(gates).every(Boolean),gates,imageError:image.mismatchFraction,
      geometry,paper:paper?.summary??{status:'not_checked_invalid_geometry'},features,complexity,matching:matchingSummary(solution),visibleBoundary:boundary,
      ease:{length:ease.totalCutLength,sharpTurns:ease.sharpTurns,maximumTurn:ease.maximumTurn,bending:ease.bendingEnergy}};
  };
  const initial=assess(original);report.before=initial;
  // Work on a new graph/report so rejected postprocessors cannot mutate the
  // caller's seed or overwrite its SAT optimum certificate.
  const workingGraph=asGraph(original);
  let working=workingGraph.solution(workingGraph.points,phase,input);
  working.report={...original.report};
  let best=initial.passed?original:null,bestAudit=initial;
  const consider=(candidate,stage,options={})=>{
    const audit=assess(candidate,options),matchingPreferred=cfg.preferMatchingSheets&&audit.matching.identical&&!bestAudit.matching.identical&&
      audit.imageError<=bestAudit.imageError+cfg.matchingErrorAllowance;
    const keepMatching=cfg.preferMatchingSheets&&bestAudit.matching.identical&&!audit.matching.identical;
    const accepted=audit.passed&&(!best||matchingPreferred||!keepMatching&&(audit.imageError<bestAudit.imageError||
      audit.imageError===bestAudit.imageError&&audit.ease.length<bestAudit.ease.length));
    report.attempts.push({stage,accepted,...audit});
    if(accepted){best=candidate;bestAudit=audit;}
    return audit;
  };
  const cleanupReserve=Math.min(2500,seconds*1000*.3),fitDeadline=deadline-cleanupReserve;
  const exactFitDeadline=Math.min(fitDeadline,start+Math.max(1500,seconds*1000*.4));
  let allowVisibleBoundaryDrift=false;
  if(!initial.passed&&performance.now()<fitDeadline-100){
    // The shared projection also handles nonlocal returns, which the ordinary
    // fitter's short-return-only checkpoint repair intentionally does not.
    if(initial.geometry.issues.length&&initial.geometry.issues.every(i=>['short_self_clearance','nonlocal_self_clearance'].includes(i.type))){
      const projection=projectShortReturns(workingGraph,workingGraph.points,phase,input,cfg,
        {initialAudit:initial.geometry,clearanceMargin:fittingMargin(cfg,cfg.width),
          deadline:Math.min(exactFitDeadline,performance.now()+500),maxMilliseconds:500,maxIterations:128,
          ...(preserveVisibleBoundary?{hiddenOnly:true}: {})});
      report.projection=projection.report;
      if(projection.points){workingGraph.points.set(projection.points);working=workingGraph.solution(workingGraph.points,phase,input);consider(working,'clearance projection');}
    }
    const fitted=refineCurves(workingGraph,source.probability||Float64Array.from(source.mask),source.resolution,phase,cfg,
      {input,weights:sourceWeights(source),steps,checkpointEvery:20,rate:.035,selection:'mask',
        deadline:exactFitDeadline,skipRepeatedRollbacks:true,resolvePaperBeforeRollback:true,
        paperVerificationDeadline:exactFitDeadline,onProgress:(r,candidate)=>onProgress({stage:'directRefining',...r},candidate),
        preserveVisibleBoundary,
        preferCheckpoint:(value,candidate)=>value.error<=cfg.maxImageError&&auditFeatureFidelity(source,sampleWeave(candidate,source.resolution),cfg,sourceFeatures).passed,
        stopWhen:c=>c.preferred&&c.error<=.001});
    working=workingGraph.solution(fitted.points,phase,input);
    working.report={...original.report,...(fitted.paperVerification?{paperVerification:fitted.paperVerification}:{})};
    report.fitting={steps:fitted.steps,computedSteps:fitted.computedSteps,geometryPassed:fitted.geometryPassed,
      paperPassed:fitted.paperPassed,history:fitted.history};
    consider(working,'joint Bézier refinement');
  }
  // Retry the same shared route with visible controls free only when the
  // exact-boundary phase did not produce a fully checked candidate. The
  // relaxed result remains subject to the explicit Hausdorff edge budget.
  if(!best&&preserveVisibleBoundary&&performance.now()<fitDeadline-100){
    const fallbackGraph=asGraph(original);
    const fallback=refineCurves(fallbackGraph,source.probability||Float64Array.from(source.mask),source.resolution,phase,cfg,
      {input,weights:sourceWeights(source),steps,checkpointEvery:20,rate:.035,selection:'mask',deadline:fitDeadline,
        skipRepeatedRollbacks:true,resolvePaperBeforeRollback:true,paperVerificationDeadline:fitDeadline,
        onProgress:(r,candidate)=>onProgress({stage:'relaxedVisibleRefining',...r},candidate),
        preferCheckpoint:(value,candidate)=>value.error<=cfg.maxImageError&&auditFeatureFidelity(source,sampleWeave(candidate,source.resolution),cfg,sourceFeatures).passed,
        stopWhen:c=>c.preferred&&c.error<=.001});
    const fallbackSolution=fallbackGraph.solution(fallback.points,phase,input);
    report.fallbackFitting={steps:fallback.steps,computedSteps:fallback.computedSteps,geometryPassed:fallback.geometryPassed,
      paperPassed:fallback.paperPassed,history:fallback.history};
    allowVisibleBoundaryDrift=true;
    consider(fallbackSolution,'relaxed visible-boundary refinement',{allowVisibleBoundaryDrift});
  }
  if(performance.now()<deadline-1100){
    const base=best&&best!==original?best:working;
    // Keep cleanup changes provisional until the count and source gates above
    // also pass. In particular, matching must not introduce additional cuts.
    working=finalizeFittedSolution(base,cfg,{startedAt:start,timeLimit:seconds,onProgress});
    consider(working,'ordinary final cleanup',{allowVisibleBoundaryDrift});
  }
  if(performance.now()<deadline-100){
    working=repairFinalReturns(best&&best!==original?best:working,cfg,{deadline,maxMilliseconds:800}).solution;
    const repaired=repairFinalPaper(working,cfg,{deadline,maxMilliseconds:1200});
    working=repaired.solution;report.paperRepair=repaired.report;
    consider(working,'final return and paper repair',{allowVisibleBoundaryDrift});
  }
  // Judge the selection by the rule it was accepted under: a relaxed-phase
  // candidate passes within the drift budget, and the report says so.
  const selected=best||original,after=assess(selected,{allowVisibleBoundaryDrift});
  report.after=after;report.accepted=selected!==original;report.passed=after.passed;
  report.visibleBoundaryExact=after.visibleBoundary.exact;
  report.seconds=(performance.now()-start)/1000;
  // A minimum certificate describes the exact input topology, not a later
  // approximate image fit. Retain it as seed provenance only.
  report.outputMinimumCertified=false;
  const solution={...selected,report:{...selected.report,routedRefinement:report}};
  return{solution,report};
}
