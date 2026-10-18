/** Correct a detected paper-core defect with the main constrained fitter.
 * Valid inputs are returned unchanged; source, fixed controls, matching and
 * requested symmetries remain constraints of any accepted correction. */
import {CurveGraph} from './curves.js';
import {curvesOf} from '../graph.js';
import {validate,sampleWeave} from '../validate.js';
import {geometricMaterialAudit,finalMaterialAudit} from '../geometric-material.js';
import {referenceError,sourceWeights} from '../image-reference.js';
import {auditFeatureFidelityChange} from '../feature-shapes.js';
import {matchingSummary} from './matching.js';
import {symmetryReport,orbitObjective,symmetryOrbit} from './symmetry.js';
import {refineCurves} from './refine.js';

export function repairFinalPaper(solution,cfg,{deadline=Infinity,maxMilliseconds=1500,includeMaps=false}={}){
  if(!Number.isFinite(maxMilliseconds)||maxMilliseconds<=0)throw new RangeError('Paper repair needs a finite positive time allowance.');
  const start=performance.now(),limit=Math.min(deadline,start+maxMilliseconds),report={attempted:false,accepted:false,attempts:[],budgetMilliseconds:Math.max(0,limit-start)};
  let material=null;
  const unchanged=()=>({solution,report,material});
  if(!cfg.requireMaterialCore){report.rejected='paper_check_disabled';return unchanged();}
  const geometry=validate(solution,cfg,{checkImage:false,finalGeometry:true});
  if(!geometry.passed){report.rejected='geometry';return unchanged();}
  material=finalMaterialAudit(solution,cfg,{includeMaps});
  const audit=material.offset;report.before=audit.summary;
  if(audit.passed)return unchanged();
  if(audit.status!=='fail'){report.rejected='uncertain_offset';return unchanged();}
  const input=solution.graph.target,source=input.sourceImage;
  if(!source){report.rejected='no_source_image';return unchanged();}
  if(performance.now()>=limit-200){report.rejected='deadline';return unchanged();}
  const width=input.width,foldFamilies=[],localFamilies=[];
  for(const f of audit.families){
    if(f.status==='pass')continue;
    const floating=f.parts.filter(p=>!p.anchored&&p.significant);
    if(floating.some(p=>p.bounds[1]<=width&&p.bounds[3]>=width)||f.foldIntervals.some(i=>i.anchoredCoreLength<=1e-8))foldFamilies.push(f.family);
    if(floating.some(p=>p.bounds[3]<width||p.bounds[1]>width))localFamilies.push(f.family);
  }
  if(!foldFamilies.length&&!localFamilies.length){report.rejected='unsupported_defect';return unchanged();}
  const paths=solution.paths.map((f,k)=>f.map((_,i)=>curvesOf(solution,k,i).map(c=>c.p))),graph=new CurveGraph(paths,width),original=graph.points.slice(),phase=input.phase?-1:1;
  const before=sampleWeave(solution,source.resolution),reconstructed=sampleWeave(graph.solution(original,phase,input),source.resolution);
  if(reconstructed.some((v,i)=>v!==before[i])){report.rejected='reconstruction_changed_weave';return unchanged();}
  const errorBefore=referenceError(source,before),matchingBefore=matchingSummary(solution);
  const symmetry=matchingBefore.identical?{...cfg.symmetry,transpose:true}:cfg.symmetry;
  const objective=orbitObjective(source.probability||Float64Array.from(source.mask),source.resolution,symmetryOrbit(symmetry),sourceWeights(source));
  const paperRecovery={foldFamilies,localFamilies};
  const attempt={paperRecovery,errorBefore,accepted:false};report.attempted=true;report.attempts.push(attempt);
  // Cheap nominal offsets guide checkpoints. All radius probes and the old
  // lattice rule are reapplied to the selected candidate below.
  const checkpointAudit=(s,c)=>geometricMaterialAudit(s,c,{tolerance:.002,probeRadii:false});
  const fitted=refineCurves(graph,objective.probability,source.resolution,phase,{...cfg,preferMatchingSheets:false,symmetry},{input,weights:objective.weights,steps:160,rate:.002,selection:'mask',identicalSheets:matchingBefore.identical,finalGeometry:true,deadline:limit-100,paperRecovery,paperAudit:checkpointAudit});
  attempt.refinement={steps:fitted.steps,geometryPassed:fitted.geometryPassed,paperPassed:fitted.paperPassed,history:fitted.history};
  const points=fitted.points,candidate=graph.solution(points,phase,input),woven=sampleWeave(candidate,source.resolution),error=referenceError(source,woven);
  let paper=finalMaterialAudit(candidate,cfg,{includeMaps}),paperVerification=null;
  // The offset repair can succeed while a coarse rolling-disk lattice cannot
  // resolve the repaired connection. Finish verification of these coordinates
  // at one finer supported resolution, rather than discarding a good repair.
  // This is a bounded final audit, not further optimization; as with the first
  // final audit above it completes after the search cutoff. Neither a failed
  // lattice nor uncertain offsets qualify, and both models must then pass.
  if(paper.offset.passed&&paper.summary.latticeStatus==='uncertain'&&cfg.materialResolution<1000){
    const resolution=cfg.materialResolution<700?700:1000,at=performance.now();
    paper=finalMaterialAudit(candidate,{...cfg,materialResolution:resolution},{includeMaps});
    paperVerification={source:'final-paper-repair',requestedResolution:cfg.materialResolution,initialStatus:'uncertain',resolution,status:paper.status,seconds:(performance.now()-at)/1000};
    attempt.paperVerification=paperVerification;
  }
  const validation=validate(candidate,cfg,{checkImage:false,finalGeometry:true}),features=auditFeatureFidelityChange(source,before,woven,cfg),matching=matchingSummary(candidate),symmetryCheck=symmetryReport(candidate,cfg.symmetry);
  attempt.error=error;attempt.errorChange=error.mismatchFraction-errorBefore.mismatchFraction;attempt.paper=paper.summary;attempt.features=features;
  attempt.gates={geometry:validation.passed,paper:paper.passed,fixedPreserved:points.every((v,i)=>!graph.fixed[i]||v===original[i]),displacementBounded:points.every((v,i)=>Number.isFinite(v)&&Math.abs(v-original[i])<=cfg.nominalWidth),matchingPreserved:!matchingBefore.identical||matching.identical,symmetryPreserved:symmetryCheck.requested.length===symmetryCheck.honoured.length,features:features.passed,imageAccepted:Number.isFinite(error.mismatchFraction)&&error.mismatchFraction<=cfg.maxImageError};
  attempt.accepted=Object.values(attempt.gates).every(Boolean);
  if(!attempt.accepted)return unchanged();
  candidate.graph.metadata={...solution.graph.metadata};candidate.graph.target.metadata={...input.metadata};candidate.report={...solution.report};
  if(paperVerification)candidate.report.paperVerification=paperVerification;
  if(solution.automaticSettings)candidate.automaticSettings=solution.automaticSettings;
  report.accepted=true;return{solution:candidate,report,material:paper};
}
