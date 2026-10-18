/** Original-image and paper gates shared by fitted and recovered finalists. */
import {sampleWeave} from '../validate.js';
import {materialAudit} from '../material.js';
import {auditFeatureFidelity,auditFeatureFidelityChange} from '../feature-shapes.js';
import {maskDisagreement} from './prefer-matching.js';

export function assessCandidate(c,input,cfg,{deadline=Infinity,sourceFeatures,recheckFailed=false,approximationReference=null}={}){
  const source=input.sourceImage;
  c.approximationImproves=false;
  if(!c.geometryPassed)return false;
  const s=c.graph.solution(c.points,c.phase,input),woven=sampleWeave(s,source.resolution);
  c.originalImageError=maskDisagreement(source,woven);c.originalFeatures=auditFeatureFidelity(source,woven,cfg,sourceFeatures);
  if(c.originalImageError>cfg.maxImageError)return false;
  if(!c.originalFeatures.passed){
    // A known unresolved feature still prevents acceptance. It must not also
    // prevent verifying a better approximation's paper, provided no previously
    // retained feature is lost. This reference must itself have checked cuts.
    const previous=approximationReference;
    if(!previous?.geometryPassed||!previous.paperPassed||previous.originalFeatures?.passed!==false||!(c.originalImageError<previous.originalImageError))return false;
    const before=sampleWeave(previous.graph.solution(previous.points,previous.phase,input),source.resolution);
    if(!auditFeatureFidelityChange(source,before,woven,cfg,sourceFeatures).passed)return false;
    c.approximationImproves=true;
  }
  // A coarse lattice may be inconclusive or miss a narrow connection that
  // finer sampling resolves. Recheck a failed lattice only when the caller
  // explicitly offers its retained geometric alternative. Full acceptance
  // still requires every feature; an incomplete improvement retains its
  // warning. Final export rechecks the actual finer resolution after every edit.
  // A 700-cell core can still split a real connection into significant
  // floating fragments. Resolve that uncertainty at the supported maximum
  // before discarding the same good image fit. Retain the actual resolution
  // for Stop/export, and never spend the final half-second reserve here.
  const checkedResolution=c.paperVerification?.resolution??cfg.materialResolution;
  for(const resolution of [700,1000]){
    if(c.paperPassed||!(c.paper?.status==='uncertain'||recheckFailed&&c.paper?.status==='fail'))break;
    if(resolution<=checkedResolution)continue;
    if(deadline-performance.now()<=500)break;
    const initialStatus=c.paperVerification?.initialStatus??c.paper.status;
    const paper=materialAudit(s,{...cfg,materialResolution:resolution});
    c.paperVerification={...c.paperVerification,requestedResolution:cfg.materialResolution,initialStatus,resolution,status:paper.status};
    c.paperPassed=paper.passed;c.paper=paper.summary;
  }
  return c.paperPassed&&c.originalFeatures.passed;
}
