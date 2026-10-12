/** Preserve the small graph first; enlarge it only after proven exhaustion. */
import {buildGraph} from './graph.js';
import {solveGraph,visibleMarginIssue} from './solver.js';

export async function solveBoundary(target,cfg,{initialGraph=null,node=true,expandNeighbors=true,unconnectedNeighbors=false,announceGraph=true,...options}={}){
  const started=performance.now(),remaining=()=>cfg.timeLimit-(performance.now()-started)/1000;
  // buildGraph normalizes target.curves. Every proposal must start from the
  // same boundary, including its original noding and guide-portal policy.
  const seed={...target,curves:target.curves.slice()},fresh=()=>({...seed,curves:seed.curves.slice()});
  if(announceGraph)options.onProgress?.({stage:'graph'});
  const graph=initialGraph||buildGraph(fresh(),cfg,{node,onProgress:options.onProgress,unconnectedNeighbors});
  try{
    return await solveGraph(graph,{...cfg,timeLimit:Math.max(.001,remaining())},options);
  }catch(first){
    if(first.report?.termination!=='candidate_graph_exhausted')throw first;
    const issue=visibleMarginIssue(graph,cfg);
    if(issue){first.report.connectorIndependentIssue=issue;throw first;}
    if(!expandNeighbors||unconnectedNeighbors||remaining()<.1)throw first;
    let expanded;
    try{expanded=buildGraph(fresh(),cfg,{node,onProgress:options.onProgress,unconnectedNeighbors:true});}
    catch(error){first.report.neighborExpansionError=error.message;throw first;}
    if(expanded.metadata.hiddenCandidates<=graph.metadata.hiddenCandidates||remaining()<.1)throw first;
    const retry={method:'unconnected-neighbor-budget',initial:first.report,addedCandidates:expanded.metadata.hiddenCandidates-graph.metadata.hiddenCandidates};
    try{
      const solution=await solveGraph(expanded,{...cfg,timeLimit:remaining()},options);
      solution.report.neighborRetry=retry;
      solution.report.routingSeconds=(performance.now()-started)/1000;
      return solution;
    }catch(error){
      if(error.report){error.report.neighborRetry=retry;error.report.routingSeconds=(performance.now()-started)/1000;}
      throw error;
    }
  }
}
