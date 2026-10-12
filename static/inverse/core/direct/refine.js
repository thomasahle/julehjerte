/** Constrained free Bézier refinement: image boundary forces, Euclidean
 * separation, curvature and join costs, and independent geometry checkpoints.
 */
import {Adam,bernstein,dbernstein,ddbernstein,clamp} from './math.js';
import {boundaryGradient,createBoundaryEvaluator} from './boundary.js';
import {renderCurves} from './curves.js';
import {mismatch} from './grid.js';
import {validate} from '../validate.js';
import {materialAudit} from '../material.js';
import {matchingGroups,matchingPenalty,projectMatching} from './matching.js';
import {symmetryTies,applyTies,symmetryReport} from './symmetry.js';
import {straightProposal,primitiveComplexity,primitiveCost} from './primitives.js';
import {boundaryObjective} from './image-objective.js';
export function fittingMargin(cfg,width){return cfg.nominalWidth+Math.SQRT2*width/cfg.materialResolution+2*cfg.geometryTolerance+.35;}

const cornerCache=new WeakMap();
function initialCorners(graph){
  if(cornerCache.has(graph))return cornerCache.get(graph);
  const corners=new Set(),p=graph.points;
  graph.joins.forEach(([[a,ad],[b,bd]],i)=>{
    const A=graph.edges[a],B=graph.edges[b],aa=A[ad===1?3:0],ah=A[ad===1?2:1],ba=B[bd===1?0:3],bh=B[bd===1?1:2];
    const ux=p[2*aa]-p[2*ah],uy=p[2*aa+1]-p[2*ah+1],vx=p[2*bh]-p[2*ba],vy=p[2*bh+1]-p[2*ba+1];
    if((ux*vx+uy*vy)/Math.max(1e-10,Math.hypot(ux,uy)*Math.hypot(vx,vy))<Math.SQRT1_2)corners.add(i);
  });cornerCache.set(graph,corners);return corners;
}

export function curvePenalty(graph,points,cfg,{separationWeight=12}={}){
  const gradient=new Float64Array(points.length),sample=graph.sample(points,8),s=sample.samples,ds=new Float64Array(s.length),w=graph.width,margin=fittingMargin(cfg,w),side=margin;
  const total=sample.groups.reduce((v,g)=>v+g.length,0),cells=new Map(),segments=[],arcPositions=[];let loss=0,minRadius=Infinity;
  const stride=Math.ceil(w/margin)+3,key=(x,y,f)=>x>=-1&&y>=-1&&x<stride-1&&y<stride-1?(f*stride+x+1)*stride+y+1:`${x},${y},${f}`;
  sample.groups.forEach((ids,pi)=>{
    const arcs=[0];for(let j=1;j<ids.length;j++){
      const a=ids[j-1],b=ids[j],len=Math.hypot(s[2*a]-s[2*b],s[2*a+1]-s[2*b+1]),id=segments.length;
      segments.push({a,b,pi,arc:arcs[j-1]+len/2,half:len/2});arcs.push(arcs[j-1]+len);
      const f=graph.family[pi],loX=Math.floor((Math.min(s[2*a],s[2*b])-margin)/margin),hiX=Math.floor((Math.max(s[2*a],s[2*b])+margin)/margin),loY=Math.floor((Math.min(s[2*a+1],s[2*b+1])-margin)/margin),hiY=Math.floor((Math.max(s[2*a+1],s[2*b+1])+margin)/margin);
      for(let x=loX;x<=hiX;x++)for(let y=loY;y<=hiY;y++){const k=key(x,y,f);const bucket=cells.get(k);if(bucket)bucket.push(id);else cells.set(k,[id]);}
    }arcPositions.push(arcs);
  });
  const nearest=new Map();
  sample.groups.forEach((ids,pi)=>{
    const f=graph.family[pi];
    for(let j=0;j<ids.length;j++){
      const id=ids[j],px=s[2*id],py=s[2*id+1];nearest.clear();
      for(const e of cells.get(key(Math.floor(px/margin),Math.floor(py/margin),f))||[]){
        const seg=segments[e];if(seg.pi===pi&&Math.abs(arcPositions[pi][j]-seg.arc)-seg.half<=cfg.localNeighborhoodFactor*cfg.nominalWidth)continue;
        const{a,b}=seg,ux=s[2*a],uy=s[2*a+1],vx=s[2*b]-ux,vy=s[2*b+1]-uy,t=clamp(((px-ux)*vx+(py-uy)*vy)/Math.max(1e-12,vx*vx+vy*vy),0,1),dx=px-ux-t*vx,dy=py-uy-t*vy,d=dx*dx+dy*dy;
        if(d<margin*margin&&(!nearest.has(seg.pi)||d<nearest.get(seg.pi).d))nearest.set(seg.pi,{a,b,t,dx,dy,d});
      }
      for(const q of nearest.values()){
        const dist=Math.sqrt(q.d+1e-12),scale=separationWeight/total;loss+=scale*((margin-dist)/margin)**2;
        const g=2*scale*(dist-margin)/(margin*margin*dist);
        ds[2*id]+=g*q.dx;ds[2*q.a]-=(1-q.t)*g*q.dx;ds[2*q.b]-=q.t*g*q.dx;
        ds[2*id+1]+=g*q.dy;ds[2*q.a+1]-=(1-q.t)*g*q.dy;ds[2*q.b+1]-=q.t*g*q.dy;
      }
      const coordinate=s[2*id+f],delta=coordinate<side?coordinate-side:coordinate>w-side?coordinate-(w-side):0;
      loss+=.2*delta*delta/ids.length;ds[2*id+f]+=.4*delta/ids.length;
    }
  });
  graph.edges.forEach((ids,e)=>{for(let j=0;j<=sample.ns;j++)for(let k=0;k<4;k++)for(let axis=0;axis<2;axis++)gradient[2*ids[k]+axis]+=sample.bases[j][k]*ds[2*(e*(sample.ns+1)+j)+axis];});
  const n=25,normalizer=Math.max(1,graph.edges.length*n);
  for(let j=0;j<n;j++){
    const D=dbernstein(j/(n-1)),DD=ddbernstein(j/(n-1));
    for(const ids of graph.edges){
      let vx=0,vy=0,ax=0,ay=0;for(let k=0;k<4;k++){vx+=D[k]*points[2*ids[k]];vy+=D[k]*points[2*ids[k]+1];ax+=DD[k]*points[2*ids[k]];ay+=DD[k]*points[2*ids[k]+1];}
      const speed=Math.max(1e-4,Math.hypot(vx,vy)),cross=vx*ay-vy*ax,curv=Math.abs(cross)/speed**3,sign=Math.sign(cross),tight=Math.max(0,curv-1.25);
      if(curv>1e-10)minRadius=Math.min(minRadius,1/curv);
      const energy=.00008*curv*curv+.015*tight*tight,dCurv=(.00016*curv+.03*tight)*speed/normalizer,dSpeed=energy/normalizer;
      loss+=energy*speed/normalizer;
      const gvx=dCurv*(sign*ay/speed**3-3*curv*vx/speed**2)+dSpeed*vx/speed,gvy=dCurv*(-sign*ax/speed**3-3*curv*vy/speed**2)+dSpeed*vy/speed;
      const gax=-dCurv*sign*vy/speed**3,gay=dCurv*sign*vx/speed**3;
      for(let k=0;k<4;k++){gradient[2*ids[k]]+=D[k]*gvx+DD[k]*gax;gradient[2*ids[k]+1]+=D[k]*gvy+DD[k]*gay;}
    }
  }
  const joins=Math.max(1,graph.joins.length),corners=initialCorners(graph);
  for(const [join,[[a,ad],[b,bd]]]of graph.joins.entries()){
    const A=graph.edges[a],B=graph.edges[b],anchorA=A[ad===1?3:0],handleA=A[ad===1?2:1],anchorB=B[bd===1?0:3],handleB=B[bd===1?1:2];
    const ux=points[2*anchorA]-points[2*handleA],uy=points[2*anchorA+1]-points[2*handleA+1],vx=points[2*handleB]-points[2*anchorB],vy=points[2*handleB+1]-points[2*anchorB+1],u=Math.max(1e-5,Math.hypot(ux,uy)),v=Math.max(1e-5,Math.hypot(vx,vy)),dot=clamp((ux*vx+uy*vy)/(u*v),-1,1);
    // Smooth small accidental kinks, but do not continuously round an intended
    // corner. Maximum-turn and paper constraints still validate sharp joins.
    const corner=corners.has(join)&&dot<Math.SQRT1_2,dd=corner?0:(-.015+.06*Math.min(dot,0))/joins;
    loss+=(corner?.015*(1-Math.SQRT1_2):.015*(1-dot)+.03*Math.min(dot,0)**2)/joins;
    const gux=dd*(vx/(u*v)-dot*ux/(u*u)),gvx=dd*(ux/(u*v)-dot*vx/(v*v));
    gradient[2*anchorA]+=gux;gradient[2*handleA]-=gux;gradient[2*handleB]+=gvx;gradient[2*anchorB]-=gvx;
    const guy=dd*(vy/(u*v)-dot*uy/(u*u)),gvy=dd*(uy/(u*v)-dot*vy/(v*v));
    gradient[2*anchorA+1]+=guy;gradient[2*handleA+1]-=guy;gradient[2*handleB+1]+=gvy;gradient[2*anchorB+1]-=gvy;
  }
  for(const ids of graph.edges)for(const[a,b]of[[ids[0],ids[1]],[ids[2],ids[3]]]){
    const dx=points[2*a]-points[2*b],dy=points[2*a+1]-points[2*b+1],length=Math.max(1e-8,Math.hypot(dx,dy));if(length>=.25)continue;
    const scale=.2/(2*Math.max(1,graph.edges.length)),g=2*scale*(length-.25)/length;loss+=scale*(length-.25)**2;
    gradient[2*a]+=g*dx;gradient[2*b]-=g*dx;gradient[2*a+1]+=g*dy;gradient[2*b+1]-=g*dy;
  }
  return{loss,gradient,minRadius};
}

export function refineCurves(graph,prob,n,phase,cfg,{steps=750,deadline=Infinity,onProgress=()=>{},input={},rate=.035,identicalSheets=false,stopWhen=null,selection='boundary',weights=null,preferCheckpoint=null}={}){
  // Compile the weighted force field once, not on every optimization step.
  const objective=boundaryObjective(prob,weights),force=objective.target;
  const imageValue=createBoundaryEvaluator(graph,force,n),transposedImageValue=createBoundaryEvaluator(graph,force,n,{transpose:true,rows:193});
  const points=graph.points.slice(),initial=points.slice(),adam=new Adam(points.length,rate*graph.width/100),history=[];
  // Requested symmetries are constraints, not preferences: both the points and
  // the search direction are projected onto their subspace at every step. A
  // request replaces the identical-sheet projection rather than alternating
  // with it, which would leave only the last of the two exact: `transpose` is
  // the request that means identical sheets and ties the same parameters, and
  // any other request was chosen over that preference in settings().
  const ties=symmetryTies(graph,cfg.symmetry),groups=identicalSheets&&!ties?matchingGroups(graph):null;let stoppedEarly=false;
  const clampAxes=new Uint8Array(points.length);
  graph.paths.forEach((p,pi)=>{for(const[e]of p)for(const id of graph.edges[e])clampAxes[2*id+graph.family[pi]]=1;});
  const clampPoints=()=>{for(let i=0;i<points.length;i++)points[i]=graph.fixed[i]?initial[i]:clamp(points[i],clampAxes[i]?fittingMargin(cfg,graph.width):0,clampAxes[i]?graph.width-fittingMargin(cfg,graph.width):graph.width);const projected=!ties||applyTies(ties,points,points,{fixed:graph.fixed,original:initial});if(groups)projectMatching(points,groups,graph.fixed,initial);return projected;};
  clampPoints();let safe=null,best=null,bestUncertain=null,bestInvalid=null,completed=0;
  // A preferred image checkpoint competes only within the same physical
  // validity class. Preference never certifies paper, changes rollback safety,
  // or substitutes weighted errors for the caller's original-source checks.
  const better=(value,previous)=>!previous||value.preferred&&!previous.preferred||value.preferred===previous.preferred&&(selection==='mask'?value.error<previous.error||value.error===previous.error&&value.score<previous.score:value.score<previous.score);
  const checkpoint=step=>{
    const straight=straightProposal(graph,points,n);
    const straightPassed=!straight||!ties||applyTies(ties,straight,straight,{fixed:graph.fixed,original:initial});
    if(straight&&groups)projectMatching(straight,groups,graph.fixed,initial);
    const proposals=[points,...(straight&&straightPassed?[straight]:[])].map(p=>{
      const error=mismatch(renderCurves(graph,p,phase,n,32),prob,weights),imageScore=(imageValue(p,phase)+transposedImageValue(p,phase))/2+objective.offset;
      const score=imageScore+primitiveCost(graph,p,n)+(cfg.preferMatchingSheets?matchingPenalty(graph,p).loss:0);
      return{graph,points:p.slice(),phase,error,score,primitives:primitiveComplexity(graph,p),straightened:p===straight};
    });
    // A degree reduction must earn its simpler geometry without increasing
    // the mask error at this checkpoint. Preserve the continuous trajectory.
    const original=proposals[0];
    if(proposals[1]?.error>original.error)proposals.pop();
    proposals.sort((a,b)=>selection==='mask'?a.error-b.error||a.score-b.score:a.score-b.score);
    let accepted=false;
    for(const value of proposals){
      const solution=graph.solution(value.points,phase,input),check=validate(solution,cfg,{checkImage:false});
      if(ties?.withinCurve){
        const symmetry=symmetryReport(solution,cfg.symmetry);
        if(symmetry.honoured.length!==symmetry.requested.length){check.passed=false;check.issues.push('Requested cutting symmetries are not satisfied.');}
      }
      const paper=check.passed?materialAudit(solution,cfg):null;
      value.validation=check;value.paper=paper?.summary;value.preferred=!preferCheckpoint||preferCheckpoint(value,solution);
      const rec={step,error:value.error,score:value.score,primitives:value.primitives,straightened:value.straightened,geometry:check.passed,paper:paper?.status,...(preferCheckpoint?{preferred:value.preferred}:{}),issues:check.issues.slice(0,8)};history.push(rec);onProgress(rec,solution);
      if(!bestInvalid||value.error<bestInvalid.error)bestInvalid=value;
      // More optimization must not replace a geometry-valid uncertain paper
      // checkpoint with an illegal curve merely because its image error is
      // lower. Retain it for the caller's independent finer paper audit. It
      // remains unaccepted here and never becomes a safe rollback position.
      if(check.passed&&paper?.status==='uncertain'&&better(value,bestUncertain))bestUncertain=value;
      if(check.passed&&(!cfg.requireMaterialCore||paper?.passed)){
        safe=value.points.slice();accepted=true;
        if(better(value,best))best=value;
        if(stopWhen&&step>=80&&stopWhen(best))stoppedEarly=true;
        // A straight proposal can erase a feature while the unsimplified
        // proposal at this same step retains it. Inspect that alternative too.
        if(preferCheckpoint&&!value.preferred)continue;
        break;
      }
    }
    if(!accepted&&safe){points.set(safe);adam.reset();adam.rate=Math.max(.004*graph.width/100,adam.rate*.65);}
  };
  checkpoint(-1);
  for(let step=0;step<steps;step++){
    if(stoppedEarly||(step%5===0&&performance.now()>deadline))break;
    const g=boundaryGradient(graph,points,force,n,phase),penalty=curvePenalty(graph,points,cfg);
    if(cfg.preferMatchingSheets&&!identicalSheets){const matching=matchingPenalty(graph,points);for(let i=0;i<g.length;i++)g[i]+=matching.gradient[i];}
    for(let i=0;i<g.length;i++)g[i]=graph.fixed[i]?0:g[i]+penalty.gradient[i]+.000004*(points[i]-initial[i])/points.length;
    if(ties&&!applyTies(ties,g,points,{fixed:graph.fixed,tangent:true}))break;
    if(groups)projectMatching(g,groups,graph.fixed,new Float64Array(g.length));
    const previous=ties?.withinCurve?points.slice():null;
    adam.update(points,g,1);
    if(!clampPoints()&&previous){
      // Adam's coordinate-wise scaling can conflict with shared controls.
      // Retry its displacement in the true tangent space before rolling back.
      const displacement=Float64Array.from(points,(v,i)=>v-previous[i]);
      let recovered=applyTies(ties,displacement,previous,{fixed:graph.fixed,tangent:true});
      if(recovered){for(let i=0;i<points.length;i++)points[i]=previous[i]+displacement[i];recovered=clampPoints();}
      if(!recovered){points.set(previous);adam.reset();adam.rate=Math.max(.004*graph.width/100,adam.rate*.5);}
    }
    completed++;
    if(step%40===0||step===steps-1)checkpoint(step);
  }
  if(completed&&history.at(-1).step!==completed-1)checkpoint(completed-1);
  const selected=best||bestUncertain||bestInvalid;
  // A coarse-lattice pass can be a much poorer image fit than an uncertain
  // checkpoint. Keep that alternative available for a finer independent
  // audit by the caller, without treating it as accepted or using it for
  // rollback here. Ordinary callers still receive the verified incumbent.
  const paperAlternative=bestUncertain&&bestUncertain!==selected?{...bestUncertain,geometryPassed:true,paperPassed:false}:null;
  return{...selected,geometryPassed:selected.validation.passed,paperPassed:!!best,history,steps:completed,stoppedEarly,paperAlternative};
}
