import {bilinear,homography,project,convexQuad,nelderMead,clamp} from './math.js';
/** Optional registration against a strongly supported regular checker lattice.
 * This is NOT used for arbitrary motifs. Must pass an >86% photometric gate AND four matching boundary-transition counts.
 * No reference paths, previous quads or case IDs are used.
 */
export function refinePeriodicGrid(image,quad,{maxIterations=1100}={}){
 const w=image.width,h=image.height,field=new Float32Array(w*h);for(let i=0;i<field.length;i++){const r=image.data[i*4],g=image.data[i*4+1];field[i]=1/(1+Math.exp(-(((r-g)/(r+g+1)-.30)/.045)));}
 const S=[[0,0],[1,0],[1,1],[0,1]],base=quad.flat(),scale=Math.sqrt(((quad[0][0]-quad[2][0])**2+(quad[0][1]-quad[2][1])**2)/2);
 function error(q,n,phase,size=64,hard=false){let H;try{H=homography(S,q);}catch{return 1;}let sum=0;for(let y=0;y<size;y++)for(let x=0;x<size;x++){const u=(x+.5)/size,v=(y+.5)/size,pred=((Math.floor(u*n)+Math.floor(v*n))%2)^phase,p=project(H,[u,v]),value=bilinear(field,w,h,p[0],p[1],.5);sum+=hard?((value>.5)!==Boolean(pred)?1:0):Math.abs(value-pred);}return sum/(size*size);}
 let best={error:1};for(let n=5;n<=12;n++)for(let phase=0;phase<2;phase++){const e=error(quad,n,phase);if(e<best.error)best={error:e,n,phase};}
 if(best.error>.30)return{accepted:false,reason:'No strong dense checker-lattice evidence',initialError:best.error};
 let z=Array(8).fill(0),totalEvaluations=0;
 for(const size of [64,96]){
  const f=zz=>{if(zz.some(x=>Math.abs(x)>.15))return 2+zz.reduce((s,x)=>s+x*x,0);const q=quad.map((p,i)=>[p[0]+zz[2*i]*scale,p[1]+zz[2*i+1]*scale]);if(!convexQuad(q))return 2;return error(q,best.n,best.phase,size)+.025*zz.reduce((s,x)=>s+x*x,0);};
  const res=nelderMead(f,z,Array(8).fill(size===64?.018:.008),{maxIterations,tolerance:2e-5});z=res.x;totalEvaluations+=res.evaluations;
 }
 const proposed=quad.map((p,i)=>[p[0]+z[2*i]*scale,p[1]+z[2*i+1]*scale]),before=error(quad,best.n,best.phase,256,true),after=error(proposed,best.n,best.phase,256,true);
 const counts=borderCounts(field,w,h,proposed);
 const cells=cellErrors(field,w,h,proposed,best.n,best.phase);
 const cellMax=Math.max(...cells),cellQ90=[...cells].sort((a,b)=>a-b)[Math.floor(cells.length*.90)];
 const accepted=after<.14&&after<before-.015&&counts.every(x=>x===best.n-1)&&cellMax<.40&&cellQ90<.20;
 return{accepted,reason:accepted?'High-support regular checker lattice registered':'Lattice hypothesis did not pass the photometric gate',quad:accepted?proposed:quad,proposedQuad:proposed,n:best.n,phase:best.phase,initialError:before,finalError:after,borderTransitionCounts:counts,maximumCellInteriorError:cellMax,cellInteriorErrorQ90:cellQ90,evaluations:totalEvaluations,displacementPx:quad.map((p,i)=>Math.hypot(proposed[i][0]-p[0],proposed[i][1]-p[1]))};
}
function borderCounts(field,w,h,q){const H=homography([[0,0],[1,0],[1,1],[0,1]],q),size=256,counts=[];
 for(let side=0;side<4;side++){const profile=[];for(let k=0;k<size;k++){const t=(k+.5)/size,values=[];for(let d=5;d<12;d++){const v=(d+.5)/size,p=side===0?[t,v]:side===1?[1-v,t]:side===2?[t,1-v]:[v,t];const[x,y]=project(H,p);values.push(bilinear(field,w,h,x,y,.5));}values.sort((a,b)=>a-b);profile.push(values[3]);}
  const bits=profile.map((v,i)=>{let s=0,z=0;for(let j=-3;j<=3;j++){const ww=Math.exp(-j*j/3);s+=profile[clamp(i+j,0,size-1)]*ww;z+=ww;}return s/z>.5;});let runs=[0];for(let i=1;i<size;i++)if(bits[i]!==bits[i-1])runs.push(i);runs.push(size);for(let k=0;k<runs.length-1;k++){const a=runs[k],b=runs[k+1];if(b-a<4){const bit=a?bits[a-1]:bits[Math.min(b,size-1)];for(let i=a;i<b;i++)bits[i]=bit;}}let n=0;for(let i=1;i<size;i++)if(bits[i]!==bits[i-1])n++;counts.push(n);
 }return counts;
}

function cellErrors(field,w,h,q,n,phase){const H=homography([[0,0],[1,0],[1,1],[0,1]],q),errors=[];for(let y=0;y<n;y++)for(let x=0;x<n;x++){let err=0;const target=Boolean(((x+y)%2)^phase);for(let j=0;j<12;j++)for(let i=0;i<12;i++){const p=project(H,[(x+.12+.76*(i+.5)/12)/n,(y+.12+.76*(j+.5)/12)/n]);err+=(bilinear(field,w,h,p[0],p[1],.5)>.5)!==target?1:0;}errors.push(err/144);}return errors;}
