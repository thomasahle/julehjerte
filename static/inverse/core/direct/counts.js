/** Discrete cut-count hypotheses and their image-only initialization.
 * Candidate enumeration is separate from the shared geometry optimizer so
 * initialization policies can be compared with identical downstream checks.
 */
import {gridModel,gridMask,mismatch} from './grid.js';
import {resize} from './math.js';
import {symmetricCounts} from './symmetry.js';
import {requestedSymmetry} from '../settings.js';
import {initializeGrid,borderGrid,separableGrid} from './initialize.js';

export function borderEvidence(prob,n){
  const rows=[];
  for(let side=0;side<4;side++)for(const fraction of[.015,.025,.04]){
    const depth=Math.max(1,Math.round(n*fraction)),band=Math.max(1,Math.round(n*.015)),profile=new Float64Array(n),smooth=new Float64Array(n);
    for(let t=0;t<n;t++){for(let k=depth;k<depth+band;k++){const x=side===0||side===2?t:side===1?n-1-k:k,y=side===1||side===3?t:side===0?k:n-1-k;profile[t]+=prob[y*n+x]/band;}}
    const radius=Math.max(1,Math.round(n*.006));for(let t=0;t<n;t++){let sum=0;for(let j=-radius;j<=radius;j++)sum+=profile[Math.max(0,Math.min(n-1,t+j))];smooth[t]=sum/(2*radius+1);}
    const transitions=[];for(let t=Math.ceil(n*.015)+1;t<n*.985;t++)if((smooth[t]>.5)!==(smooth[t-1]>.5))transitions.push(t/n);
    rows.push({side,inset:fraction,count:transitions.length,transitions});
  }return rows;
}
/** Repeated counts are useful evidence, even though a single pixel row is not
 * a reliable constraint. Require a majority on every opposing edge before
 * reserving one finalist. Other candidates remain free to disagree.
 */
export function supportedBorderCounts(evidence){
  const counts=[];
  for(const sides of[[0,2],[1,3]]){
    const perSide=sides.map(side=>{
      const rows=evidence.filter(r=>r.side===side),votes=new Map();
      for(const r of rows)votes.set(r.count,(votes.get(r.count)||0)+1);
      return[...votes].find(([,n])=>n>rows.length/2)?.[0];
    });
    if(!perSide[0]||perSide[0]!==perSide[1])return null;
    counts.push(perSide[0]);
  }
  return counts;
}
/** Expand the count search only when repeated inset measurements on opposing
 * edges both indicate a dense family. One noisy row never raises the ceiling.
 * Counts below the ceiling remain candidates; these are not endpoint rules.
 */
export function gridCountLimit(evidence){
  const repeated=side=>{
    const rows=evidence.filter(r=>r.side===side),votes=new Map();
    for(const row of rows)votes.set(row.count,(votes.get(row.count)||0)+1);
    return [...votes].find(([,n])=>n>rows.length/2)?.[0]??0;
  };
  let limit=8;
  for(const sides of [[0,2],[1,3]]){
    const counts=sides.map(repeated);
    if(counts.every(n=>n>8))limit=Math.max(limit,Math.max(...counts)+1);
  }
  return Math.min(16,limit);
}
export function gridFinalists(coarse,evidence,limit=3){
  const chosen=coarse.slice(0,limit),supported=supportedBorderCounts(evidence);
  if(supported&&!chosen.some(r=>r.model.counts.every((c,i)=>c===supported[i]))){
    const reserve=coarse.find(r=>r.model.counts.every((c,i)=>c===supported[i]));
    if(reserve)chosen[Math.min(limit-1,chosen.length)]=reserve;
  }
  return chosen;
}
export function countHypotheses({prob,n,cfg,evidence,maximumCount=gridCountLimit(evidence)}){
  const options=[],seen=new Set();
  const add=(counts,phase)=>{if(counts.some(c=>c<1||c>maximumCount||(c+1)*(cfg.nominalWidth+.35)>=cfg.width)||!symmetricCounts(cfg.symmetry,counts))return;const key=counts+':'+phase;if(!seen.has(key)){seen.add(key);options.push({counts,phase});}};
  for(let count=1;count<=maximumCount;count++)for(const phase of[1,-1])add([count,count],phase);
  const modes=sides=>{const counts=new Map();for(const r of evidence)if(sides.includes(r.side)&&r.count>=1&&r.count<=maximumCount)counts.set(r.count,(counts.get(r.count)||0)+1);return[...counts].sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]);};
  for(const a of modes([0,2]))for(const b of modes([1,3]))for(const phase of[1,-1])add([a,b],phase);
  const small=resize(prob,n,64);
  for(const o of options){const model=gridModel(o.counts);model.z.fill(0);o.initialError=mismatch(gridMask(model,64,o.phase),small);}
  options.sort((a,b)=>a.initialError-b.initialError||a.counts[0]+a.counts[1]-b.counts[0]-b.counts[1]);
  if(!options.length)throw new Error(requestedSymmetry(cfg.symmetry).length?'The requested symmetry allows no slit counts here: a mirrored family needs an even number of cuts, a transposition needs equal counts, and the strip width limits the rest.':'The requested strip width leaves no room for a woven grid.');
  return options;
}

export function initializeCounts({options,fullProb,resolution,prob,n,evidence},{rounds=18,sharedWork=false}={}){
    const seeds=[];
    for(const o of options){
      const uniform=gridModel(o.counts);uniform.z.fill(0);
      const raw={model:uniform,phase:o.phase,floor:.008,error:mismatch(gridMask(uniform,n,o.phase),prob),steps:0};
      const choices=[raw];
      // Keep both uniform and border-informed proposals: photographed endpoints
      // are useful evidence, but must not eliminate a better interior layout.
      for(const initial of[null,borderGrid(o.counts,evidence,{sharedWork})?.z,separableGrid(fullProb,resolution,o.counts,o.phase,{sharedWork}).z].filter(v=>v!==undefined)){
        const result=initializeGrid(fullProb,resolution,o.counts,o.phase,{initial,scoreResolution:96,rounds,sharedWork});
        result.error=mismatch(gridMask(result.model,n,result.phase,result.floor),prob);
        choices.push(result);
      }
      const initializationRounds=choices.filter(r=>r!==raw).map(r=>r.steps);
      choices.sort((a,b)=>a.error-b.error);seeds.push({...choices[0],initializationRounds,seedKind:choices[0]===raw?'uniform':'row-dynamic-programming'});
    }
    seeds.sort((a,b)=>a.error+.001*(a.model.counts[0]+a.model.counts[1])-b.error-.001*(b.model.counts[0]+b.model.counts[1]));
  return{seeds,report:{strategy:sharedWork?'shared-work':'all',hypotheses:options.length,fullyInitialized:options.length}};
}
