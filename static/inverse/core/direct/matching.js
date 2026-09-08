/** A preference for reusing one physical cutting template. */
import {pathPolyline} from '../bezier.js';
import {curvesOf} from '../graph.js';
import {gridModel} from './grid.js';

export function symmetryEvidence(source){
  const {mask,resolution:n,validMask}=source;let incompatiblePairs=0,observed=0;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=y*n+x,j=x*n+y;if(validMask&&!validMask[i])continue;observed++;
    if(x>y&&(!validMask||validMask[j])&&mask[i]!==mask[j])incompatiblePairs++;
  }
  return{minimumIdenticalImageError:incompatiblePairs/Math.max(1,observed),method:'Each differently coloured observed pixel pair across the diagonal forces at least one error for identical templates.'};
}

export function matchingGrid(model,blend=.5){
  if(model.counts[0]!==model.counts[1])return null;
  const out=gridModel(model.counts,model.k,0,model.z),offset=model.offsets[1];
  for(let i=0;i<offset;i++)out.z[i]=out.z[i+offset]=(1-blend)*model.z[i]+blend*model.z[i+offset];
  return out;
}

/** Match already fitted free curves in local sheet coordinates. */
export function matchingPaths(paths,blend=.5){
  const [A,B]=paths;if(A.length!==B.length||A.some((p,i)=>p.length!==B[i].length))return null;
  const first=A.map((p,i)=>p.map((c,j)=>c.map((v,k)=>v.map((x,axis)=>(1-blend)*x+blend*B[i][j][k][1-axis]))));
  return[first,first.map(p=>p.map(c=>c.map(([x,y])=>[y,x])))];
}

const cache=new WeakMap();
export function matchingGroups(graph){
  if(cache.has(graph))return cache.get(graph);
  const [A,B]=graph.families;
  if(A.length!==B.length)return [];
  const parent=Array.from({length:graph.points.length},(_,i)=>i);
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(let i=0;i<A.length;i++){
    const a=graph.paths[A[i]],b=graph.paths[B[i]];if(a.length!==b.length)return [];
    for(let j=0;j<a.length;j++){
      const [ea,da]=a[j],[eb,db]=b[j],ia=da===1?graph.edges[ea]:graph.edges[ea].toReversed(),ib=db===1?graph.edges[eb]:graph.edges[eb].toReversed();
      for(let k=0;k<4;k++)for(let axis=0;axis<2;axis++)parent[root(2*ia[k]+axis)]=root(2*ib[k]+1-axis);
    }
  }
  const groups=new Map();for(let i=0;i<parent.length;i++){const key=root(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
  const result=[...groups.values()].filter(g=>g.length>1);cache.set(graph,result);return result;
}

/** Groups hold either plain parameter indices (the transposed-sheet ties) or
 * affine members [index,sign,offset] whose sign*value+offset agree. `tangent`
 * drops the offsets, which is the projection a gradient needs.
 */
export function projectMatching(values,groups,fixed=null,original=null,tangent=false){
  for(const ids of groups){
    if(typeof ids[0]!=='number'){
      const held=fixed?ids.find(m=>fixed[m[0]]):undefined;
      const target=held===undefined?ids.reduce((s,m)=>s+m[1]*values[m[0]]+(tangent?0:m[2]),0)/ids.length:tangent?0:held[1]*original[held[0]]+held[2];
      for(const m of ids)values[m[0]]=m[1]*(target-(tangent?0:m[2]));
      continue;
    }
    const locked=fixed?ids.find(i=>fixed[i]):undefined,mean=locked===undefined?ids.reduce((s,i)=>s+values[i],0)/ids.length:original[locked];
    for(const i of ids)values[i]=mean;
  }
}

export function matchingPenalty(graph,points,weight=2,groups=matchingGroups(graph)){
  const gradient=new Float64Array(points.length);let loss=0;
  const scale=weight/Math.max(1,groups.length)/graph.width**2;
  for(const ids of groups){
    if(typeof ids[0]!=='number'){
      const mean=ids.reduce((s,m)=>s+m[1]*points[m[0]]+m[2],0)/ids.length;
      for(const m of ids){const d=m[1]*points[m[0]]+m[2]-mean;loss+=scale*d*d/ids.length;gradient[m[0]]+=2*scale*m[1]*d/ids.length;}
      continue;
    }
    const mean=ids.reduce((s,i)=>s+points[i],0)/ids.length;for(const i of ids){const d=points[i]-mean;loss+=scale*d*d/ids.length;gradient[i]+=2*scale*d/ids.length;}
  }
  return{loss,gradient};
}

export function matchingSummary(solution){
  const [a,b]=solution.paths;if(a.length!==b.length)return{identical:false,rmsTemplateDifferenceMm:null};
  const sample=curves=>{
    const points=pathPolyline(curves,solution.graph.target.width*1e-5),arc=[0];
    for(let i=1;i<points.length;i++)arc.push(arc[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
    let at=0;return Array.from({length:101},(_,i)=>{const d=arc.at(-1)*i/100;while(at<arc.length-2&&arc[at+1]<d)at++;const t=(d-arc[at])/Math.max(1e-12,arc[at+1]-arc[at]);return points[at].map((v,k)=>v+t*(points[at+1][k]-v));});
  };
  let sum=0,count=0,identical=true;
  for(let i=0;i<a.length;i++){
    const A=curvesOf(solution,0,i),B=curvesOf(solution,1,i);
    if(A.length!==B.length)identical=false;
    else for(let j=0;j<A.length;j++)for(let k=0;k<4;k++)if(Math.hypot(A[j].p[k][0]-B[j].p[k][1],A[j].p[k][1]-B[j].p[k][0])>=1e-7)identical=false;
    const aa=sample(A),bb=sample(B);for(let j=0;j<aa.length;j++){sum+=(aa[j][0]-bb[j][1])**2+(aa[j][1]-bb[j][0])**2;count++;}
  }
  return{identical,rmsTemplateDifferenceMm:Math.sqrt(sum/Math.max(1,count)),comparison:'Corresponding cuts sampled at uniform arc length in local template coordinates.'};
}
