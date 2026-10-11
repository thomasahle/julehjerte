/** Common final selection for the direct fitter and the automatic vector route. */
import {preferMatchingSolution} from './prefer-matching.js';
import {finalizeShared} from './share.js';
import {finalizeShortReturns} from './short-returns.js';
import {finalizePrimitives} from './primitive-selection.js';
import {finalizeSharedSimplification} from './shared-simplification.js';

export function finalizeFittedSolution(solution,cfg,{startedAt=performance.now(),timeLimit=cfg.timeLimit,onProgress=()=>{},searchMatching=true}={}){
  // Remove redundant returns before measuring the independent baseline. A
  // small topology repair can unlock substantial refinement; comparing a
  // matching pair against the unrepaired error grants an inflated allowance.
  const completionDeadline=startedAt+timeLimit*1000-1000;
  const independent=finalizeShortReturns(solution,cfg,{deadline:Math.min(completionDeadline,performance.now()+1000),completionDeadline,onProgress});
  const matching=searchMatching?preferMatchingSolution(independent,cfg,{deadline:startedAt+Math.min(timeLimit,10)*1000-400,onProgress}):independent;
  // A replacement pair can introduce different returns and shared seams.
  // Repair that selected geometry too, within the same export reserve.
  const repaired=matching===independent?matching:finalizeShortReturns(matching,cfg,{deadline:Math.min(completionDeadline,performance.now()+1000),completionDeadline,onProgress});
  const shared=finalizeShared(repaired,cfg,{deadline:Math.min(startedAt+timeLimit*1000-1000,performance.now()+2000),onProgress});
  const primitives=finalizePrimitives(shared,cfg,{deadline:Math.min(startedAt+timeLimit*1000-1000,performance.now()+500),onProgress});
  const result=finalizeSharedSimplification(primitives,cfg,{deadline:Math.min(startedAt+timeLimit*1000-1000,performance.now()+500),onProgress});
  result.report.seconds=(performance.now()-startedAt)/1000;
  return result;
}
