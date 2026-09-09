/** Optional cut snapshots share one rate limit across every route of a solve. */
import {solutionJSON} from './graph.js';

const reporters=new WeakSet();
export const GEOMETRY_INTERVAL_MS=250;

export function progressReporter(onProgress,enabled,{now=()=>performance.now()}={}){
  // solveTarget, the direct fitter and nested MILP probes can all enter here.
  // Reuse their reporter so switching routes never resets the message budget.
  if(reporters.has(onProgress))return onProgress;
  let nextGeometry=-Infinity;
  const report=(event,solution)=>{
    const checkpoint=event.stage==='directRefining'&&Number.isInteger(event.step);
    const incumbent=event.stage==='solving'&&event.validatedIncumbent===true;
    if(enabled&&solution&&(checkpoint||incumbent)&&now()>=nextGeometry){
      // Serialize only after the rate check. A string also owns its coordinates:
      // later refinement/rounding or a listener cannot change this snapshot.
      const geometry=JSON.stringify(solutionJSON(solution));
      nextGeometry=now()+GEOMETRY_INTERVAL_MS;
      onProgress({...event,geometry});
    }else onProgress(event);
  };
  reporters.add(report);
  return report;
}
