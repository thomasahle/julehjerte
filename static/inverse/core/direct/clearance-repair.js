/** A clearance initializer is a starting shape, not a finished template.
 * Use the common fitter for one bounded repair; retain every final gate.
 */
import {refineCurves} from './refine.js';
import {validate,sampleWeave} from '../validate.js';
import {materialAudit} from '../material.js';
import {auditFeatureFidelity} from '../feature-shapes.js';
import {maskDisagreement} from './prefer-matching.js';
import {requestedSymmetry} from '../settings.js';

export function repairClearanceInitializer(prepared,input,cfg,{deadline=Infinity,geometry=null,onProgress=()=>{}}={}){
  const started=performance.now(),until=Math.min(deadline,started+1200),report={accepted:false,method:'clearance-initializer-refinement'};
  const finish=reason=>({candidate:null,report:{...report,reason,seconds:(performance.now()-started)/1000}});
  if(until-started<900)return finish('insufficient_time');
  const source=input.sourceImage;
  if(!source||source.weights||requestedSymmetry(cfg.symmetry).length)return finish('unsupported_constraints');
  const {graph,clear,objectiveProb,objectiveWeights}=prepared,phase=clear.phase;
  report.initialGeometry=geometry||validate(graph.solution(graph.points,phase,input),cfg,{checkImage:false});
  if(report.initialGeometry.passed||!report.initialGeometry.issues.length||report.initialGeometry.issues.some(i=>i.type!=='inter_slit_clearance'))return finish('geometry_not_repairable');
  const n=Math.sqrt(objectiveProb.length);
  const fitted=refineCurves(graph,objectiveProb,n,phase,{...cfg,preferMatchingSheets:false},{input,weights:objectiveWeights,rate:.05,deadline:Math.min(started+500,until-450),onProgress});
  report.steps=fitted.steps;report.history=fitted.history;
  if(performance.now()>until)return finish('deadline');
  const solution=graph.solution(fitted.points,phase,input),woven=sampleWeave(solution,source.resolution);
  report.geometry=validate(solution,cfg,{checkImage:false,finalGeometry:true});
  report.imageError=maskDisagreement(source,woven);report.features=auditFeatureFidelity(source,woven,cfg);
  if(!report.geometry.passed||report.imageError>cfg.maxImageError||!report.features.passed)return finish('refinement_rejected');
  let paper=materialAudit(solution,cfg);
  report.initialPaper=paper.summary;
  if(paper.status==='uncertain'&&cfg.materialResolution<700&&until-performance.now()>200){
    paper=materialAudit(solution,{...cfg,materialResolution:700});
    report.paperVerification={requestedResolution:cfg.materialResolution,initialStatus:'uncertain',resolution:700,status:paper.status,source:'clearance-initializer-refinement'};
  }
  report.paper=paper.summary;
  if(!paper.passed)return finish('paper_rejected');
  if(performance.now()>until)return finish('deadline');
  report.accepted=true;report.seconds=(performance.now()-started)/1000;
  return{candidate:{...fitted,counts:clear.model.counts.slice(),seed:'clearance-repair',geometryPassed:true,validation:report.geometry,paperPassed:paper.passed,paper:paper.summary,paperVerification:report.paperVerification},report};
}
