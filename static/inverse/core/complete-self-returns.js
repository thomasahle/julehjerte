/** Final return checks use the editor's units, tolerance and endpoint policy. */
import {curvesOf} from './graph.js';
import {heartPathReturns,HEART_CLEARANCE_UNITS} from './return-search.js';
export function completeSelfReturns(solution){
  const margin=HEART_CLEARANCE_UNITS*solution.graph.target.width/100,issues=[];
  for(let family=0;family<2;family++)for(let slit=0;slit<solution.paths[family].length;slit++){
    const controls=curvesOf(solution,family,slit).map(curve=>curve.p);
    for(const issue of heartPathReturns(controls,margin)){
      issues.push({family,slit,...issue,edgeChain:solution.paths[family][slit].slice(issue.curves[0],issue.curves[1]+1).map(([edge])=>edge)});
    }
  }
  return issues;
}
