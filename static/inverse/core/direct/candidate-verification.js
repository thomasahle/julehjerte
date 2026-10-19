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
  verifyCandidatePaper(c,input,cfg,{deadline,recheckFailed});
  return c.paperPassed&&c.originalFeatures.passed;
}

/** Resolve only the paper uncertainty of unchanged, geometry-checked cuts.
 * This may fund further refinement of an imperfect image fit; it never
 * certifies image fidelity or makes that candidate an accepted result. */
export function verifyCandidatePaper(c,input,cfg,{deadline=Infinity,recheckFailed=false}={}){
  if(!c.geometryPassed)return false;
  // Finer raster sampling can resolve lattice uncertainty, but cannot repair
  // a disconnected polygon-offset core at these unchanged coordinates.
  if(c.paper?.offset&&c.paper.offset.status!=='pass')return false;
  if(c.paperPassed)return true;
  if(!(c.paper?.status==='uncertain'||recheckFailed&&c.paper?.status==='fail'))return false;
  const s=c.graph.solution(c.points,c.phase,input);
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
  return c.paperPassed;
}

/** Recheck the retained polish coordinates at the next supported lattice.
 * The incumbent's pass belongs to different coordinates: carry only the
 * lattice resolution, never its successful paper status, to the alternative.
 */
export function assessPolishingAlternative(polished,input,cfg,options={}){
  const retained=polished.paperAlternative;
  if(!retained||polished.imagePassed&&retained.error>=polished.error)return null;
  const resolution=retained.paperVerification?.resolution??polished.paperVerification?.resolution??cfg.materialResolution;
  const alternative={...polished,...retained,paperAlternative:null,paperPassed:false,
    paperVerification:{requestedResolution:cfg.materialResolution,initialStatus:retained.paper.status,resolution,status:retained.paper.status}};
  alternative.imagePassed=assessCandidate(alternative,input,cfg,options);
  return alternative;
}
