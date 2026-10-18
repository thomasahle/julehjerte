/** Optional cut snapshots share one rate limit across every route of a solve. */
import {solutionJSON} from './graph.js';

const reporters=new WeakMap();
export const GEOMETRY_INTERVAL_MS=250;

export function progressReporter(onProgress,enabled,{now=()=>performance.now(),onCandidate}={}){
  // solveTarget, the direct fitter and nested MILP probes can all enter here.
  // Reuse their reporter so switching routes never resets the message budget.
  if(reporters.has(onProgress))return onProgress;
  let nextGeometry=-Infinity;
  const capture=(event,solution,snapshot)=>{
    if(onCandidate&&solution&&(event.validatedIncumbent===true||event.geometry===true&&event.paper==='pass'))
      onCandidate({geometry:snapshot(),counts:solution.paths.map(p=>p.length),error:Number.isFinite(event.error)?event.error:null,score:Number.isFinite(event.score)?event.score:null,stage:event.stage,step:event.step,
        ...(solution.report?.paperVerification?{materialResolution:solution.report.paperVerification.resolution}:{})});
  };
  const report=(event,solution)=>{
    if(!solution){onProgress(event);return;}
    // The controller retains completed validated checkpoints independently of
    // the optional, throttled pictures shown in the UI. Serialize once when
    // both consumers need this checkpoint; neither receives mutable curves.
    let geometry;
    const snapshot=()=>geometry??=JSON.stringify(solutionJSON(solution));
    capture(event,solution,snapshot);
    const checkpoint=event.stage==='directRefining'&&Number.isInteger(event.step);
    const incumbent=event.stage==='solving'&&event.validatedIncumbent===true;
    if(enabled&&solution&&(checkpoint||incumbent)&&now()>=nextGeometry){
      // Serialize only after the rate check. A string also owns its coordinates:
      // later refinement/rounding or a listener cannot change this snapshot.
      geometry=snapshot();
      nextGeometry=now()+GEOMETRY_INTERVAL_MS;
      onProgress({...event,geometry});
    }else onProgress(event);
  };
  reporters.set(report,{capture,observed:!!onCandidate});
  return report;
}

/** A validated initializer need not be drawn as a live refinement preview. */
export function emitCandidate(onProgress,event,solution){
  reporters.get(onProgress)?.capture(event,solution,()=>JSON.stringify(solutionJSON(solution)));
}
export const hasCandidateObserver=onProgress=>!!reporters.get(onProgress)?.observed;
