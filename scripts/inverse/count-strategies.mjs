/** Experimental policies. They receive only image-derived evidence. */
import {initializeCounts,supportedBorderCounts} from '../../static/inverse/core/direct/counts.js';

const same=(a,b)=>a.every((v,i)=>v===b[i]);
export const strategies=['all','border-consensus','race','shared-work','race-shared'];
export function searchCounts(context,strategy='all'){
  if(!strategies.includes(strategy))throw new Error('Unknown count strategy');
  const sharedWork=strategy.includes('shared'),supported=supportedBorderCounts(context.evidence);
  if(strategy==='all'||strategy==='shared-work')return initializeCounts(context,{sharedWork});
  if(strategy==='border-consensus'){
    const selected=supported?context.options.filter(o=>same(o.counts,supported)):[];
    const result=initializeCounts({...context,options:selected.length?selected:context.options});
    result.report={...result.report,strategy,hypotheses:context.options.length,borderCounts:supported,fallback:!selected.length};return result;
  }
  // Cheap trials use every starting layout; survivors restart from those same
  // layouts so promotion does not silently change the original full fitting.
  const screened=initializeCounts(context,{rounds:3,sharedWork}),chosen=screened.seeds.slice(0,6);
  const selected=context.options.filter(o=>chosen.some(s=>s.phase===o.phase&&same(s.model.counts,o.counts))||supported&&same(o.counts,supported));
  const result=initializeCounts({...context,options:selected},{sharedWork});
  result.report={...result.report,strategy,hypotheses:context.options.length,screeningRounds:3,screened:context.options.length,borderCounts:supported};return result;
}
