/** Common final selection for the direct fitter and the automatic vector route. */
import {preferMatchingSolution} from './prefer-matching.js';
import {finalizeShared} from './share.js';
import {finalizePrimitives} from './primitive-selection.js';
import {finalizeSharedSimplification} from './shared-simplification.js';

export function finalizeFittedSolution(solution,cfg,{startedAt=performance.now(),timeLimit=cfg.timeLimit,onProgress=()=>{},searchMatching=true}={}){
  const matching=searchMatching?preferMatchingSolution(solution,cfg,{deadline:startedAt+Math.min(timeLimit,10)*1000-400,onProgress}):solution;
  // Repair the actual selected pair after any matching-sheet replacement.
  // Reserve export time and bound cleanup within the requested solve budget.
  const shared=finalizeShared(matching,cfg,{deadline:Math.min(startedAt+timeLimit*1000-1000,performance.now()+2000),onProgress});
  const primitives=finalizePrimitives(shared,cfg,{deadline:Math.min(startedAt+timeLimit*1000-1000,performance.now()+500),onProgress});
  const result=finalizeSharedSimplification(primitives,cfg,{deadline:Math.min(startedAt+timeLimit*1000-1000,performance.now()+500),onProgress});
  result.report.seconds=(performance.now()-startedAt)/1000;
  return result;
}
