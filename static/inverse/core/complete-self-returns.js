/** Final return checks use the editor's units, tolerance and endpoint policy. */
import {curvesOf} from './graph.js';
import {heartPathReturns,HEART_CLEARANCE_UNITS} from './return-search.js';
export function completeSelfReturns(solution,{cache=null}={}){
  const margin=HEART_CLEARANCE_UNITS*solution.graph.target.width/100,issues=[];
  for(let family=0;family<2;family++)for(let slit=0;slit<solution.paths[family].length;slit++){
    const controls=curvesOf(solution,family,slit).map(curve=>curve.p);
    // Projection usually moves only a few cuts at a time. Reuse an unchanged
    // path's exact result, keyed by every directed control coordinate and the
    // clearance. Never use this cache for the independent final validator.
    const key=`${family}:${slit}`,coordinates=cache?controls.flat(2):null,previous=cache?.get(key);
    const unchanged=previous?.margin===margin&&previous.coordinates.length===coordinates.length&&previous.coordinates.every((v,i)=>Object.is(v,coordinates[i]));
    const returns=unchanged?previous.returns:heartPathReturns(controls,margin);
    if(cache&&!unchanged)cache.set(key,{margin,coordinates,returns});
    for(const retained of returns){
      // Returned witnesses belong to this invocation, including their nested
      // point/parameter arrays. A caller must not be able to poison the cache.
      const issue=cache?structuredClone(retained):retained;
      issues.push({family,slit,...issue,edgeChain:solution.paths[family][slit].slice(issue.curves[0],issue.curves[1]+1).map(([edge])=>edge)});
    }
  }
  return issues;
}
