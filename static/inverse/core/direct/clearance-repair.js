/** A clearance initializer is a starting shape, not a finished template.
 * Use the common fitter for one bounded repair; retain every final gate.
 */
import {refineCurves} from './refine.js';
import {validate,sampleWeave} from '../validate.js';
import {materialAudit} from '../material.js';
import {auditFeatureFidelity} from '../feature-shapes.js';
import {maskDisagreement} from './prefer-matching.js';
import {requestedSymmetry} from '../settings.js';

export function repairClearanceInitializer(prepared,input,cfg,{deadline=Infinity,geometry=null,recoverFeatures=false,onProgress=()=>{}}={}){
  const started=performance.now(),until=Math.min(deadline,started+1200),report={accepted:false,method:'clearance-initializer-refinement'};
  const finish=reason=>({candidate:null,report:{...report,reason,seconds:(performance.now()-started)/1000}});
  if(until-started<900)return finish('insufficient_time');
  const source=input.sourceImage;
  if(!source||source.weights||requestedSymmetry(cfg.symmetry).length)return finish('unsupported_constraints');
  const {graph,clear,objectiveProb,objectiveWeights}=prepared,phase=clear.phase;
  report.initialGeometry=geometry||validate(graph.solution(graph.points,phase,input),cfg,{checkImage:false});
  report.trigger=recoverFeatures?'missing-source-feature':'inter-slit-clearance';
  if(report.initialGeometry.passed?!recoverFeatures:(!report.initialGeometry.issues.length||report.initialGeometry.issues.some(i=>i.type!=='inter_slit_clearance')))return finish('geometry_not_repairable');
  if(recoverFeatures)report.initialImageError=maskDisagreement(source,sampleWeave(graph.solution(graph.points,phase,input),source.resolution));
  const n=Math.sqrt(objectiveProb.length);
  // A valid starting grid supplies a rollback position. Resolve uncertain
  // paper checkpoints as in the main fit, so that this incumbent does not
  // repeatedly erase a better trajectory. Keep the same total repair cap.
  const fitted=refineCurves(graph,objectiveProb,n,phase,{...cfg,preferMatchingSheets:false},{input,weights:objectiveWeights,rate:.05,resolvePaperBeforeRollback:true,deadline:recoverFeatures?until-450:Math.min(started+500,until-450),onProgress});
  report.steps=fitted.steps;report.history=fitted.history;
  if(performance.now()>until)return finish('deadline');
  // The last useful checkpoint can miss the in-loop verification reserve.
  // It remains unaccepted until its actual curves pass the finer audit here.
  // Compare against the retained incumbent using the unchanged source mask.
  const checkpoints=[fitted,...(fitted.paperAlternative?[fitted.paperAlternative]:[])].map(candidate=>{
    const solution=graph.solution(candidate.points,phase,input),woven=sampleWeave(solution,source.resolution);
    return{candidate,solution,imageError:maskDisagreement(source,woven),features:auditFeatureFidelity(source,woven,cfg)};
  }).sort((a,b)=>a.imageError-b.imageError);
  let reason='refinement_rejected';report.checkpoints=[];
  for(const {candidate,solution,imageError,features}of checkpoints){
    if(performance.now()>until)return finish('deadline');
    const geometry=validate(solution,cfg,{checkImage:false,finalGeometry:true});
    const check={imageError,featuresPassed:features.passed,geometryPassed:geometry.passed,paperAlternative:candidate!==fitted};report.checkpoints.push(check);
    Object.assign(report,{geometry,imageError,features});
    const imagePassed=imageError<=cfg.maxImageError;
    // This bounded stage prepares a starting shape. A legal, feature-retaining
    // improvement may need the main fit's remaining time to meet the final
    // image limit. Keep that handoff separate from an accepted template.
    if(!geometry.passed||!features.passed||!imagePassed&&!(recoverFeatures&&imageError<report.initialImageError))continue;
    const resolution=Math.max(cfg.materialResolution,candidate.paperVerification?.resolution||0,candidate!==fitted?700:0);
    let paper=materialAudit(solution,{...cfg,materialResolution:resolution}),verification=null;
    report.initialPaper=paper.summary;
    if(resolution>cfg.materialResolution)verification={requestedResolution:cfg.materialResolution,initialStatus:'uncertain',resolution,status:paper.status,source:'clearance-initializer-refinement'};
    if(paper.status==='uncertain'&&resolution<700&&until-performance.now()>200){
      paper=materialAudit(solution,{...cfg,materialResolution:700});
      verification={requestedResolution:cfg.materialResolution,initialStatus:'uncertain',resolution:700,status:paper.status,source:'clearance-initializer-refinement'};
    }
    report.paper=paper.summary;check.paper=paper.status;
    if(!paper.passed){reason='paper_rejected';continue;}
    if(performance.now()>until)return finish('deadline');
    report.paperVerification=verification;report.usedPaperAlternative=candidate!==fitted;
    const repaired={...fitted,...candidate,paperAlternative:null,counts:clear.model.counts.slice(),seed:'clearance-repair',geometryPassed:true,validation:geometry,paperPassed:paper.passed,paper:paper.summary,paperVerification:verification};
    report.accepted=imagePassed;report.seconds=(performance.now()-started)/1000;
    if(!imagePassed)return{candidate:null,continuation:repaired,report:{...report,continued:true,reason:'continue_refinement'}};
    return{candidate:repaired,report};
  }
  return finish(reason);
}
