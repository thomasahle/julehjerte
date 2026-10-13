/** Refine an existing candidate without reverting its verified paper lattice. */
import {CurveGraph} from './curves.js';
import {refineCurves} from './refine.js';
import {verifiedPaperSettings} from '../material.js';

export function polishCandidate(candidate,prob,n,cfg,options={}){
  const verification=candidate.paperVerification;
  // A coarser lattice has a larger numerical margin. Reverting to it pulls
  // a fine-verified boundary inward before optimization even starts.
  const polishingCfg=verifiedPaperSettings({report:{paperVerification:verification}},cfg);
  const graph=new CurveGraph(candidate.graph.nested(candidate.points),cfg.width);
  const polished=refineCurves(graph,prob,n,candidate.phase,polishingCfg,{...options,onProgress:(r,solution)=>{
    if(verification)solution.report={paperVerification:{...verification,status:r.paper}};
    options.onProgress?.(r,solution);
  }});
  return{...polished,counts:candidate.counts,sharing:candidate.sharing,seed:candidate.seed,
    ...(verification?{paperVerification:{...verification,status:polished.paper?.status}}:{})};
}
