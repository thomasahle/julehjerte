/** Small deterministic numerical backend. All image coordinates are normalized
 * in the grid initializer and millimetres in the free Bézier stage.
 */
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export function bernstein(t) { const u = 1 - t; return [u*u*u, 3*u*u*t, 3*u*t*t, t*t*t]; }
export function dbernstein(t) { const u = 1 - t; return [-3*u*u, 3*u*u-6*u*t, 6*u*t-3*t*t, 3*t*t]; }
export function ddbernstein(t) { return [6*(1-t), 18*t-12, 6-18*t, 6*t]; }
export function splineKnots(k) { return [...Array(4).fill(0), ...Array.from({length:k-4}, (_,i)=>(i+1)/(k-3)), ...Array(4).fill(1)]; }
export function splineBasis(t, k, derivative = false) {
  const knots=splineKnots(k), x=Math.min(1-1e-14,Math.max(0,t));
  let previous=Float64Array.from({length:knots.length-1},(_,i)=>Number(knots[i]<=x&&x<knots[i+1])), lower;
  for(let degree=1;degree<=3;degree++){
    if(degree===3)lower=previous;
    const next=new Float64Array(previous.length-1);
    for(let i=0;i<next.length;i++){
      const a=knots[i+degree]-knots[i],b=knots[i+degree+1]-knots[i+1];
      next[i]=(a?(x-knots[i])/a*previous[i]:0)+(b?(knots[i+degree+1]-x)/b*previous[i+1]:0);
    }previous=next;
  }
  if(!derivative)return previous;
  return Float64Array.from({length:k},(_,i)=>{
    const a=knots[i+3]-knots[i],b=knots[i+4]-knots[i+1];return(a?3*lower[i]/a:0)-(b?3*lower[i+1]/b:0);
  });
}
const basisCache=new Map();
export function basisTable(n,k) { const key=n+','+k;if(basisCache.has(key))return basisCache.get(key);const out=new Float64Array(n*k);for(let i=0;i<n;i++)out.set(splineBasis((i+.5)/n,k),i*k);basisCache.set(key,out);return out; }
export function bilinear(a,n,x,y) {
  x=clamp(x,0,n-1);y=clamp(y,0,n-1);const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,ii=Math.min(i+1,n-1),jj=Math.min(j+1,n-1);
  return(1-v)*((1-u)*a[j*n+i]+u*a[j*n+ii])+v*((1-u)*a[jj*n+i]+u*a[jj*n+ii]);
}
export function resize(a,n,m) {
  if(n===m)return Float64Array.from(a);
  // Area integration when shrinking keeps thin motifs represented at coarse scales.
  const out=new Float64Array(m*m),scale=n/m;
  if(m>n){for(let y=0;y<m;y++)for(let x=0;x<m;x++)out[y*m+x]=bilinear(a,n,(x+.5)*scale-.5,(y+.5)*scale-.5);return out;}
  const tmp=new Float64Array(n*m);
  for(let x=0;x<m;x++){const lo=x*scale,hi=(x+1)*scale;for(let i=Math.floor(lo);i<Math.ceil(hi);i++){const w=(Math.min(i+1,hi)-Math.max(i,lo))/scale;for(let y=0;y<n;y++)tmp[y*m+x]+=w*a[y*n+Math.min(i,n-1)];}}
  for(let y=0;y<m;y++){const lo=y*scale,hi=(y+1)*scale;for(let j=Math.floor(lo);j<Math.ceil(hi);j++){const w=(Math.min(j+1,hi)-Math.max(j,lo))/scale;for(let x=0;x<m;x++)out[y*m+x]+=w*tmp[Math.min(j,n-1)*m+x];}}
  return out;
}
export function randomNormal(seed=0) { let s=(seed+1)>>>0;const uniform=()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return(s+.5)/4294967296;};return()=>Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform()); }
export class Adam {
  constructor(size,rate){this.rate=rate;this.m=new Float64Array(size);this.v=new Float64Array(size);this.step=0;}
  reset(){this.m.fill(0);this.v.fill(0);this.step=0;}
  update(x,g,clip=Infinity){let sum=0;for(const v of g)sum+=v*v;const scale=Math.min(1,clip/Math.max(1e-30,Math.sqrt(sum))),t=++this.step,a=1-.9**t,b=1-.999**t;
    for(let i=0;i<x.length;i++){const d=g[i]*scale;this.m[i]=.9*this.m[i]+.1*d;this.v[i]=.999*this.v[i]+.001*d*d;x[i]-=this.rate*(this.m[i]/a)/(Math.sqrt(this.v[i]/b)+1e-8);}
  }
}
