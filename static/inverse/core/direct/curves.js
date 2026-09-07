/** Independent free x/y cubic paths, with exactly shared controls represented
 * once. Canonicalization follows the reference CurveGraph's 1e-7 mm keys.
 */
import {bernstein,clamp} from './math.js';
import {Cubic} from '../bezier.js';
import {reindex} from '../graph.js';

export class CurveGraph {
  constructor(paths,width=100){
    this.width=width;this.edges=[];this.occurrences=[];this.paths=[];this.families=[[],[]];this.family=[];this.joins=[];
    const points=[],pm=new Map(),em=new Map();
    const point=p=>{const key=p.map(v=>Math.round(v*1e7)).join(',');if(!pm.has(key)){pm.set(key,points.length/2);points.push(...p);}return pm.get(key);};
    paths.forEach((family,f)=>family.forEach(path=>{
      const pi=this.paths.length,occ=[];
      for(const c of path){
        let ids=c.map(point),reverse=false;
        for(let j=0;j<4;j++){if(ids[j]===ids[3-j])continue;reverse=ids[j]>ids[3-j];break;}
        if(reverse)ids=ids.toReversed();const key=ids.join(',');let e=em.get(key);
        if(e===undefined){e=this.edges.length;em.set(key,e);this.edges.push(ids);this.occurrences.push([]);}
        const direction=reverse?-1:1;occ.push([e,direction]);this.occurrences[e].push([pi,f,direction]);
      }
      this.paths.push(occ);this.family.push(f);this.families[f].push(pi);
      for(let j=1;j<occ.length;j++)this.joins.push([occ[j-1],occ[j]]);
    }));
    this.points=Float64Array.from(points);this.fixed=new Uint8Array(points.length);this.visible=this.occurrences.map(o=>o.length%2===1);
    this.paths.forEach((p,pi)=>{const f=this.family[pi];for(const [entry,start]of[[p[0],true],[p.at(-1),false]]){const[e,d]=entry,vertex=this.edges[e][start?(d===1?0:3):(d===1?3:0)];this.fixed[2*vertex+1-f]=1;}});
  }
  nested(points=this.points){return this.families.map(f=>f.map(pi=>this.paths[pi].map(([e,d])=>(d===1?this.edges[e]:this.edges[e].toReversed()).map(id=>[points[2*id],points[2*id+1]]))));}
  controls(points=this.points){return this.edges.map(ids=>ids.map(i=>[points[2*i],points[2*i+1]]));}
  sample(points=this.points,ns=16){
    const bases=Array.from({length:ns+1},(_,i)=>bernstein(i/ns)),samples=new Float64Array(this.edges.length*(ns+1)*2);
    this.edges.forEach((ids,e)=>{for(let j=0;j<=ns;j++)for(let k=0;k<4;k++){const b=bases[j][k],i=2*(e*(ns+1)+j);samples[i]+=b*points[2*ids[k]];samples[i+1]+=b*points[2*ids[k]+1];}});
    const groups=this.paths.map(occ=>{
      const ids=[];for(const[e,d]of occ)for(let j=0;j<ns;j++)ids.push(e*(ns+1)+(d===1?j:ns-j));
      const[e,d]=occ.at(-1);ids.push(e*(ns+1)+(d===1?ns:0));return ids;
    });return{samples,groups,bases,ns};
  }
  solution(points,phase,input={}){
    const edges=this.edges.map((ids,e)=>({curve:new Cubic(ids.map(id=>[points[2*id],points[2*id+1]])),visible:this.visible[e]}));
    const w=this.width;
    // Reference fitter phase is XOR of right/bottom regions. The app stores
    // the top-left pixel phase and uses left/top closures for its renderer.
    const topLeft=Number(phase===-1);
    const target={...input,width:w,phase:topLeft,curves:edges.filter(e=>e.visible).map(e=>e.curve),metadata:{...input.metadata,input:'direct image fit',paperColors:input.metadata?.paperColors||['#bd1111','#ffffff']}};
    return{graph:reindex({target,edges,metadata:{candidateMethod:'Fresh ordered-grid initialization and free x/y Bézier boundary optimization; no target tracing',direct:true}}),paths:this.families.map(f=>f.map(pi=>this.paths[pi].map(([e,d])=>[e,d===1]))),report:{algorithm:'direct-bezier',imported:false}};
  }
}

/** Row bins accelerate exact containment of the sampled slit polygons. Only
 * their bounding boxes are indexed; queries still use actual segment crossings.
 */
export function polygonIndex(graph,points,ns=24,nbins=128){
  const sampled=graph.sample(points,ns),bins=Array.from({length:nbins},()=>[]),segments=[],w=graph.width;
  function add(ax,ay,bx,by,pi){
    if(ay>by)[ax,ay,bx,by]=[bx,by,ax,ay];
    const id=segments.length;segments.push([ax,ay,bx,by,pi]);if(ay===by)return;
    const lo=clamp(Math.floor(ay/w*nbins),0,nbins-1),hi=clamp(Math.floor(by/w*nbins),0,nbins-1);
    for(let i=lo;i<=hi;i++)bins[i].push(id);
  }
  graph.paths.forEach((_,pi)=>{
    const ids=sampled.groups[pi],s=sampled.samples;
    for(let i=1;i<ids.length;i++)add(s[2*ids[i-1]],s[2*ids[i-1]+1],s[2*ids[i]],s[2*ids[i]+1],pi);
    const first=ids[0],last=ids.at(-1),f=graph.family[pi];
    add(s[2*last],s[2*last+1],w,w,pi);add(w,w,f===0?w:0,f===0?0:w,pi);add(f===0?w:0,f===0?0:w,s[2*first],s[2*first+1],pi);
  });
  return{segments,bins,width:w,contains(x,y,exclude=-1,phase=1){
    let parity=Number(phase===-1);
    for(const id of bins[clamp(Math.floor(y/w*nbins),0,nbins-1)]){
      const s=segments[id];if(s[4]===exclude||y<s[1]||y>=s[3])continue;
      if(s[0]+(y-s[1])*(s[2]-s[0])/(s[3]-s[1])>x)parity^=1;
    }return parity;
  }};
}
export function renderCurves(graph,points,phase,n=256,ns=24){
  const index=polygonIndex(graph,points,ns),mask=new Uint8Array(n*n),w=graph.width;
  for(let y=0;y<n;y++){
    const yy=(y+.5)*w/n,crossings=[];
    for(const s of index.segments)if(yy>=s[1]&&yy<s[3])crossings.push(s[0]+(yy-s[1])*(s[2]-s[0])/(s[3]-s[1]));
    crossings.sort((a,b)=>a-b);let at=0,p=Number(phase===-1);
    for(let x=0;x<n;x++){const xx=(x+.5)*w/n;while(at<crossings.length&&crossings[at]<xx){p^=1;at++;}mask[y*n+x]=p;}
  }return mask;
}
