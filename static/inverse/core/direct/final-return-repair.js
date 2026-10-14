/** Final bounded geometry repair. Every candidate must preserve the observed
 * artwork, fixed controls, requested symmetry and any existing matching pair. */
import {CurveGraph} from './curves.js';
import {projectShortReturns} from './short-return-project.js';
import {curvesOf} from '../graph.js';
import {validate,sampleWeave} from '../validate.js';
import {materialAudit} from '../material.js';
import {referenceError,sourceWeights} from '../image-reference.js';
import {auditFeatureFidelityChange} from '../feature-shapes.js';
import {matchingSummary} from './matching.js';
import {symmetryReport,orbitObjective,symmetryOrbit} from './symmetry.js';
import {refineCurves} from './refine.js';

export function repairFinalReturns(solution,cfg,{deadline=Infinity,maxMilliseconds=2000}={}){
 if(!Number.isFinite(maxMilliseconds)||maxMilliseconds<=0)throw new RangeError('Final repair needs a finite positive time allowance.');
 const limit=Math.min(deadline,performance.now()+maxMilliseconds),report={attempted:false,accepted:false,attempts:[]};
 const originalAudit=validate(solution,cfg,{checkImage:false,finalGeometry:true});
 const unchanged=()=>({solution,validation:originalAudit,report});
 if(originalAudit.passed)return unchanged();
 if(!originalAudit.issues.every(i=>i.type==='short_self_clearance')){report.rejected='other_geometry';return unchanged();}
 if(performance.now()>=limit){report.rejected='deadline';return unchanged();}
 const input=solution.graph.target,source=input.sourceImage,resolution=source?.resolution??400;
 const before=sampleWeave(solution,resolution),errorBefore=source?referenceError(source,before):null;
 const paths=solution.paths.map((f,k)=>f.map((_,slit)=>curvesOf(solution,k,slit).map(c=>c.p)));
 const graph=new CurveGraph(paths,cfg.width),original=graph.points.slice(),phase=input.phase?-1:1;
 const reconstructed=sampleWeave(graph.solution(original,phase,input),resolution);
 if(reconstructed.some((v,i)=>v!==before[i])){report.rejected='reconstruction_changed_weave';return unchanged();}
 const matchingBefore=matchingSummary(solution);
 // With no original image, hidden controls may be repaired but the visible
 // cutting artwork must remain exactly fixed.
 for(const hiddenOnly of source?[true,false]:[true]){
  if(performance.now()>=limit)break;
  const started=performance.now();
  const repair=projectShortReturns(graph,original,phase,input,cfg,{hiddenOnly,deadline:limit,maxIterations:64,maxMilliseconds});
  const attempt={hiddenOnly,projection:repair.report,accepted:false};report.attempts.push(attempt);report.attempted||=repair.report.attempted;
  if(!repair.points){attempt.milliseconds=performance.now()-started;continue;}
  let points=repair.points,candidate=graph.solution(points,phase,input),woven=sampleWeave(candidate,resolution);
  let error=source?referenceError(source,woven):null,validation=repair.validation;
  // A feasible projection can move visible boundaries away from their image.
  // Recover that error with the main fitter, retaining only checkpoints which
  // pass the complete return rule. This uses the same overall repair deadline.
  if(!hiddenOnly&&source&&error.mismatchFraction>errorBefore.mismatchFraction&&performance.now()<limit-200){
    const polishingGraph=new CurveGraph(paths,cfg.width);polishingGraph.points.set(points);
    const symmetry=matchingBefore.identical?{...cfg.symmetry,transpose:true}:cfg.symmetry;
    const objective=orbitObjective(Float64Array.from(source.mask),resolution,symmetryOrbit(symmetry),sourceWeights(source));
    const fitted=refineCurves(polishingGraph,objective.probability,resolution,phase,{...cfg,preferMatchingSheets:false,symmetry},{input,weights:objective.weights,steps:160,rate:.008,selection:'mask',identicalSheets:matchingBefore.identical,finalGeometry:true,deadline:limit-100});
    attempt.refinement={steps:fitted.steps,geometryPassed:fitted.geometryPassed,paperPassed:fitted.paperPassed,history:fitted.history};
    if(fitted.geometryPassed&&fitted.paperPassed){
      const refined=polishingGraph.solution(fitted.points,phase,input),pixels=sampleWeave(refined,resolution),refinedError=referenceError(source,pixels);
      if(refinedError.mismatchFraction<error.mismatchFraction){points=fitted.points;candidate=refined;woven=pixels;error=refinedError;validation=fitted.validation;}
    }
  }
  const symmetry=symmetryReport(candidate,cfg.symmetry),matching=matchingSummary(candidate),paper=materialAudit(candidate,cfg).summary;
  const features=source?auditFeatureFidelityChange(source,before,woven,cfg):{passed:true};
  attempt.error=error;attempt.errorBefore=errorBefore;attempt.paper=paper;attempt.features=features;
  const displacementLimit=hiddenOnly?cfg.nominalWidth:Math.min(cfg.nominalWidth,.015*graph.width);
  attempt.gates={geometry:validation.passed,fixedPreserved:points.every((v,i)=>!graph.fixed[i]||v===original[i]),displacementBounded:points.every((v,i)=>Number.isFinite(v)&&Math.abs(v-original[i])<=displacementLimit),matchingPreserved:!matchingBefore.identical||matching.identical,symmetryPreserved:symmetry.requested.length===symmetry.honoured.length,paper:paper.status==='pass',features:features.passed,imageNotWorse:source?Number.isFinite(error.mismatchFraction)&&error.mismatchFraction<=errorBefore.mismatchFraction:woven.every((v,i)=>v===before[i])};
  attempt.milliseconds=performance.now()-started;
  attempt.accepted=Object.values(attempt.gates).every(Boolean);
  if(!attempt.accepted)continue;
  candidate.graph.metadata={...solution.graph.metadata};candidate.graph.target.metadata={...input.metadata};
  candidate.report={...solution.report};
  if(solution.automaticSettings)candidate.automaticSettings=solution.automaticSettings;
  report.accepted=true;
  return{solution:candidate,validation,report};
 }
 return unchanged();
}
