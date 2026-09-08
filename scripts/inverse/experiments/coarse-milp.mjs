/** Experimental small trace graph followed by free Bézier refinement. Not a production search policy. */
import{preprocessMask}from'../../../static/inverse/core/input.js';
import{buildGraph,curvesOf}from'../../../static/inverse/core/graph.js';
import{solveGraph}from'../../../static/inverse/core/solver.js';
import{CurveGraph}from'../../../static/inverse/core/direct/curves.js';
import{refineCurves}from'../../../static/inverse/core/direct/refine.js';
import{resize}from'../../../static/inverse/core/direct/math.js';
import{materialAudit}from'../../../static/inverse/core/material.js';
import{sampleWeave}from'../../../static/inverse/core/validate.js';
export async function fitDirect(input,cfg){
 const start=performance.now(),source=input.sourceImage,n=Math.min(256,source.resolution),prob=resize(source.probability,source.resolution,n);
 const target=preprocessMask(source.mask,source.resolution,{...cfg,algorithm:'trace',fitTolerance:1.2,smoothRadius:.3,snapRadius:1.5,maxSpan:40,borderRadius:3},input.metadata.preprocessing);
 target.sourceImage=source;target.metadata.sourceImage=input.metadata.sourceImage;
 const small={...cfg,neighbors:8,connectorVariants:1,relativeGap:1},graph=buildGraph(target,small),built=performance.now();
 const initial=await solveGraph(graph,{...small,timeLimit:Math.max(.1,6-(built-start)/1000)},{coefficientQuantum:1e-7,coreGate:s=>materialAudit(s,cfg)}),solved=performance.now();
 const error=s=>sampleWeave(s,source.resolution).reduce((sum,v,i)=>sum+Number(v!==source.mask[i]),0)/source.mask.length;
 const before=error(initial),paths=initial.paths.map((family,f)=>family.map((_,i)=>curvesOf(initial,f,i).map(c=>c.p))),free=new CurveGraph(paths,cfg.width),phase=initial.graph.target.phase?-1:1;
 const candidate=refineCurves(free,prob,n,phase,{...cfg,preferMatchingSheets:false},{input,deadline:start+9000,steps:400,rate:.02});
 const result=candidate.graph.solution(candidate.points,candidate.phase,input),after=error(result),selected=candidate.geometryPassed&&candidate.paperPassed&&after<before?result:initial;
 selected.report={algorithm:'coarse-milp-bezier-experiment',seconds:(performance.now()-start)/1000,graphSeconds:(built-start)/1000,milpSeconds:(solved-built)/1000,refineSeconds:(performance.now()-solved)/1000,before,after,selected: selected===initial?'milp':'refined',milp:initial.report,checkpoints:candidate.history};
 return selected;
}
