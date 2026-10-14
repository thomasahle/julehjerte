/** Refine an existing candidate without reverting its verified paper lattice. */
import {CurveGraph} from './curves.js';
import {refineCurves} from './refine.js';
import {verifiedPaperSettings} from '../material.js';
import {requestedSymmetry} from '../settings.js';
import {outlineDetailPlan} from './outline-details.js';
import {featurePolishPlan} from './feature-details.js';
import {imageFeatures} from '../image-features.js';

export function polishCandidate(candidate,prob,n,cfg,options={}){
  const verification=candidate.paperVerification;
  // A coarser lattice has a larger numerical margin. Reverting to it pulls
  // a fine-verified boundary inward before optimization even starts.
  const polishingCfg=verifiedPaperSettings({report:{paperVerification:verification}},cfg);
  // A recovered opening can improve for only a few steps before a return
  // becomes too tight. Preserve those short valid steps, and keep distant
  // strips fixed so their paper margins cannot displace the useful checkpoint.
  const source=options.input?.sourceImage,independent=!options.weights&&!options.identicalSheets&&!requestedSymmetry(cfg.symmetry).length;
  const local=candidate.seed==='fitted-boundary-rerouting'&&candidate.imagePassed&&source&&independent
    ?featurePolishPlan(candidate.graph,candidate.points,source,imageFeatures(source,cfg.width),polishingCfg,n):null;
  // A valid coarse fit can sit just outside the image limit because its spans
  // cannot follow the outline yet. Subdivision only proposes extra parameters;
  // the caller still requires the unchanged source, feature and paper gates.
  const closeFeatureFit=candidate.geometryPassed&&candidate.paperPassed&&candidate.originalFeatures?.passed
    &&Number.isFinite(candidate.originalImageError)&&candidate.originalImageError<=cfg.maxImageError+.01;
  const detail=!local&&(candidate.imagePassed||closeFeatureFit)&&independent
    ?outlineDetailPlan(candidate.graph,candidate.points,candidate.phase,options.input?.sourceImage,polishingCfg):null;
  const graph=local?.graph||detail?.graph||new CurveGraph(candidate.graph.nested(candidate.points),cfg.width);
  let polished;
  try{
    polished=refineCurves(graph,local?.objective.probability||prob,n,candidate.phase,polishingCfg,{...options,
      ...(local?{weights:local.objective.weights,steps:Math.min(options.steps??16,16),checkpointEvery:4}:{}),...(detail?{rate:.035}:{}),onProgress:(r,solution)=>{
        if(verification)solution.report={paperVerification:{...verification,status:r.paper}};
        options.onProgress?.(r,solution);
      }});
  }finally{
    // The temporary scope must not constrain a later final repair or edit.
    if(local)graph.fixed.set(local.originalFixed);
  }
  // Keep the provenance of an earlier checked repair when polishing finds a
  // better checkpoint. Its current geometry and paper status are rechecked.
  return{...polished,counts:candidate.counts,sharing:candidate.sharing,seed:candidate.seed,clampedFeatureRecovery:candidate.clampedFeatureRecovery,outlineDetail:detail?.report,localFeaturePolish:local?.report,
    ...(verification?{paperVerification:{...verification,status:polished.paper?.status}}:{})};
}
