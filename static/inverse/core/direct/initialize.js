/** Coordinated, image-only initialization of ordered slit families.
 * Dynamic programming optimizes all transitions in a row together. Alternating
 * sheet updates and a smooth spline projection preserve independent families.
 */
import {basisTable,resize} from './math.js';
import {gridControls,gridSamples,gridModel,gridMask,mismatch} from './grid.js';

/** Least-cost alternating runs with exactly `count` transitions. Pixel costs
 * can be soft probabilities. The minimum run length applies to edge runs too.
 */
export function alternatingRuns(row,count,phase,prior,{minimum=1,weight=.2}={}){
  const n=row.length,stride=n+1,prefix=[new Float64Array(stride),new Float64Array(stride)];
  for(let i=0;i<n;i++){prefix[0][i+1]=prefix[0][i]+row[i];prefix[1][i+1]=prefix[1][i]+1-row[i];}
  let previous=new Float64Array(stride).fill(Infinity);previous[0]=0;
  const back=Array.from({length:count+1},()=>new Int32Array(stride).fill(-1));
  for(let region=0;region<=count;region++){
    const costs=prefix[(phase+region)%2],next=new Float64Array(stride).fill(Infinity);let best=Infinity,at=-1;
    for(let end=(region+1)*minimum;end<=n-(count-region)*minimum;end++){
      const start=end-minimum,penalty=region?weight*n*(start/n-prior[region-1])**2:0,value=previous[start]-costs[start]+penalty;
      if(value<best){best=value;at=start;}
      next[end]=best+costs[end];back[region][end]=at;
    }
    previous=next;
  }
  if(!Number.isFinite(previous[n]))return null;
  const cuts=[];let end=n;
  for(let region=count;region>0;region--){end=back[region][end];cuts.push(end/n);}
  return cuts.reverse();
}
function solve(matrix,rhs){
  const n=rhs.length,a=matrix.map((row,i)=>[...row,rhs[i]]);
  for(let j=0;j<n;j++){
    let pivot=j;for(let i=j+1;i<n;i++)if(Math.abs(a[i][j])>Math.abs(a[pivot][j]))pivot=i;
    [a[j],a[pivot]]=[a[pivot],a[j]];const scale=a[j][j];if(Math.abs(scale)<1e-12)throw new Error('Singular spline projection');
    for(let k=j;k<=n;k++)a[j][k]/=scale;
    for(let i=0;i<n;i++)if(i!==j){const v=a[i][j];for(let k=j;k<=n;k++)a[i][k]-=v*a[j][k];}
  }return a.map(row=>row[n]);
}
function projectRows(model,f,positions,n,floor){
  const count=model.counts[f],k=model.k,basis=basisTable(n,k),matrix=Array.from({length:k},()=>new Float64Array(k)),rhs=Array.from({length:count},()=>new Float64Array(k));
  for(let y=0;y<n;y++)for(let j=0;j<k;j++){
    const b=basis[y*k+j];if(!b)continue;
    for(let l=0;l<k;l++)matrix[j][l]+=b*basis[y*k+l];
    for(let i=0;i<count;i++)rhs[i][j]+=b*positions[y*count+i];
  }
  // A light second-difference penalty damps row quantization, without assuming
  // equal widths, symmetry, straight cuts or a particular photographed motif.
  for(let j=0;j<k-2;j++)for(let a=0;a<3;a++)for(let b=0;b<3;b++)matrix[j+a][j+b]+=.25*[1,-2,1][a]*[1,-2,1][b];
  for(let j=0;j<k;j++)matrix[j][j]+=1e-8;
  const controls=rhs.map(v=>solve(matrix,v));
  for(let j=0;j<k;j++){
    let last=0;const gaps=[];
    for(let i=0;i<count;i++){
      const value=Math.max(last+floor+1e-5,Math.min(1-(count-i)* (floor+1e-5),controls[i][j]));gaps.push(value-last-floor);last=value;
    }
    gaps.push(1-last-floor);
    for(let i=0;i<=count;i++)model.z[model.offsets[f]+j*(count+1)+i]=Math.log(Math.max(1e-8,gaps[i]));
  }
}
/** Fit an independent pair of straight strip profiles to the whole image.
 * This supplies a nonuniform alternative to equally spaced starting grids. */
export function separableGrid(prob,size,counts,phase,{resolution=64,k=16,floor=.008}={}){
  const n=resolution,target=resize(prob,size,n),bit=Number(phase===-1),minimum=Math.max(1,Math.ceil(n*floor));let best=null;
  for(const fraction of[.07,.31,.63,.93]){
    const y=Math.floor(n*fraction),row=Array.from(target.slice(y*n,(y+1)*n)),prior=counts.map(c=>Array.from({length:c},(_,i)=>(i+1)/(c+1)));
    if(row[0]>.5)for(let x=0;x<n;x++)row[x]=1-row[x];
    let cuts=[alternatingRuns(row,counts[0],0,prior[0],{minimum,weight:0}),prior[1]];
    for(let round=0;round<6;round++)for(const f of[1,0]){
      const profile=new Float64Array(n),flips=new Uint8Array(n);
      for(let q=0;q<n;q++){let flip=bit;for(const cut of cuts[1-f])flip^=Number((q+.5)/n>cut);flips[q]=flip;}
      for(let t=0;t<n;t++)for(let q=0;q<n;q++){
        const p=target[f?t*n+q:q*n+t];profile[t]+=(flips[q]?1-p:p)/n;
      }
      cuts[f]=alternatingRuns(profile,counts[f],0,cuts[f],{minimum,weight:0});
    }
    const model=gridModel(counts,k);model.z.fill(0);
    for(let f=0;f<2;f++){const positions=new Float64Array(n*counts[f]);for(let y=0;y<n;y++)positions.set(cuts[f],y*counts[f]);projectRows(model,f,positions,n,floor);}
    const error=mismatch(gridMask(model,n,phase,floor),target);if(!best||error<best.error)best={model,error};
  }
  return best.model;
}
/** A noisy border is a proposal, never a hard slit-count constraint. */
export function borderGrid(counts,evidence,{k=16,floor=.008,resolution=96}={}){
  const model=gridModel(counts,k);model.z.fill(0);let supported=0;
  for(let f=0;f<2;f++){
    const ends=(f?[3,1]:[0,2]).map(side=>{
      const rows=evidence.filter(r=>r.side===side&&r.count===counts[f]);if(!rows.length)return null;
      return Array.from({length:counts[f]},(_,i)=>rows.reduce((s,r)=>s+r.transitions[i],0)/rows.length);
    });
    if(ends.some(e=>!e))continue;supported++;
    const positions=new Float64Array(resolution*counts[f]);
    for(let y=0;y<resolution;y++){const t=(y+.5)/resolution;for(let i=0;i<counts[f];i++)positions[y*counts[f]+i]=(1-t)*ends[0][i]+t*ends[1][i];}
    projectRows(model,f,positions,resolution,floor);
  }
  return supported?model:null;
}
export function initializeGrid(prob,size,counts,phase,{resolution=96,rounds=18,k=16,floor=.008,weight=.3,initial=null,scoreResolution=size,deadline=Infinity}={}){
  const n=resolution,target=resize(prob,size,n),model=gridModel(counts,k,0,initial);if(!initial)model.z.fill(0);
  let best={z:model.z.slice(),error:mismatch(gridMask(model,n,phase,floor),target)},completed=0;
  for(let round=0;round<rounds;round++){
    if(performance.now()>deadline)break;
    for(const f of round%2?[1,0]:[0,1]){
      const samples=gridSamples(gridControls(model,floor),model,basisTable(n,k),n),count=counts[f],positions=new Float64Array(n*count);
      for(let y=0;y<n;y++){
        const row=new Float64Array(n),prior=Array.from(samples[f].slice(y*count,(y+1)*count));
        for(let x=0;x<n;x++){
          let flip=0;for(let i=0;i<counts[1-f];i++)flip^=Number((y+.5)/n>samples[1-f][x*counts[1-f]+i]);
          const p=target[f?x*n+y:y*n+x];row[x]=flip?1-p:p;
        }
        const cuts=alternatingRuns(row,count,Number(phase===-1),prior,{minimum:Math.max(1,Math.ceil(n*floor)),weight});
        positions.set(cuts||prior,y*count);
      }
      projectRows(model,f,positions,n,floor);
    }
    completed++;const error=mismatch(gridMask(model,n,phase,floor),target);
    if(error<best.error)best={z:model.z.slice(),error};
  }
  model.z=best.z;const error=scoreResolution===n?best.error:mismatch(gridMask(model,scoreResolution,phase,floor),resize(prob,size,scoreResolution));
  return{model,phase,floor,error,steps:completed};
}
