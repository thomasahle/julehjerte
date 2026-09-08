/** Recover exact shared cuts from near-coincident fitted geometry. Photographs
 * accept or reject a proposal; their contours never create the proposal.
 */
import {Cubic,distance,unit,dot} from '../bezier.js';
import {CurveGraph,renderCurves} from './curves.js';
import {mismatch} from './grid.js';
import {resize} from './math.js';
import {validate,easeMetrics} from '../validate.js';
import {materialAudit} from '../material.js';

function at(path,g,derivative=false){const i=Math.max(0,Math.min(path.length-1,Math.floor(g))),t=Math.max(0,Math.min(1,g-i)),c=new Cubic(path[i]);return derivative?c.derivative(t):c.point(t);}
function samples(path,step=.2){
  const curves=path.map(c=>new Cubic(c)),raw=[],params=[],arc=[];
  curves.forEach((c,i)=>{const s=c.flatten(.003,.3,true);s.points.slice(0,-1).forEach((p,j)=>{params.push(i+s.ts[j]);raw.push(p);});});raw.push(path.at(-1)[3]);params.push(path.length);
  raw.forEach((p,i)=>arc.push(i?arc[i-1]+distance(p,raw[i-1]):0));
  const n=Math.max(2,Math.floor(arc.at(-1)/step)+1),out=[];let index=0;
  for(let i=0;i<n;i++){
    const s=i*arc.at(-1)/(n-1);while(index+1<arc.length-1&&arc[index+1]<s)index++;
    const t=(s-arc[index])/Math.max(1e-12,arc[index+1]-arc[index]),g=params[index]*(1-t)+params[index+1]*t,k=Math.min(curves.length-1,Math.floor(g)),u=g-k;
    out.push({p:curves[k].point(u),tan:unit(curves[k].derivative(u)),g,s});
  }return out;
}
export function sharingCandidates(paths){
  const all=paths.map(f=>f.map(p=>samples(p))),out=[],cell=.6;
  all[1].forEach((B,j)=>{
    const bins=new Map();B.forEach((q,i)=>{const key=`${Math.floor(q.p[0]/cell)},${Math.floor(q.p[1]/cell)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);});
    all[0].forEach((A,i)=>{
      const matches=A.map(q=>{
        const x=Math.floor(q.p[0]/cell),y=Math.floor(q.p[1]/cell);let best=null,dist=cell;
        for(let xx=x-1;xx<=x+1;xx++)for(let yy=y-1;yy<=y+1;yy++)for(const k of bins.get(`${xx},${yy}`)||[]){const d=distance(q.p,B[k].p);if(d<dist){dist=d;best=B[k];}}
        return best&&Math.abs(dot(q.tan,best.tan))>.96?best:null;
      });
      for(let lo=0;lo<A.length;){if(!matches[lo]){lo++;continue;}let hi=lo+1;while(hi<A.length&&matches[hi])hi++;hi--;
        const length=A[hi].s-A[lo].s,a0=A[lo].g,a1=A[hi].g,b0=matches[lo].g,b1=matches[hi].g;
        if(length>=3&&Math.abs(b1-b0)>.05&&Math.min(a0,paths[0][i].length-a1,b0,b1,paths[1][j].length-b0,paths[1][j].length-b1)>.005)out.push({i,j,a0,a1,b0,b1,length});
        lo=hi+1;
      }
    });
  });return out.sort((a,b)=>b.length-a.length);
}
function subs(path,a,b){return path.flatMap((c,i)=>{const lo=Math.max(0,a-i),hi=Math.min(1,b-i);return hi-lo>1e-8?[new Cubic(c).subcurve(lo,hi).p]:[];});}
export function shareReplacement(pathA,pathB,c){
  let{a0,a1,b0,b1}=c;
  const outward=(path,lo,hi)=>{if(distance(at(path,lo),at(path,Math.floor(lo)))<.65)lo=Math.floor(lo);if(distance(at(path,hi),at(path,Math.ceil(hi)))<.65)hi=Math.ceil(hi);return[lo,hi];};
  [a0,a1]=outward(pathA,a0,a1);if(b1>b0)[b0,b1]=outward(pathB,b0,b1);else[b1,b0]=outward(pathB,b1,b0);
  const fractions=[0,1];for(let g=Math.ceil(a0);g<=Math.floor(a1);g++)fractions.push((g-a0)/(a1-a0));for(let g=Math.ceil(Math.min(b0,b1));g<=Math.floor(Math.max(b0,b1));g++)fractions.push((g-b0)/(b1-b0));
  const count=Math.max(2,Math.floor(c.length/3)+1);for(let i=0;i<count;i++)fractions.push(i/(count-1));
  const fs=[...new Set(fractions.map(v=>Math.round(Math.max(0,Math.min(1,v))*1e10)/1e10))].sort((a,b)=>a-b),shared=[];
  for(let i=1;i<fs.length;i++){
    const aa0=a0+(a1-a0)*fs[i-1],aa1=a0+(a1-a0)*fs[i],bb0=b0+(b1-b0)*fs[i-1],bb1=b0+(b1-b0)*fs[i];
    const p0=at(pathA,aa0).map((v,k)=>(v+at(pathB,bb0)[k])/2),p3=at(pathA,aa1).map((v,k)=>(v+at(pathB,bb1)[k])/2);
    if(distance(p0,p3)<1e-7)continue;
    const v0=at(pathA,aa0,true).map((v,k)=>((aa1-aa0)*v+(bb1-bb0)*at(pathB,bb0,true)[k])/2),v1=at(pathA,aa1,true).map((v,k)=>((aa1-aa0)*v+(bb1-bb0)*at(pathB,bb1,true)[k])/2);
    shared.push([p0,p0.map((v,k)=>v+v0[k]/3),p3.map((v,k)=>v-v1[k]/3),p3]);
  }
  if(!shared.length)throw new Error('No common curve span.');
  const replace=(path,lo,hi,ss)=>{
    const pre=subs(path,0,lo),post=subs(path,hi,path.length);
    if(pre.length){const p=pre.at(-1),delta=ss[0][0].map((v,k)=>v-p[3][k]);for(const j of[2,3])p[j]=p[j].map((v,k)=>v+delta[k]);}
    if(post.length){const p=post[0],delta=ss.at(-1)[3].map((v,k)=>v-p[0][k]);for(const j of[0,1])p[j]=p[j].map((v,k)=>v+delta[k]);}
    return[...pre,...ss,...post];
  };
  return[replace(pathA,a0,a1,shared),replace(pathB,Math.min(b0,b1),Math.max(b0,b1),b1>b0?shared:shared.toReversed().map(p=>p.toReversed()))];
}
export function recoverShared(candidate,prob,n,cfg,{deadline=Infinity,input={},rounds=12}={}){
  let best=candidate;const accepted=[],rejected=[],bigN=Math.min(512,2*n),big=resize(prob,n,bigN);
  let bigError=mismatch(renderCurves(best.graph,best.points,best.phase,bigN,48),big);
  for(let round=0;round<rounds&&performance.now()<deadline;round++){
    const paths=best.graph.nested(best.points),before=best.graph.solution(best.points,best.phase,input),ease=easeMetrics(before,cfg);let changed=false;
    for(const c of sharingCandidates(paths)){
      if(performance.now()>deadline)break;
      try{
        const next=paths.map(f=>f.slice()),pair=shareReplacement(paths[0][c.i],paths[1][c.j],c);next[0][c.i]=pair[0];next[1][c.j]=pair[1];
        const graph=new CurveGraph(next,best.graph.width),points=graph.points,error=mismatch(renderCurves(graph,points,best.phase,n,48),prob);
        if(error>best.error+1e-12)continue;
        const highError=mismatch(renderCurves(graph,points,best.phase,bigN,48),big);if(highError>bigError+1e-12){rejected.push({reason:'higher_resolution_error',...c});continue;}
        const solution=graph.solution(points,best.phase,input),check=validate(solution,cfg,{checkImage:false});if(!check.passed){rejected.push({reason:'geometry',issues:check.issues.slice(0,3),...c});continue;}
        const quality=easeMetrics(solution,cfg);if(quality.minimumRadius<Math.min(.45,ease.minimumRadius||Infinity)||quality.sharpTurns>ease.sharpTurns){rejected.push({reason:'cut_quality',...c});continue;}
        if(cfg.requireMaterialCore&&!materialAudit(solution,cfg).passed){rejected.push({reason:'paper',...c});continue;}
        accepted.push({...c,errorBefore:best.error,errorAfter:error,bigErrorBefore:bigError,bigErrorAfter:highError});
        best={...best,graph,points:points.slice(),error,geometryPassed:true,validation:check};bigError=highError;changed=true;break;
      }catch(e){rejected.push({reason:e.message,...c});}
    }if(!changed)break;
  }return{...best,sharing:{accepted,rejected}};
}
