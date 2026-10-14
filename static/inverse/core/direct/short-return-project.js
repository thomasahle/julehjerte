/** Bounded local constraint projection; never changes final validity rules. */
import {bernstein} from './math.js';
import {validate} from '../validate.js';
import {completeSelfReturns} from '../complete-self-returns.js';
import {symmetryTies,applyTies,symmetryReport} from './symmetry.js';
import {matchingSummary} from './matching.js';

export function projectShortReturns(graph,original,phase,input,cfg,{deadline=Infinity,hiddenOnly=false,initialAudit=null,maxIterations=8,maxMilliseconds=180}={}){
  if(!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>128||!Number.isFinite(maxMilliseconds)||maxMilliseconds<=0)throw new RangeError('Projection needs bounded positive iteration and time allowances.');
  const points=original.slice(),report={fullGeometryAudits:0,returnConstraintAudits:0,attempted:false,iterations:0,displacements:0,initialReturns:0,finalReturns:null,accepted:false,termination:'iteration_limit',policy:hiddenOnly?'hidden-controls-only':'all-free-controls',maxIterations,maxMilliseconds};
  const visibleControls=new Set(graph.edges.flatMap((ids,e)=>graph.visible[e]?ids:[]));
  const limit=Math.min(deadline,performance.now()+maxMilliseconds),cushion=2*cfg.geometryTolerance;
  // A locally valid repair must retain the template relation selected by the
  // fitter. Existing identical sheets are a hard constraint for this final
  // local operation, even when no explicit symmetry was requested.
  const initial=graph.solution(original,phase,input),matching=matchingSummary(initial);
  const spec=matching.identical?{...cfg.symmetry,transpose:true}:cfg.symmetry,ties=symmetryTies(graph,spec);
  const symmetry=symmetryReport(initial,spec);
  report.preservedSymmetry=symmetry.requested;
  if(symmetry.honoured.length!==symmetry.requested.length||ties?.skipped.length||ties?.conflicts.length){report.termination=report.rejected='initial_symmetry';return{points:null,report};}
  const fixed=Uint8Array.from(graph.fixed,(v,i)=>Number(v||hiddenOnly&&visibleControls.has(Math.floor(i/2))));
  for(let iteration=0;iteration<maxIterations;iteration++){
    if(performance.now()>limit){report.termination='time_limit';break;}
    const candidate=graph.solution(points,phase,input);
    let audit=null;
    if(iteration===0){
      if(initialAudit)audit=initialAudit;
      else{report.fullGeometryAudits++;audit=validate(candidate,cfg,{checkImage:false,finalGeometry:true});}
    }
    // Intermediate points are proposals only. Check the constraints being
    // projected here; a complete independent audit still gates every result.
    let issues;
    if(audit)issues=audit.issues.filter(i=>i.type==='short_self_clearance');
    else{report.returnConstraintAudits++;issues=completeSelfReturns(candidate).map(i=>({type:'short_self_clearance',...i}));}
    if(!iteration)report.initialReturns=issues.length;
    report.finalReturns=issues.length;
    if(audit&&audit.issues.length!==issues.length){report.termination='other_geometry';break;}
    if(!issues.length){
      if(!audit){report.fullGeometryAudits++;audit=validate(candidate,cfg,{checkImage:false,finalGeometry:true});}
      if(!audit.passed){report.termination=report.rejected='final_geometry';break;}
      const finalSolution=candidate,finalSymmetry=symmetryReport(finalSolution,spec);
      if(matching.identical&&!matchingSummary(finalSolution).identical){report.termination=report.rejected='final_matching';break;}
      if(finalSymmetry.honoured.length!==finalSymmetry.requested.length){report.termination=report.rejected='final_symmetry';break;}
      report.termination='validated';report.accepted=report.attempted;return{points:report.accepted?points:null,report,validation:audit};
    }
    report.attempted=true;report.iterations++;const beforeDisplacements=report.displacements;
    for(const issue of issues){
      // Bernstein weights refer to the cut's direction, which can be opposite
      // to the single stored shared cubic. Sum shared-control coefficients.
      const coefficients=new Map(),path=graph.paths[graph.families[issue.family][issue.slit]];
      issue.curves.forEach((order,side)=>{
        const [edge,direction]=path[order],t=direction===1?issue.parameters[side]:1-issue.parameters[side],basis=bernstein(t),sign=side===0?1:-1;
        graph.edges[edge].forEach((id,k)=>coefficients.set(id,(coefficients.get(id)||0)+sign*basis[k]));
      });
      const delta=[0,0];for(const [id,c]of coefficients)for(let axis=0;axis<2;axis++)delta[axis]+=c*points[2*id+axis];
      const distance=Math.hypot(...delta),deficit=issue.required+cushion-distance;
      if(deficit<=0||distance<1e-8)continue;
      const gradient=[];let square=0;
      for(const [id,c]of coefficients)for(let axis=0;axis<2;axis++){
        const coordinate=2*id+axis;if(fixed[coordinate])continue;
        const value=c*delta[axis]/distance;gradient.push([coordinate,value]);square+=value*value;
      }
      if(ties){
        // Move all affine/chord partners together, including shared controls.
        // Post-hoc averaging alone would undo the requested gap increase.
        const constrained=new Float64Array(points.length);
        for(const [coordinate,value]of gradient)constrained[coordinate]=value;
        if(!applyTies(ties,constrained,points,{fixed,tangent:true})){report.termination=report.rejected='symmetry_projection';return{points:null,report};}
        gradient.length=0;square=0;
        for(let i=0;i<constrained.length;i++)if(constrained[i]){gradient.push([i,constrained[i]]);square+=constrained[i]**2;}
      }
      if(square<1e-12)continue;
      const largest=Math.max(...gradient.map(([,value])=>Math.abs(value)));
      const step=Math.min(deficit/square,issue.required/(3*Math.max(1e-12,largest)));
      for(const [coordinate,value]of gradient)points[coordinate]+=step*value;
      if(ties&&!applyTies(ties,points,points,{fixed,original})){report.termination=report.rejected='symmetry_projection';return{points:null,report};}
      // Affine reflection can turn a pinned +0 into -0; keep caller values exact.
      if(ties)for(let i=0;i<points.length;i++)if(fixed[i])points[i]=original[i];
      report.displacements++;
    }
    if(report.displacements===beforeDisplacements){report.termination='no_movable_gradient';break;}
    // Fully hidden controls can use one nominal strip width: changing shared
    // geometry preserves the weave, and the complete geometry/paper gates still
    // apply. Visible controls retain the smaller local displacement allowance.
    const displacementLimit=hiddenOnly?cfg.nominalWidth:Math.min(cfg.nominalWidth,.015*graph.width);
    if(points.some((v,i)=>!Number.isFinite(v)||fixed[i]&&v!==original[i]||Math.abs(v-original[i])>displacementLimit)){report.termination='displacement_limit';break;}
  }
  return{points:null,report};
}
