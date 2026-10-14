/** Refine an existing candidate without reverting its verified paper lattice. */
import {CurveGraph} from './curves.js';
import {refineCurves} from './refine.js';
import {verifiedPaperSettings} from '../material.js';
import {requestedSymmetry} from '../settings.js';
import {outlineDetailPlan} from './outline-details.js';

export function polishCandidate(candidate,prob,n,cfg,options={}){
  const verification=candidate.paperVerification;
  // A coarser lattice has a larger numerical margin. Reverting to it pulls
  // a fine-verified boundary inward before optimization even starts.
  const polishingCfg=verifiedPaperSettings({report:{paperVerification:verification}},cfg);
  // A valid coarse fit can sit just outside the image limit because its spans
  // cannot follow the outline yet. Subdivision only proposes extra parameters;
  // the caller still requires the unchanged source, feature and paper gates.
  const closeFeatureFit=candidate.geometryPassed&&candidate.paperPassed&&candidate.originalFeatures?.passed
    &&Number.isFinite(candidate.originalImageError)&&candidate.originalImageError<=cfg.maxImageError+.01;
  const detail=(candidate.imagePassed||closeFeatureFit)&&!options.weights&&!options.identicalSheets&&!requestedSymmetry(cfg.symmetry).length
    ?outlineDetailPlan(candidate.graph,candidate.points,candidate.phase,options.input?.sourceImage,polishingCfg):null;
  const graph=detail?.graph||new CurveGraph(candidate.graph.nested(candidate.points),cfg.width);
  const polished=refineCurves(graph,prob,n,candidate.phase,polishingCfg,{...options,...(detail?{rate:.035}:{}),onProgress:(r,solution)=>{
    if(verification)solution.report={paperVerification:{...verification,status:r.paper}};
    options.onProgress?.(r,solution);
  }});
  // Keep the provenance of an earlier checked repair when polishing finds a
  // better checkpoint. Its current geometry and paper status are rechecked.
  return{...polished,counts:candidate.counts,sharing:candidate.sharing,seed:candidate.seed,clampedFeatureRecovery:candidate.clampedFeatureRecovery,outlineDetail:detail?.report,
    ...(verification?{paperVerification:{...verification,status:polished.paper?.status}}:{})};
}
