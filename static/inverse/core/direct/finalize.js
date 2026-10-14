/** Common final selection for the direct fitter and the automatic vector route. */
import {preferMatchingSolution} from './prefer-matching.js';
import {finalizeShared} from './share.js';
import {finalizeShortReturns} from './short-returns.js';
import {finalizePrimitives} from './primitive-selection.js';
import {finalizeSharedSimplification} from './shared-simplification.js';
import {verifiedPaperSettings} from '../material.js';
import {recoverClampedFeatures} from './clamped-features.js';

export function finalizeFittedSolution(solution,cfg,{startedAt=performance.now(),timeLimit=cfg.timeLimit,onProgress=()=>{},searchMatching=true,matchingSeeds=[]}={}){
  cfg=verifiedPaperSettings(solution,cfg);
  // Remove redundant returns before measuring the independent baseline. A
  // small topology repair can unlock substantial refinement; comparing a
  // matching pair against the unrepaired error grants an inflated allowance.
  const completionDeadline=startedAt+timeLimit*1000-1000;
  // A speculative visible-boundary contraction must not spend the last half
  // second needed by ordinary shared-cut alignment. It can still complete a
  // verified checkpoint before the overall export reserve begins.
  const visibleDeadline=completionDeadline-500;
  const independent=finalizeShortReturns(solution,cfg,{deadline:Math.min(completionDeadline,performance.now()+1000),completionDeadline,visibleDeadline,onProgress});
  const matching=searchMatching?preferMatchingSolution(independent,cfg,{deadline:startedAt+Math.min(timeLimit,10)*1000-400,onProgress,gridSeeds:matchingSeeds}):independent;
  // A replacement pair can introduce different returns and shared seams.
  // Repair that selected geometry too, within the same export reserve.
  const repaired=matching===independent?matching:finalizeShortReturns(matching,cfg,{deadline:Math.min(completionDeadline,performance.now()+1000),completionDeadline,visibleDeadline,onProgress});
  const sharingStart=performance.now();
  const shared=finalizeShared(repaired,cfg,{deadline:Math.min(completionDeadline,sharingStart+2000),onProgress});
  const sharingRemaining=Math.max(0,2000-(performance.now()-sharingStart));
  const primitives=finalizePrimitives(shared,cfg,{deadline:Math.min(completionDeadline,performance.now()+500),onProgress});
  // Keep the useful first alignments. Straight-span selection can then remove
  // small bends that blocked another alignment, so recheck only changed
  // geometry, using what remains of the original two-second sharing budget.
  const aligned=primitives===shared?primitives:finalizeShared(primitives,cfg,{deadline:Math.min(completionDeadline,performance.now()+sharingRemaining),onProgress,reportKey:'finalSharingAfterPrimitives'});
  const simplified=finalizeSharedSimplification(aligned,cfg,{deadline:Math.min(completionDeadline,performance.now()+500),onProgress});
  // Successful fits keep their existing path. A close fit can still lose a
  // small source region to the optimizer's extra margin; spend at most half
  // the final reserve on a checked correction, preserving time for export.
  const result=simplified.report.refinementFeaturesPassed===false?recoverClampedFeatures(simplified,cfg,{deadline:Math.min(startedAt+timeLimit*1000-500,performance.now()+500),onProgress}):simplified;
  result.report.seconds=(performance.now()-startedAt)/1000;
  return result;
}
