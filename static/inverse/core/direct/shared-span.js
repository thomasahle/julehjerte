/** Construct a common cubic span and retain its original parameter partitions. */
import {Cubic,distance} from '../bezier.js';

function at(path,g,derivative=false,side=1){
  const knot=Math.round(g);if(Math.abs(g-knot)<1e-8)g=knot;
  // At a join the derivative belongs to the span being fitted. A preceding
  // segment must use the incoming handle, even if the next cut turns sharply.
  const index=derivative&&side<0&&Number.isInteger(g)?g-1:Math.floor(g);
  const i=Math.max(0,Math.min(path.length-1,index)),t=Math.max(0,Math.min(1,g-i)),c=new Cubic(path[i]);return derivative?c.derivative(t):c.point(t);
}
export function expandSpan(pathA,pathB,c){
  let{a0,a1,b0,b1}=c;
  const outward=(path,lo,hi)=>{if(distance(at(path,lo),at(path,Math.floor(lo)))<.65)lo=Math.floor(lo);if(distance(at(path,hi),at(path,Math.ceil(hi)))<.65)hi=Math.ceil(hi);return[lo,hi];};
  [a0,a1]=outward(pathA,a0,a1);if(b1>b0)[b0,b1]=outward(pathB,b0,b1);else[b1,b0]=outward(pathB,b1,b0);
  return{...c,a0,a1,b0,b1};
}

function subs(path,a,b){return path.flatMap((c,i)=>{const lo=Math.max(0,a-i),hi=Math.min(1,b-i);return hi-lo>1e-8?[new Cubic(c).subcurve(lo,hi).p]:[];});}
export function sharedSpan(pathA,pathB,c,{expand=true,partitions=true}={}){
  let{a0,a1,b0,b1}=c;
  const blend=c.blend??.5,mix=(a,b)=>a.map((v,k)=>blend===.5?(v+b[k])/2:(1-blend)*v+blend*b[k]);
  if(expand)({a0,a1,b0,b1}=expandSpan(pathA,pathB,c));
  const knotsA=[],knotsB=[];for(let g=Math.ceil(a0);g<=Math.floor(a1);g++)knotsA.push((g-a0)/(a1-a0));for(let g=Math.ceil(Math.min(b0,b1));g<=Math.floor(Math.max(b0,b1));g++)knotsB.push((g-b0)/(b1-b0));
  const fractions=blend===1?[...knotsB,...knotsA]:[...knotsA,...knotsB];
  const count=Math.max(2,Math.floor(c.length/3)+1);for(let i=0;i<count;i++)fractions.push(i/(count-1));
  // Nearly equal knot fractions otherwise create microscopic cubics whose
  // numerical bend radius can reject an otherwise smooth shared span.
  // Keep the chosen source's actual knots ahead of nearby knots from its mate
  // or the uniform sampling, so a sharp corner stays a segment boundary.
  const fs=[0,1],shared=[];let complete=true;
  const minimumFraction=1e-4/Math.max(1,c.length);
  for(const fraction of fractions){const v=Math.max(0,Math.min(1,fraction));if(!fs.some(u=>Math.abs(u-v)<=minimumFraction))fs.push(v);}
  fs.sort((a,b)=>a-b);
  for(let i=1;i<fs.length;i++){
    const aa0=a0+(a1-a0)*fs[i-1],aa1=a0+(a1-a0)*fs[i],bb0=b0+(b1-b0)*fs[i-1],bb1=b0+(b1-b0)*fs[i];
    const p0=mix(at(pathA,aa0),at(pathB,bb0)),p3=mix(at(pathA,aa1),at(pathB,bb1));
    if(distance(p0,p3)<1e-7){complete=false;continue;}
    const v0=mix(at(pathA,aa0,true).map(v=>(aa1-aa0)*v),at(pathB,bb0,true,Math.sign(bb1-bb0)).map(v=>(bb1-bb0)*v)),v1=mix(at(pathA,aa1,true,-1).map(v=>(aa1-aa0)*v),at(pathB,bb1,true,Math.sign(bb0-bb1)).map(v=>(bb1-bb0)*v));
    shared.push([p0,p0.map((v,k)=>v+v0[k]/3),p3.map((v,k)=>v-v1[k]/3),p3]);
  }
  if(!shared.length)throw new Error('No common curve span.');
  const replace=(path,lo,hi,ss)=>{
    const pre=subs(path,0,lo),post=subs(path,hi,path.length);
    if(pre.length){const p=pre.at(-1),delta=ss[0][0].map((v,k)=>v-p[3][k]);for(const j of[2,3])p[j]=p[j].map((v,k)=>v+delta[k]);}
    if(post.length){const p=post[0],delta=ss.at(-1)[3].map((v,k)=>v-p[0][k]);for(const j of[0,1])p[j]=p[j].map((v,k)=>v+delta[k]);}
    return[...pre,...ss,...post];
  };
  const paths=[replace(pathA,a0,a1,shared),replace(pathB,Math.min(b0,b1),Math.max(b0,b1),b1>b0?shared:shared.toReversed().map(p=>p.toReversed()))];
  const bounds=(path,lo,hi,fractions)=>{
    const before=[0],after=[];
    for(let i=0;i<path.length;i++){
      const end=Math.min(lo,i+1);if(end-i>1e-8)before.push(end);
      if(i+1-Math.max(hi,i)>1e-8)after.push(i+1);
    }
    return[...before,...fractions.slice(1).map(t=>lo+(hi-lo)*t),...after];
  };
  return{paths,knots:partitions&&complete?[bounds(pathA,a0,a1,fs),bounds(pathB,Math.min(b0,b1),Math.max(b0,b1),b1>b0?fs:fs.toReversed().map(t=>1-t))]:null};
}

export function shareReplacement(a,b,c){return sharedSpan(a,b,c,{partitions:false}).paths;}
