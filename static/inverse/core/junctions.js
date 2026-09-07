/** Recover blurred four-way junctions on pixel boundary chains, before fitting.
 * Only nearby, opposed bends with four well-separated arms are eligible.
 * Every displacement is bounded by radius and the original mask is retained.
 */
import {distance,sub,unit,dot,mix} from './bezier.js';
export function repairJunctions(chains,radius,width){
  if(!radius)return {chains,moves:[]};
  const support=2*radius,step=Math.max(.15,radius/5),nodes=[],info=chains.map(p=>{
    const lengths=[0];for(let i=1;i<p.length;i++)lengths.push(lengths.at(-1)+distance(p[i-1],p[i]));
    return {p,lengths,length:lengths.at(-1),closed:distance(p[0],p.at(-1))<1e-8};
  });
  function away(c,i,direction){
    let remaining=support,j=i;
    for(let count=0;count<c.p.length;count++){
      let next=j+direction;
      if(next<0||next>=c.p.length){if(!c.closed)return null;next=next<0?c.p.length-2:1;}
      const d=distance(c.p[j],c.p[next]);if(d>=remaining)return mix(c.p[j],c.p[next],remaining/d);
      remaining-=d;j=next;
    }return null;
  }
  for(let k=0;k<info.length;k++){
    const c=info[k];let last=-Infinity;
    for(let i=0;i<c.p.length-(c.closed?1:0);i++){
      const p=c.p[i];if(c.lengths[i]-last<step||Math.min(...p)<support||Math.max(...p)>width-support)continue;
      const a=away(c,i,-1),b=away(c,i,1);if(!a||!b)continue;
      const out=[unit(sub(a,p)),unit(sub(b,p))],bend=dot(...out);
      if(bend<-.8||bend>.5)continue;
      last=c.lengths[i];nodes.push({k,i,p,out,bend});
    }
  }
  const pairs=[],cells=new Map(),cell=p=>p.map(x=>Math.floor(x/(2*radius)));
  for(let i=0;i<nodes.length;i++){
    const a=nodes[i],[x,y]=cell(a.p);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const j of cells.get(`${x+dx},${y+dy}`)||[]){
      const b=nodes[j],d=distance(a.p,b.p);if(d>2*radius||d<1e-8)continue;
      if(a.k===b.k){let arc=Math.abs(info[a.k].lengths[a.i]-info[b.k].lengths[b.i]);if(info[a.k].closed)arc=Math.min(arc,info[a.k].length-arc);if(arc<4*support)continue;}
      const opposed=Math.max(Math.min(-dot(a.out[0],b.out[0]),-dot(a.out[1],b.out[1])),Math.min(-dot(a.out[0],b.out[1]),-dot(a.out[1],b.out[0])));
      if(opposed<.86)continue;
      // The gap must lie inside both bends, rather than alongside parallel arms.
      const gap=unit(sub(b.p,a.p));
      if(dot(unit([a.out[0][0]+a.out[1][0],a.out[0][1]+a.out[1][1]]),gap)>-.25||dot(unit([b.out[0][0]+b.out[1][0],b.out[0][1]+b.out[1][1]]),gap)<.25)continue;
      pairs.push({i,j,score:d+radius*(2-opposed+Math.abs(a.bend-b.bend))});
    }
    const key=`${x},${y}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);
  }
  pairs.sort((a,b)=>a.score-b.score);
  const edits=info.map(()=>[]),moves=[];
  for(const {i,j}of pairs){
    const a=nodes[i],b=nodes[j],center=mix(a.p,b.p,.5);
    if(moves.some(m=>distance(m.to,center)<3*support))continue;
    const changes=[];
    for(const v of[a,b]){
      const c=info[v.k];let lo=v.i,hi=v.i;
      while(lo>0&&distance(c.p[lo-1],center)<=radius)lo--;
      while(hi<c.p.length-1&&distance(c.p[hi+1],center)<=radius)hi++;
      // Do not edit an existing endpoint or the arbitrary seam of a closed chain.
      if(lo===0||hi===c.p.length-1||edits[v.k].some(e=>lo<=e.hi&&hi>=e.lo))break;
      changes.push({k:v.k,lo,hi,center});
    }
    if(changes.length!==2)continue;
    for(const e of changes)edits[e.k].push(e);
    moves.push({from:[a.p,b.p],to:center,maximumMoveMm:Math.max(...changes.flatMap(e=>info[e.k].p.slice(e.lo,e.hi+1).map(p=>distance(p,center))))});
  }
  const result=[];
  for(let k=0;k<info.length;k++){
    const p=info[k].p,es=edits[k].sort((a,b)=>a.lo-b.lo);let start=0,head=[];
    for(const e of es){const part=[...head,...p.slice(start,e.lo),e.center];if(part.length>1)result.push(part);head=[e.center];start=e.hi+1;}
    const tail=[...head,...p.slice(start)];if(tail.length>1)result.push(tail);
  }
  return {chains:result,moves};
}
