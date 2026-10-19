/** Constructive study, independent of the inverse solver.
 * Closed polygon contours + named frame recipes -> A/B/shared edge graph.
 * This small implementation handles explicit radial/nested/ordered examples;
 * it is not an arbitrary-SVG contour classifier or a general routing algorithm.
 */
const TAU=2*Math.PI,center=[50,50];
const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7;
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const circle=(r,c=center,n=128)=>Array.from({length:n},(_,i)=>[c[0]+r*Math.cos(i*TAU/n),c[1]+r*Math.sin(i*TAU/n)]);
export const star=(outer=23,inner=12)=>Array.from({length:10},(_,i)=>{const t=i*Math.PI/5-3*Math.PI/4,r=i%2?inner:outer;return[50+r*Math.cos(t),50+r*Math.sin(t)];});
export function frameContour(shape){
 if(shape==='circle')return circle(35);
 if(shape==='diamond')return[[85,85],[15,85],[15,15],[85,15]];
 if(shape==='hexagon')return circle(38,center,6);
 throw new Error('Unknown frame shape');
}
export function rayPort(contour,angle,c=center){
 const v=[Math.cos(angle),Math.sin(angle)],hits=[];
 for(let i=0;i<contour.length;i++){
  const p=contour[i],q=contour[(i+1)%contour.length],e=sub(q,p),d=cross(v,e);
  if(Math.abs(d)<1e-9)continue;
  const a=cross(sub(p,c),e)/d,t=cross(sub(p,c),v)/d;
  if(a>1e-8&&t>=-1e-8&&t<=1+1e-8){const point=mix(p,q,Math.max(0,Math.min(1,t)));if(!hits.some(h=>near(h.point,point)))hits.push({point,index:i+Math.max(0,Math.min(1,t))});}
 }
 if(hits.length!==1)throw new Error(`Radial recipe needs one contour hit; found ${hits.length}`);
 return hits[0];
}
function arc(contour,from,to){
 const n=contour.length,start=from.index,end=to.index<=start+1e-8?to.index+n:to.index,points=[from.point];
 for(let i=Math.floor(start)+1;i<end-1e-8;i++)points.push(contour[i%n]);
 points.push(to.point);return points.filter((p,i)=>!i||!near(p,points[i-1]));
}
const boxPort=t=>{const v=[Math.cos(t),Math.sin(t)],r=50/Math.max(...v.map(Math.abs));return v.map(x=>50+r*x);};
const edgeFamily=p=>Math.abs(p[1])<1e-7||Math.abs(p[1]-100)<1e-7?'A':'B';
export const polygonPath=points=>'M'+points.map(p=>p.join(',')).join('L')+'Z';
function builder(){
 const edges=[];
 const add=(points,family,kind)=>{
  for(let i=1;i<points.length;i++)if(!near(points[i-1],points[i]))edges.push({from:points[i-1],to:points[i],family,kind});
 };
 return{edges,add};
}
function outerFrame(b,shape,sectors,style){
 const frame=frameContour(shape),gates=[];
 for(const i of sectors){
  const middle=Math.PI/4+i*Math.PI/2,low=middle-Math.PI/8,high=middle+Math.PI/8;
  const l=rayPort(frame,low),m=rayPort(frame,middle),h=rayPort(frame,high);
  let lp=boxPort(low),hp=boxPort(high);
  if(style==='corner-checker'){
   // Continue each boundary along its sheet's axis, retaining port order.
   lp=edgeFamily(lp)==='A'?[l.point[0],lp[1]]:[lp[0],l.point[1]];
   hp=edgeFamily(hp)==='A'?[h.point[0],hp[1]]:[hp[0],h.point[1]];
  }
  b.add([lp,...arc(frame,l,m)],edgeFamily(lp),'frame');
  b.add([...arc(frame,m,h),hp],edgeFamily(hp),'frame');
  gates.push({angle:middle,point:m.point,low:l.point,high:h.point,lowPort:lp,highPort:hp});
 }
 return{frame,gates};
}
function leaf(b,contour,angle,c=center){
 const a=rayPort(contour,angle,c),z=rayPort(contour,angle+Math.PI,c);
 b.add(arc(contour,a,z),'A','motif');b.add(arc(contour,z,a),'B','motif');
 return[a.point,z.point];
}
function nested(b,contours,angle){
 if(contours.length===1)return leaf(b,contours[0],angle);
 const outer=contours[0],ports=Array.from({length:4},(_,i)=>rayPort(outer,angle+i*Math.PI/2));
 for(let i=0;i<4;i++)b.add(arc(outer,ports[i],ports[(i+1)%4]),i%2?'B':'A','motif');
 const child=nested(b,contours.slice(1),angle+Math.PI/2);
 b.add([ports[1].point,child[0]],'AB','shared');b.add([child[1],ports[3].point],'AB','shared');
 return[ports[0].point,ports[2].point];
}
export function construct({recipe='four-gate',shape='circle',style='rays',contours=[star()],centers}={}){
 const b=builder();let outer;
 if(recipe==='four-gate'){
  if(contours.length!==1)throw new Error('Four-gate recipe requires exactly one simple contour');
  outer=outerFrame(b,shape,[0,1,2,3],style);
  const ports=outer.gates.map(g=>rayPort(contours[0],g.angle));
  for(let i=0;i<4;i++){
   b.add([outer.gates[i].point,ports[i].point],'AB','shared');
   b.add(arc(contours[0],ports[i],ports[(i+1)%4]),i%2?'A':'B','motif');
  }
 }else if(recipe==='nested'||recipe==='islands'){
  outer=outerFrame(b,shape,[0,2],style);
  const start=outer.gates[1],end=outer.gates[0],angle=5*Math.PI/4;
  if(recipe==='nested'){
   const p=nested(b,contours,angle);
   b.add([start.point,p[0]],'AB','shared');b.add([p[1],end.point],'AB','shared');
  }else{
   if(!centers||centers.length!==contours.length)throw new Error('Ordered island recipe needs each component centre');
   let previous=start.point;
   for(let i=0;i<contours.length;i++){
    const p=leaf(b,contours[i],angle,centers[i]);b.add([previous,p[0]],'AB','shared');previous=p[1];
   }
   b.add([previous,end.point],'AB','shared');
  }
 }else throw new Error('Unsupported topology/frame recipe');
 return{...compile(b.edges),edges:b.edges,frame:outer.frame,gates:outer.gates,contours,recipe,shape,style};
}
export function compile(edges){
 const key=p=>p.map(x=>x.toFixed(6)).join(','),curves={},families=[];
 edges.forEach((e,i)=>{curves[i]={control_points:[e.from,mix(e.from,e.to,1/3),mix(e.from,e.to,2/3),e.to],visible_boundary:e.family!=='AB'};});
 for(const f of ['A','B']){
  const adj=new Map(),ids=[];
  edges.forEach((e,i)=>{if(!e.family.includes(f))return;ids.push(i);for(const p of[e.from,e.to]){const k=key(p);if(!adj.has(k))adj.set(k,[]);adj.get(k).push(i);}});
  const axis=f==='A'?1:0;
  for(const [k,v]of adj){const p=k.split(',').map(Number),boundary=p[axis]===0||p[axis]===100;if(v.length!==(boundary?1:2))throw new Error(`Invalid ${f} degree at ${k}`);}
  const starts=[...adj.keys()].filter(k=>+k.split(',')[axis]===0).sort((a,b)=>+a.split(',')[1-axis]-+b.split(',')[1-axis]),seen=new Set(),paths=[];
  for(const start of starts){
   let at=start;const path=[];
   for(;;){
    const id=adj.get(at).find(i=>!seen.has(i));if(id===undefined)break;
    const e=edges[id],reverse=key(e.to)===at;seen.add(id);path.push({curve:String(id),reverse});at=key(reverse?e.from:e.to);
   }
   if(+at.split(',')[axis]!==100)throw new Error(`${f} path ends on the wrong edge`);
   paths.push(path);
  }
  if(seen.size!==ids.length)throw new Error(`Closed or disconnected ${f} cutting cycle`);
  families.push(paths);
 }
 return{geometry:{schema:'heartcurves-2',units:'mm',square_width_mm:100,phase:1,paper_colors:['#b82535','#fff9ed'],curves,A_overlap_paths:families[0],B_overlap_paths:families[1],note:'Direct contour construction; no inverse solve. Physical assembly untested.'}};
}
export function targetSVG(result){
 // Independent desired fill: corner regions outside the frame + even-odd motif.
 // Corner sectors are closed against the relevant corner of the overlap square.
 const sectors=result.gates.map(g=>{
  const x=g.point[0]>50?100:0,y=g.point[1]>50?100:0;
  const l=rayPort(result.frame,g.angle-Math.PI/8),h=rayPort(result.frame,g.angle+Math.PI/8);
  return polygonPath([...arc(result.frame,l,h),g.highPort,[x,y],g.lowPort]);
 }).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512"><rect width="100" height="100" fill="white"/><path d="${sectors}" fill="black"/><path d="${result.contours.map(polygonPath).join('')}" fill="black" fill-rule="evenodd"/></svg>`;
}
