/** Fresh image-to-curve inverse fitting in JavaScript, without a traced graph.
 * Geometry and paper checks remain those used by the app's other solver.
 */
import {fitGrid,gridPaths,gridModel,gridMask,gridControls,mismatch} from './grid.js';
import {CurveGraph} from './curves.js';
import {refineCurves,fittingMargin} from './refine.js';
import {recoverShared} from './share.js';
import {materialAudit} from '../material.js';
import {resize} from './math.js';

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
function refloor(result,floor){
  const {model}=result,controls=gridControls(model,result.floor),z=model.z.slice();
  model.counts.forEach((count,f)=>{for(let j=0;j<model.k;j++){
    const gaps=[];let last=0;for(let i=0;i<=count;i++){const next=i===count?1:controls[f].c[j*count+i];gaps.push(Math.max(.0001,next-last-floor));last=next;}
    const sum=gaps.reduce((s,v)=>s+v,0);for(let i=0;i<=count;i++)z[model.offsets[f]+j*(count+1)+i]=Math.log(gaps[i]/sum);
  }});return z;
}
export function fitDirect(input,cfg,onProgress=()=>{}){
  const source=input.sourceImage,n=Math.min(256,source.resolution),prob=resize(source.probability||Float32Array.from(source.mask),source.resolution,n),start=performance.now(),deadline=start+cfg.timeLimit*1000;
  const evidence=borderEvidence(prob,n),attempts=[],timings=[],options=[],seen=new Set();
  const add=(counts,phase)=>{if(counts.some(c=>c<1||c>8||(c+1)*(cfg.nominalWidth+.35)>=cfg.width))return;const key=counts+':'+phase;if(!seen.has(key)){seen.add(key);options.push({counts,phase});}};
  for(let count=1;count<=8;count++)for(const phase of[1,-1])add([count,count],phase);
  const modes=sides=>{const counts=new Map();for(const r of evidence)if(sides.includes(r.side)&&r.count>=1&&r.count<=8)counts.set(r.count,(counts.get(r.count)||0)+1);return[...counts].sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]);};
  for(const a of modes([0,2]))for(const b of modes([1,3]))for(const phase of[1,-1])add([a,b],phase);
  const small=resize(prob,n,64);
  for(const o of options){const model=gridModel(o.counts);model.z.fill(0);o.initialError=mismatch(gridMask(model,64,o.phase),small);}
  options.sort((a,b)=>a.initialError-b.initialError||a.counts[0]+a.counts[1]-b.counts[0]-b.counts[1]);
  if(!options.length)throw new Error('The requested strip width leaves no room for a woven grid.');
  const stage=(name,run)=>{const at=performance.now();onProgress({stage:name});const value=run();timings.push({stage:name,seconds:(performance.now()-at)/1000});return value;};
  const coarse=stage('directInitializing',()=>{
    const results=[];
    for(const o of options){
      if(results.length&&performance.now()>start+cfg.timeLimit*280)break;
      const at=performance.now(),r=fitGrid(prob,n,o.counts,o.phase,{steps:280,deadline:start+cfg.timeLimit*300,seed:0});
      attempts.push({stage:'coarse',counts:o.counts,phase:o.phase,error:r.error,steps:r.steps,seconds:(performance.now()-at)/1000});results.push(r);
      onProgress({stage:'directInitializing',counts:o.counts,error:r.error});
    }return results.sort((a,b)=>a.error+.001*(a.model.counts[0]+a.model.counts[1])-b.error-.001*(b.model.counts[0]+b.model.counts[1]));
  });
  const fine=stage('directFitting',()=>coarse.slice(0,3).map(r=>{
    const at=performance.now(),next=fitGrid(prob,n,r.model.counts,r.phase,{steps:900,initial:r.model.z,deadline:start+cfg.timeLimit*480});
    attempts.push({stage:'fine',counts:r.model.counts,phase:r.phase,error:next.error,steps:next.steps,seconds:(performance.now()-at)/1000});return next.error<r.error?next:r;
  }).sort((a,b)=>a.error-b.error));
  const floor=fittingMargin(cfg,cfg.width)/cfg.width,candidates=[];
  for(let i=0;i<fine.length;i++){
    if(i&&performance.now()>start+cfg.timeLimit*900)break;
    const selected=fine[i],remaining=deadline-performance.now(),allocation=remaining/(fine.length-i),end=Math.min(deadline-1000,performance.now()+allocation);
    const clear=stage('directClearance',()=>fitGrid(prob,n,selected.model.counts,selected.phase,{steps:800,initial:refloor(selected,floor),floor,clearance:floor+.0015,deadline:performance.now()+allocation*.25}));
    attempts.push({stage:'clearance',counts:clear.model.counts,phase:clear.phase,error:clear.error,steps:clear.steps});
    const graph=new CurveGraph(gridPaths(clear.model,cfg.width,clear.floor),cfg.width);
    const candidate=stage('directRefining',()=>refineCurves(graph,prob,n,clear.phase,cfg,{deadline:end,input,onProgress:r=>onProgress({stage:'directRefining',counts:clear.model.counts,...r})}));
    candidate.counts=clear.model.counts;candidate.selectionScore=candidate.score+.001*(candidate.counts[0]+candidate.counts[1]);candidates.push(candidate);
  }
  candidates.sort((a,b)=>Number(b.paperPassed)-Number(a.paperPassed)||Number(b.geometryPassed)-Number(a.geometryPassed)||a.selectionScore-b.selectionScore);
  let candidate=candidates[0];
  if(candidate.paperPassed&&performance.now()<deadline)candidate=stage('directSharing',()=>recoverShared(candidate,prob,n,cfg,{deadline,input}));
  const solution=candidate.graph.solution(candidate.points,candidate.phase,input);
  const paper=stage('paper',()=>materialAudit(solution,cfg));
  solution.report={algorithm:'direct-bezier',imported:false,termination:!candidate.geometryPassed?'geometry_failure':!paper.passed?'paper_failure':candidate.error>cfg.maxImageError?'image_mismatch':'candidate_found',seconds:(performance.now()-start)/1000,
    optimizationResolution:n,sourceResolution:source.resolution,initialization:'Fresh ordered positive-gap cubic B-spline grids; independent shapes for both sheets',countsSearched:attempts.filter(a=>a.stage==='coarse').map(a=>({counts:a.counts,phase:a.phase})),attempts,selectedCounts:candidate.counts,candidates:candidates.map(c=>({counts:c.counts,error:c.error,score:c.score,geometry:c.geometryPassed,paper:c.paperPassed})),
    borderEvidence:evidence,borderCountsAreHardConstraints:false,traceUsed:false,freeCoordinates:'Both coordinates of anchors and handles; endpoints remain on assigned sides',stages:timings,checkpoints:candidate.history,sharing:candidate.sharing||{accepted:[],rejected:[]},estimatedMaskMismatch:candidate.error,minimumNominalWidth:cfg.nominalWidth,physicalAssemblyTested:false};
  return solution;
}
