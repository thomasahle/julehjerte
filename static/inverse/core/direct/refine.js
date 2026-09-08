/** Constrained free Bézier refinement: image boundary forces, Euclidean
 * separation, curvature and join costs, and independent geometry checkpoints.
 */
import {Adam,bernstein,dbernstein,ddbernstein,clamp} from './math.js';
import {boundaryGradient,boundaryValue} from './boundary.js';
import {renderCurves} from './curves.js';
import {mismatch} from './grid.js';
import {validate} from '../validate.js';
import {materialAudit} from '../material.js';
import {matchingGroups,matchingPenalty,projectMatching} from './matching.js';
export function fittingMargin(cfg,width){return cfg.nominalWidth+Math.SQRT2*width/cfg.materialResolution+2*cfg.geometryTolerance+.35;}

export function curvePenalty(graph,points,cfg,{separationWeight=12}={}){
  const gradient=new Float64Array(points.length),sample=graph.sample(points,8),s=sample.samples,ds=new Float64Array(s.length),w=graph.width,margin=fittingMargin(cfg,w),side=margin;
  const total=sample.groups.reduce((v,g)=>v+g.length,0),cells=new Map(),segments=[],arcPositions=[];let loss=0,minRadius=Infinity;
  const key=(x,y,f)=>`${x},${y},${f}`;
  sample.groups.forEach((ids,pi)=>{
    const arcs=[0];for(let j=1;j<ids.length;j++){
      const a=ids[j-1],b=ids[j],len=Math.hypot(s[2*a]-s[2*b],s[2*a+1]-s[2*b+1]),id=segments.length;
      segments.push({a,b,pi,arc:arcs[j-1]+len/2,half:len/2});arcs.push(arcs[j-1]+len);
      const f=graph.family[pi],loX=Math.floor((Math.min(s[2*a],s[2*b])-margin)/margin),hiX=Math.floor((Math.max(s[2*a],s[2*b])+margin)/margin),loY=Math.floor((Math.min(s[2*a+1],s[2*b+1])-margin)/margin),hiY=Math.floor((Math.max(s[2*a+1],s[2*b+1])+margin)/margin);
      for(let x=loX;x<=hiX;x++)for(let y=loY;y<=hiY;y++){const k=key(x,y,f);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(id);}
    }arcPositions.push(arcs);
  });
  sample.groups.forEach((ids,pi)=>{
    const f=graph.family[pi];
    for(let j=0;j<ids.length;j++){
      const id=ids[j],px=s[2*id],py=s[2*id+1],nearest=new Map();
      for(const e of cells.get(key(Math.floor(px/margin),Math.floor(py/margin),f))||[]){
        const seg=segments[e];if(seg.pi===pi&&Math.abs(arcPositions[pi][j]-seg.arc)-seg.half<=cfg.localNeighborhoodFactor*cfg.nominalWidth)continue;
        const{a,b}=seg,ux=s[2*a],uy=s[2*a+1],vx=s[2*b]-ux,vy=s[2*b+1]-uy,t=clamp(((px-ux)*vx+(py-uy)*vy)/Math.max(1e-12,vx*vx+vy*vy),0,1),dx=px-ux-t*vx,dy=py-uy-t*vy,d=dx*dx+dy*dy;
        if(d<margin*margin&&(!nearest.has(seg.pi)||d<nearest.get(seg.pi).d))nearest.set(seg.pi,{a,b,t,dx,dy,d});
      }
      for(const q of nearest.values()){
        const dist=Math.sqrt(q.d+1e-12),scale=separationWeight/total;loss+=scale*((margin-dist)/margin)**2;
        const g=2*scale*(dist-margin)/(margin*margin*dist);
        for(const[axis,delta]of[[0,q.dx],[1,q.dy]]){ds[2*id+axis]+=g*delta;ds[2*q.a+axis]-=(1-q.t)*g*delta;ds[2*q.b+axis]-=q.t*g*delta;}
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
      const gv=[dCurv*(sign*ay/speed**3-3*curv*vx/speed**2)+dSpeed*vx/speed,dCurv*(-sign*ax/speed**3-3*curv*vy/speed**2)+dSpeed*vy/speed];
      const ga=[-dCurv*sign*vy/speed**3,dCurv*sign*vx/speed**3];
      for(let k=0;k<4;k++)for(let axis=0;axis<2;axis++)gradient[2*ids[k]+axis]+=D[k]*gv[axis]+DD[k]*ga[axis];
    }
  }
  const joins=Math.max(1,graph.joins.length);
  for(const [[a,ad],[b,bd]]of graph.joins){
    const A=graph.edges[a],B=graph.edges[b],anchorA=A[ad===1?3:0],handleA=A[ad===1?2:1],anchorB=B[bd===1?0:3],handleB=B[bd===1?1:2];
    const ux=points[2*anchorA]-points[2*handleA],uy=points[2*anchorA+1]-points[2*handleA+1],vx=points[2*handleB]-points[2*anchorB],vy=points[2*handleB+1]-points[2*anchorB+1],u=Math.max(1e-5,Math.hypot(ux,uy)),v=Math.max(1e-5,Math.hypot(vx,vy)),dot=clamp((ux*vx+uy*vy)/(u*v),-1,1),dd=(-.015+.06*Math.min(dot,0))/joins;
    loss+=(.015*(1-dot)+.03*Math.min(dot,0)**2)/joins;
    for(const[axis,uu,vv]of[[0,ux,vx],[1,uy,vy]]){
      const gu=dd*(vv/(u*v)-dot*uu/(u*u)),gv=dd*(uu/(u*v)-dot*vv/(v*v));gradient[2*anchorA+axis]+=gu;gradient[2*handleA+axis]-=gu;gradient[2*handleB+axis]+=gv;gradient[2*anchorB+axis]-=gv;
    }
  }
  for(const ids of graph.edges)for(const[a,b]of[[ids[0],ids[1]],[ids[2],ids[3]]]){
    const dx=points[2*a]-points[2*b],dy=points[2*a+1]-points[2*b+1],length=Math.max(1e-8,Math.hypot(dx,dy));if(length>=.25)continue;
    const scale=.2/(2*Math.max(1,graph.edges.length)),g=2*scale*(length-.25)/length;loss+=scale*(length-.25)**2;
    gradient[2*a]+=g*dx;gradient[2*b]-=g*dx;gradient[2*a+1]+=g*dy;gradient[2*b+1]-=g*dy;
  }
  return{loss,gradient,minRadius};
}

export function refineCurves(graph,prob,n,phase,cfg,{steps=750,deadline=Infinity,onProgress=()=>{},input={},rate=.035,identicalSheets=false,stopWhen=null}={}){
  const points=graph.points.slice(),initial=points.slice(),adam=new Adam(points.length,rate*graph.width/100),history=[];
  const groups=identicalSheets?matchingGroups(graph):null;let stoppedEarly=false;
  const clampAxes=new Uint8Array(points.length);
  graph.paths.forEach((p,pi)=>{for(const[e]of p)for(const id of graph.edges[e])clampAxes[2*id+graph.family[pi]]=1;});
  const clampPoints=()=>{for(let i=0;i<points.length;i++)points[i]=graph.fixed[i]?initial[i]:clamp(points[i],clampAxes[i]?fittingMargin(cfg,graph.width):0,clampAxes[i]?graph.width-fittingMargin(cfg,graph.width):graph.width);if(groups)projectMatching(points,groups,graph.fixed,initial);};
  clampPoints();let safe=null,best=null,bestInvalid=null,completed=0;
  const checkpoint=step=>{
    const solution=graph.solution(points,phase,input),check=validate(solution,cfg,{checkImage:false}),error=mismatch(renderCurves(graph,points,phase,n,32),prob);
    const score=(boundaryValue(graph,points,prob,n,phase)+boundaryValue(graph,points,prob,n,phase,{transpose:true,rows:193}))/2+(cfg.preferMatchingSheets?matchingPenalty(graph,points).loss:0);
    const paper=check.passed?materialAudit(solution,cfg):null;
    const rec={step,error,score,geometry:check.passed,paper:paper?.status,issues:check.issues.slice(0,8)};history.push(rec);onProgress(rec);
    const value={graph,points:points.slice(),phase,error,score,validation:check,paper:paper?.summary};
    if(!bestInvalid||error<bestInvalid.error)bestInvalid=value;
    if(check.passed&&(!cfg.requireMaterialCore||paper?.passed)){safe=points.slice();if(!best||score<best.score)best=value;if(stopWhen&&step>=80&&stopWhen(best))stoppedEarly=true;}
    else if(safe){points.set(safe);adam.reset();adam.rate=Math.max(.004*graph.width/100,adam.rate*.65);}
  };
  checkpoint(-1);
  for(let step=0;step<steps;step++){
    if(stoppedEarly||(step%5===0&&performance.now()>deadline))break;
    const g=boundaryGradient(graph,points,prob,n,phase),penalty=curvePenalty(graph,points,cfg);
    if(cfg.preferMatchingSheets&&!identicalSheets){const matching=matchingPenalty(graph,points);for(let i=0;i<g.length;i++)g[i]+=matching.gradient[i];}
    for(let i=0;i<g.length;i++)g[i]=graph.fixed[i]?0:g[i]+penalty.gradient[i]+.000004*(points[i]-initial[i])/points.length;
    if(groups)projectMatching(g,groups,graph.fixed,new Float64Array(g.length));
    adam.update(points,g,1);clampPoints();completed++;
    if(step%40===0||step===steps-1)checkpoint(step);
  }
  if(completed&&history.at(-1).step!==completed-1)checkpoint(completed-1);
  return{...(best||bestInvalid),geometryPassed:(best||bestInvalid).validation.passed,paperPassed:!!best,history,steps:completed,stoppedEarly};
}
