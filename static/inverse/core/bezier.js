/** Native cubic geometry, measured in millimetres. No raster cut graph. */
export const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
export const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
export const mul=(a,s)=>[a[0]*s,a[1]*s];
export const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
export const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
export const norm=a=>Math.hypot(...a);
export const distance=(a,b)=>norm(sub(a,b));
export const unit=a=>norm(a)>1e-12?mul(a,1/norm(a)):[1,0];
export const mix=(a,b,t)=>add(mul(a,1-t),mul(b,t));
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const angle=(a,b)=>Math.acos(clamp(dot(unit(a),unit(b)),-1,1))*180/Math.PI;
export function segmentDistance(p,a,b){const d=sub(b,a);return distance(p,add(a,mul(d,clamp(dot(sub(p,a),d)/(dot(d,d)||1)))));}
const GLX=[-.9894009349916499,-.9445750230732326,-.8656312023878318,-.755404408355003,-.6178762444026438,-.4580167776572274,-.2816035507792589,-.09501250983763744,.09501250983763744,.2816035507792589,.4580167776572274,.6178762444026438,.755404408355003,.8656312023878318,.9445750230732326,.9894009349916499];
const GLW=[.0271524594117541,.0622535239386479,.0951585116824928,.1246289712555339,.1495959888165767,.1691565193950025,.1826034150449236,.1894506104550685,.1894506104550685,.1826034150449236,.1691565193950025,.1495959888165767,.1246289712555339,.0951585116824928,.0622535239386479,.0271524594117541];
export class Cubic {
  constructor(p){if(!Array.isArray(p)||p.length!==4||p.some(q=>!Array.isArray(q)||q.length!==2||q.some(x=>!Number.isFinite(x))))throw new Error('A cubic needs four finite 2D control points.');this.p=p.map(q=>[...q]);this.cache=new Map();}
  static line(a,b){return new Cubic([a,mix(a,b,1/3),mix(a,b,2/3),b]);}
  point(t){const u=1-t;return [0,1].map(k=>u*u*u*this.p[0][k]+3*u*u*t*this.p[1][k]+3*u*t*t*this.p[2][k]+t*t*t*this.p[3][k]);}
  derivative(t){const u=1-t;return [0,1].map(k=>3*(u*u*(this.p[1][k]-this.p[0][k])+2*u*t*(this.p[2][k]-this.p[1][k])+t*t*(this.p[3][k]-this.p[2][k])));}
  second(t){return [0,1].map(k=>6*((1-t)*(this.p[2][k]-2*this.p[1][k]+this.p[0][k])+t*(this.p[3][k]-2*this.p[2][k]+this.p[1][k])));}
  tangent(end=0){let d=end?sub(this.p[3],this.p[2]):sub(this.p[1],this.p[0]);if(norm(d)<1e-10)d=end?sub(this.p[3],this.p[1]):sub(this.p[2],this.p[0]);return unit(d);}
  reversed(){return new Cubic([...this.p].reverse());}
  split(t=.5){const a=[0,1,2].map(i=>mix(this.p[i],this.p[i+1],t)),b=[0,1].map(i=>mix(a[i],a[i+1],t)),q=mix(b[0],b[1],t);return [new Cubic([this.p[0],a[0],b[0],q]),new Cubic([q,b[1],a[2],this.p[3]])];}
  subcurve(lo,hi){if(!(lo>=0&&hi<=1&&hi>lo))throw new Error('Invalid cubic interval.');const c=hi===1?this:this.split(hi)[0];return lo===0?c:c.split(lo/hi)[1];}
  flatness(){return Math.max(...this.p.map(p=>segmentDistance(p,this.p[0],this.p[3])));}
  flatten(tolerance=.01,maxStep=Infinity,parameters=false){
    if(!(tolerance>0&&maxStep>0))throw new Error('Positive flattening tolerances required.');
    const key=`${tolerance}:${maxStep}`,cached=this.cache.get(key);if(cached)return parameters?cached:cached.points;
    const points=[this.p[0]],ts=[0],stack=[[this,0,1,0]];
    while(stack.length){const [c,a,b,depth]=stack.pop();if(c.flatness()<=tolerance&&distance(c.p[0],c.p[3])<=maxStep){points.push(c.p[3]);ts.push(b);}else{if(depth>=24)throw new Error('Curve subdivision tolerance not reached.');const [l,r]=c.split(),m=(a+b)/2;stack.push([r,m,b,depth+1],[l,a,m,depth+1]);}}
    const result={points,ts};this.cache.set(key,result);return parameters?result:points;
  }
  length(){if(this._length!==undefined)return this._length;return this._length=GLX.reduce((s,t,i)=>s+GLW[i]*norm(this.derivative((t+1)/2))/2,0);}
  bending(){if(this._bending!==undefined)return this._bending;let total=0,last=0;for(let i=0;i<25;i++){const t=.001+.998*i/24,d=this.derivative(t),dd=this.second(t),v=cross(d,dd)**2/Math.max(norm(d),1e-8)**5;if(i)total+=(last+v)*.998/48;last=v;}return this._bending=total;}
  command(transform=p=>p){return 'C '+this.p.slice(1).map(p=>transform(p).map(x=>x.toFixed(8)).join(',')).join(' ');}
}
export const turnAngle=(a,b)=>angle(a.tangent(1),b.tangent(0));
export function splitLong(c,max=12){if(c.length()<=max)return[c];return c.split().flatMap(x=>splitLong(x,max));}
export function pathPolyline(cs,tol=.01,maxStep=Infinity){let p=[];for(const c of cs){const a=c.flatten(tol,maxStep);p.push(...(p.length?a.slice(1):a));}return p;}
export function rdp(p,eps){if(p.length<3)return p;let d=0,k=0;for(let i=1;i<p.length-1;i++){const v=segmentDistance(p[i],p[0],p.at(-1));if(v>d){d=v;k=i;}}return d<=eps?[p[0],p.at(-1)]:[...rdp(p.slice(0,k+1),eps).slice(0,-1),...rdp(p.slice(k),eps)];}
function polyDistance(p,line){let best=Infinity;for(let i=1;i<line.length;i++)best=Math.min(best,segmentDistance(p,line[i-1],line[i]));return best;}
export function fitPolyline(raw,tolerance=.25,maxSpan=12,cornerDegrees=65,cornerSupport=0){
  const p=raw.filter((v,i)=>!i||distance(v,raw[i-1])>1e-9);if(p.length<2)return[];
  if(distance(p[0],p.at(-1))<1e-9){const k=Math.floor(p.length/2);return [...fitPolyline(p.slice(0,k+1),tolerance,maxSpan,cornerDegrees,cornerSupport),...fitPolyline(p.slice(k),tolerance,maxSpan,cornerDegrees,cornerSupport)];}
  const simple=rdp(p,.6*tolerance),corners=[0];
  // Raster stairs can have a 90-degree turn across two very short edges.
  // Require that turn to persist over a physical neighbourhood before pinning it.
  // The remaining outline is still checked by the same curve-fitting error tests.
  const away=(i,direction)=>{let remaining=cornerSupport;for(let j=i;j+direction>=0&&j+direction<simple.length;j+=direction){const a=simple[j],b=simple[j+direction],length=distance(a,b);if(length>=remaining)return mix(a,b,remaining/length);remaining-=length;}return direction<0?simple[0]:simple.at(-1);};
  for(let i=1;i<simple.length-1;i++){
    const local=angle(sub(simple[i],simple[i-1]),sub(simple[i+1],simple[i]));
    const supported=cornerSupport>0?angle(sub(simple[i],away(i,-1)),sub(away(i,1),simple[i])):local;
    if(local>=cornerDegrees&&supported>=cornerDegrees)corners.push(i);
  }
  corners.push(simple.length-1);
  function rec(q,tan0=null,tan1=null,depth=0){
    if(q.length===2)return splitLong(Cubic.line(q[0],q[1]),maxSpan);
    const lengths=[0];for(let i=1;i<q.length;i++)lengths.push(lengths.at(-1)+distance(q[i-1],q[i]));const total=lengths.at(-1),t0=tan0||unit(sub(q[1],q[0])),t1=tan1||unit(sub(q.at(-1),q.at(-2)));
    let ts=lengths.map(x=>x/total),err,initialError;
    // Chord length is only an initial parameterization. Refine point parameters
    // before splitting an otherwise good cubic into unnecessary short segments.
    for(let iteration=0;iteration<5;iteration++){
      let aa=0,ab=0,bb=0,ar=0,br=0;
      for(let i=0;i<q.length;i++){const t=ts[i],u=1-t,b0=u**3,b1=3*t*u*u,b2=3*t*t*u,b3=t**3,v=mul(t0,b1),z=mul(t1,-b2),r=sub(q[i],add(mul(q[0],b0+b1),mul(q.at(-1),b2+b3)));aa+=dot(v,v);ab+=dot(v,z);bb+=dot(z,z);ar+=dot(v,r);br+=dot(z,r);}
      const det=aa*bb-ab*ab;let a=(ar*bb-br*ab)/det,b=(aa*br-ab*ar)/det;if(!(a>0&&b>0&&a<3*total&&b<3*total))a=b=distance(q[0],q.at(-1))/3;
      const c=new Cubic([q[0],add(q[0],mul(t0,a)),sub(q.at(-1),mul(t1,b)),q.at(-1)]),flat=c.flatten(Math.max(.003,.12*tolerance)),haus=Math.max(...flat.map(p=>polyDistance(p,q)),...q.map(p=>polyDistance(p,flat)));
      err=q.map((p,i)=>distance(p,c.point(ts[i])));
      if(iteration===0)initialError=err;
      if(haus<=.8*tolerance&&(Math.max(...err)<=1.5*tolerance||q.length<=4))return splitLong(c,maxSpan);
      const next=ts.map((t,i)=>{if(i===0||i===q.length-1)return t;const delta=sub(c.point(t),q[i]),d=c.derivative(t),den=dot(d,d)+dot(delta,c.second(t));return Math.abs(den)>1e-12?clamp(t-dot(delta,d)/den):t;});
      if(next.some((t,i)=>i>0&&t<=next[i-1])||next.every((t,i)=>Math.abs(t-ts[i])<1e-8))break;
      ts=next;
    }
    // If refinement cannot meet the checks, preserve the original subdivision.
    err=initialError;
    if(depth>=20)return q.slice(1).map((b,i)=>Cubic.line(q[i],b));let k=err.indexOf(Math.max(...err));if(k<=0||k>=q.length-1)k=Math.floor(q.length/2);const tan=unit(sub(q[Math.min(k+1,q.length-1)],q[Math.max(0,k-1)]));return [...rec(q.slice(0,k+1),t0,tan,depth+1),...rec(q.slice(k),tan,t1,depth+1)];
  }
  let result=[];for(let ci=1;ci<corners.length;ci++){const q=simple.slice(corners[ci-1],corners[ci]+1),dense=[q[0]];for(let i=1;i<q.length;i++){const n=Math.max(1,Math.ceil(distance(q[i-1],q[i])/Math.max(.1,maxSpan/8)));for(let j=1;j<=n;j++)dense.push(j===n?q[i]:mix(q[i-1],q[i],j/n));}result.push(...rec(dense));}return result;
}
// Polynomial-root isolation by derivative recursion on [0,1]. Repeated roots
// are checked at critical points; these remain floating-point computations.
const polyTrim=p=>{p=[...p];const s=Math.max(...p.map(Math.abs),1e-30);while(p.length>1&&Math.abs(p.at(-1))<s*1e-13)p.pop();return p;};
const evalPoly=(p,t)=>p.reduceRight((s,a)=>s*t+a,0);
const deriv=p=>p.slice(1).map((a,i)=>a*(i+1));
function pmul(a,b){const c=Array(a.length+b.length-1).fill(0);a.forEach((x,i)=>b.forEach((y,j)=>c[i+j]+=x*y));return c;}
function padd(a,b,k=1){return Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]||0)+k*(b[i]||0));}
export function realRoots01(raw){const p=polyTrim(raw),scale=Math.max(...p.map(Math.abs),1e-30);if(p.length<2)return[];if(p.length===2){const t=-p[0]/p[1];return t>0&&t<1?[t]:[];}const critical=realRoots01(deriv(p)),grid=[0,...critical,1],roots=critical.filter(t=>Math.abs(evalPoly(p,t))<scale*1e-10);for(let i=1;i<grid.length;i++){let a=grid[i-1],b=grid[i],fa=evalPoly(p,a),fb=evalPoly(p,b);if(fa*fb>=0)continue;for(let j=0;j<60;j++){const m=(a+b)/2,f=evalPoly(p,m);if(fa*f<=0){b=m;fb=f;}else{a=m;fa=f;}}roots.push((a+b)/2);}return [...new Set(roots.map(x=>+x.toFixed(12)))].sort((a,b)=>a-b);}
export function curvatureProfile(c){
  const ds=[0,1].map(k=>{const p=c.p.map(q=>q[k]);return[3*(p[1]-p[0]),6*(p[2]-2*p[1]+p[0]),3*(p[3]-3*p[2]+3*p[1]-p[0])];}),s=padd(pmul(ds[0],ds[0]),pmul(ds[1],ds[1])),n=padd(pmul(ds[0],deriv(ds[1])),pmul(ds[1],deriv(ds[0])),-1),critical=padd(pmul(deriv(n),s).map(x=>2*x),pmul(n,deriv(s)),-3),speedTs=[0,1,...realRoots01(deriv(s))];
  if(Math.min(...speedTs.map(t=>evalPoly(s,t)))<1e-16)return{minimumRadius:0,singular:true};
  let k=0,at=0;for(const t of [0,1,...realRoots01(critical)]){const v=Math.abs(evalPoly(n,t))/Math.max(evalPoly(s,t),1e-30)**1.5;if(v>k){k=v;at=t;}}
  return {minimumRadius:k<1e-10?null:1/k,parameter:at,point:c.point(at),singular:false,method:'floating-point polynomial critical points'};
}
