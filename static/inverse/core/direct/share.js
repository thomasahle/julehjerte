/** Recover exact shared cuts from near-coincident fitted geometry. Photographs
 * accept or reject a proposal; their contours never create the proposal.
 */
import {Cubic,distance,unit,dot} from '../bezier.js';
import {CurveGraph,renderCurves} from './curves.js';
import {mismatch} from './grid.js';
import {validate,easeMetrics,sampleWeave} from '../validate.js';
import {materialAudit} from '../material.js';
import {matchingSummary,templatePathOrder} from './matching.js';
import {applyTies,symmetryTies,symmetryReport} from './symmetry.js';
import {requestedSymmetry} from '../settings.js';
import {orbitSharingReplacement} from './sharing-orbit.js';
import {curvesOf} from '../graph.js';
import {auditFeatureFidelityChange} from '../feature-shapes.js';
import {imageFeatures} from '../image-features.js';
import {maskDisagreement} from './prefer-matching.js';
import {sourceWeights} from '../image-reference.js';
import {resizeObjective} from './image-objective.js';

import {shareReplacement} from './shared-span.js';
export {shareReplacement} from './shared-span.js';

const curveKey=p=>[p,p.toReversed()].map(c=>c.flat().map(v=>Math.round(v*1e7)).join(',')).sort()[0];
const needsOrbit=spec=>{const names=requestedSymmetry(spec);return names.some(n=>n!=='transpose'&&n!=='antiTranspose')||names.length>1;};

function samples(path,step=.2){
  const curves=path.map(c=>new Cubic(c)),raw=[],params=[],arc=[];
  curves.forEach((c,i)=>{const s=c.flatten(.003,.3,true);s.points.slice(0,-1).forEach((p,j)=>{params.push(i+s.ts[j]);raw.push(p);});});raw.push(path.at(-1)[3]);params.push(path.length);
  raw.forEach((p,i)=>arc.push(i?arc[i-1]+distance(p,raw[i-1]):0));
  const n=Math.max(2,Math.floor(arc.at(-1)/step)+1),out=[];let index=0;
  for(let i=0;i<n;i++){
    const s=i*arc.at(-1)/(n-1);while(index+1<arc.length-1&&arc[index+1]<s)index++;
    const t=(s-arc[index])/Math.max(1e-12,arc[index+1]-arc[index]),g=params[index]*(1-t)+params[index+1]*t,k=Math.min(curves.length-1,Math.floor(g)),u=g-k;
    out.push({p:curves[k].point(u),tan:unit(curves[k].derivative(u)),g,s});
  }return out;
}
export function sharingCandidates(paths){
  const all=paths.map(f=>f.map(p=>samples(p))),keys=paths.map(f=>f.map(p=>p.map(curveKey))),out=[],cell=.6;
  all[1].forEach((B,j)=>{
    const common=new Set(keys[1][j]);
    const bins=new Map();B.forEach((q,i)=>{const key=`${Math.floor(q.p[0]/cell)},${Math.floor(q.p[1]/cell)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);});
    all[0].forEach((A,i)=>{
      const matches=A.map(q=>{
        const x=Math.floor(q.p[0]/cell),y=Math.floor(q.p[1]/cell);let best=null,dist=cell;
        for(let xx=x-1;xx<=x+1;xx++)for(let yy=y-1;yy<=y+1;yy++)for(const k of bins.get(`${xx},${yy}`)||[]){const d=distance(q.p,B[k].p);if(d<dist){dist=d;best=B[k];}}
        return best&&Math.abs(dot(q.tan,best.tan))>.96?best:null;
      });
      for(let lo=0;lo<A.length;){if(!matches[lo]){lo++;continue;}let hi=lo+1;while(hi<A.length&&matches[hi])hi++;hi--;
        const length=A[hi].s-A[lo].s,a0=A[lo].g,a1=A[hi].g,b0=matches[lo].g,b1=matches[hi].g;
        // Do not repeatedly subdivide a span that is already exactly shared.
        // Require the same 3 mm minimum on the still-independent part of it.
        let independentLength=0;for(let k=lo;k<hi;k++)if(!common.has(keys[0][i][Math.min(paths[0][i].length-1,Math.floor(A[k].g))]))independentLength+=A[k+1].s-A[k].s;
        if(independentLength>=3&&Math.abs(b1-b0)>.05&&Math.min(a0,paths[0][i].length-a1,b0,b1,paths[1][j].length-b0,paths[1][j].length-b1)>.005)out.push({i,j,a0,a1,b0,b1,length});
        lo=hi+1;
      }
    });
  });return out.sort((a,b)=>b.length-a.length);
}
/** A shared span and its paired sheet image must be edited together. Copying just one
 * cut breaks the identical-sheet constraint; skipping sharing leaves hairline
 * slivers between cuts that the area loss can barely see. */
export function sharingReplacement(paths,c,{identicalSheets=false,antiTranspose=false,width=100}={}){
  if(identicalSheets&&!antiTranspose){
    if(paths[0].length!==paths[1].length)return null;
    const order=templatePathOrder(paths),a=order[0].findIndex(p=>p.index===c.i),b=order[1].findIndex(p=>p.index===c.j);
    const parameter=(f,i,t)=>order[f][i].reverse?order[f][i].path.length-t:t;
    let candidate={...c,i:a,j:b,a0:parameter(0,a,c.a0),a1:parameter(0,a,c.a1),b0:parameter(1,b,c.b0),b1:parameter(1,b,c.b1)};
    if(candidate.a0>candidate.a1)candidate={...candidate,a0:candidate.a1,a1:candidate.a0,b0:candidate.b1,b1:candidate.b0};
    const next=replaceOrdered(order.map(f=>f.map(p=>p.path)),candidate,{identicalSheets:true,width});
    if(!next)return null;
    return order.map((family,f)=>{const out=[];family.forEach((p,i)=>{out[p.index]=p.reverse?next[f][i].toReversed().map(c=>c.toReversed()):next[f][i];});return out;});
  }
  return replaceOrdered(paths,c,{identicalSheets,antiTranspose,width});
}
function replaceOrdered(paths,c,{identicalSheets=false,antiTranspose=false,width=100}={}){
  const next=paths.map(f=>f.slice());
  let mateA=c.j,mateB=c.i;
  if(antiTranspose){
    if(paths[0].length!==paths[1].length)return null;
    const order=paths.map((family,f)=>family.map((_,i)=>i).sort((i,j)=>family[i][0][0][f]-family[j][0][0][f])),n=order[0].length;
    mateA=order[0][n-1-order[1].indexOf(c.j)];mateB=order[1][n-1-order[0].indexOf(c.i)];
  }
  const paired=identicalSheets||antiTranspose,self=paired&&mateA===c.i&&mateB===c.j;
  if(self){
    // A cut meeting its own image needs corresponding intervals and cubic
    // subdivisions. Anti-transposition reverses the mate's parameter as well
    // as its control points; merely swapping coordinates pairs the wrong spans.
    const m=paths[0][c.i].length;
    if(paths[1][c.j].length!==m)return null;
    const b0=antiTranspose?m-c.b0:c.b0,b1=antiTranspose?m-c.b1:c.b1,lo=Math.min(b0,b1),hi=Math.max(b0,b1);
    if(Math.abs(c.a0-lo)>.05||Math.abs(c.a1-hi)>.05)return null;
    const a0=Math.min(c.a0,lo),a1=Math.max(c.a1,hi),low=antiTranspose?m-a1:a0,high=antiTranspose?m-a0:a1;
    c={...c,a0,a1,b0:c.b1>c.b0?low:high,b1:c.b1>c.b0?high:low};
  }
  const [a,b]=shareReplacement(paths[0][c.i],paths[1][c.j],c);
  next[0][c.i]=a;next[1][c.j]=b;
  if(paired&&!self){
    const image=p=>antiTranspose?p.toReversed().map(curve=>curve.toReversed().map(([x,y])=>[width-y,width-x])):p.map(curve=>curve.map(([x,y])=>[y,x]));
    next[1][mateB]=image(a);next[0][mateA]=image(b);
  }
  return next;
}

export function recoverShared(candidate,prob,n,cfg,{deadline=Infinity,input={},rounds=12,weights=null}={}){
  let best=candidate;const accepted=[],rejected=[],bigN=Math.min(512,2*n),high=resizeObjective(prob,n,bigN,weights),big=high.probability;
  const identicalSheets=matchingSummary(best.graph.solution(best.points,best.phase,input)).identical;
  const symmetry={...cfg.symmetry,...(identicalSheets?{transpose:true}:{})},antiTranspose=!!cfg.symmetry?.antiTranspose;
  const orbit=needsOrbit(symmetry);
  if(orbit){
    const paired=symmetryReport(best.graph.solution(best.points,best.phase,input),symmetry);
    if(paired.honoured.length!==paired.requested.length)return{...best,sharing:{accepted,rejected,skipped:'input_symmetry'}};
  }
  let bigError=mismatch(renderCurves(best.graph,best.points,best.phase,bigN,48),big,high.weights);
  // Reduced fitting scales can miss a narrow source feature or disagree on
  // edge pixels. Check each edit against the original artwork, so one bad
  // edit cannot undo the useful sharing accumulated earlier in the batch.
  const source=input.sourceImage,features=source&&imageFeatures(source,cfg.width);
  let sourceWoven=source&&sampleWeave(best.graph.solution(best.points,best.phase,input),source.resolution);
  let sourceError=source&&maskDisagreement(source,sourceWoven);
  // Keep the batch's original error ceiling. Two complementary alignments
  // can trade a few edge pixels while their combined edit still improves the
  // incoming fit; requiring strict descent after each would block that pair.
  const sourceErrorLimit=sourceError;
  for(let round=0;round<rounds&&performance.now()<deadline;round++){
    const paths=best.graph.nested(best.points),before=best.graph.solution(best.points,best.phase,input),ease=easeMetrics(before,cfg);let changed=false;
    const order=identicalSheets?templatePathOrder(paths).map(f=>f.map(p=>p.index)):null;
    proposals: for(const raw of sharingCandidates(paths))for(const blend of !antiTranspose&&identicalSheets&&order[0].indexOf(raw.i)===order[1].indexOf(raw.j)?[.5]:[.5,0,1]){
      const c={...raw,blend};
      if(performance.now()>deadline)break;
      try{
        const next=orbit?orbitSharingReplacement(paths,c,symmetry,best.graph.width):sharingReplacement(paths,c,{identicalSheets,antiTranspose,width:best.graph.width});if(!next)continue;
        let graph=new CurveGraph(next,best.graph.width),points=graph.points;
        const ties=symmetryTies(graph,symmetry);
        if(ties){
          if(ties.skipped.length||ties.conflicts.length)continue;
          if(!applyTies(ties,points,points,{fixed:graph.fixed,original:points.slice()}))continue;
        }
        // Projection can make additional orbit copies coincide. Re-index them
        // as genuinely shared graph edges before rendering or exporting.
        if(orbit){graph=new CurveGraph(graph.nested(points),graph.width);points=graph.points;}
        const error=mismatch(renderCurves(graph,points,best.phase,n,48),prob,weights);
        if(error>best.error+1e-12)continue;
        const highError=mismatch(renderCurves(graph,points,best.phase,bigN,48),big,high.weights);if(highError>bigError+1e-12){rejected.push({reason:'higher_resolution_error',...c});continue;}
        const solution=graph.solution(points,best.phase,input),paired=symmetryReport(solution,symmetry);
        if(paired.honoured.length!==paired.requested.length){rejected.push({reason:'symmetry',...c});continue;}
        const woven=source&&sampleWeave(solution,source.resolution),nextSourceError=source&&maskDisagreement(source,woven);
        if(source&&nextSourceError>sourceErrorLimit){rejected.push({reason:'source_image_error',errorLimit:sourceErrorLimit,errorBefore:sourceError,errorAfter:nextSourceError,...c});continue;}
        if(source){
          const change=auditFeatureFidelityChange(source,sourceWoven,woven,cfg,features);
          if(!change.passed){rejected.push({reason:'source_features',featureChange:change,...c});continue;}
        }
        const check=validate(solution,cfg,{checkImage:false});if(!check.passed){rejected.push({reason:'geometry',issues:check.issues.slice(0,3),...c});continue;}
        const quality=easeMetrics(solution,cfg);if(quality.minimumRadius<Math.min(.45,ease.minimumRadius||Infinity)||quality.sharpTurns>ease.sharpTurns){rejected.push({reason:'cut_quality',...c});continue;}
        if(cfg.requireMaterialCore&&!materialAudit(solution,cfg).passed){rejected.push({reason:'paper',...c});continue;}
        accepted.push({...c,errorBefore:best.error,errorAfter:error,bigErrorBefore:bigError,bigErrorAfter:highError,...(source?{sourceErrorBefore:sourceError,sourceErrorAfter:nextSourceError}:{})});
        best={...best,graph,points:points.slice(),error,geometryPassed:true,validation:check};bigError=highError;sourceWoven=woven;sourceError=nextSourceError;changed=true;break proposals;
      }catch(e){rejected.push({reason:e.message,...c});}
    }if(!changed)break;
  }return{...best,sharing:{accepted,rejected}};
}

/** Finish the actual selected solution, after polishing and matching-sheet
 * preference. Earlier sharing cannot certify geometry those stages replace. */
export function finalizeShared(solution,cfg,{deadline=Infinity,onProgress=()=>{}}={}){
  const input=solution.graph.target,source=input.sourceImage;
  if(!source||performance.now()>=deadline)return solution;
  if(needsOrbit(cfg.symmetry)){
    const symmetry=symmetryReport(solution,cfg.symmetry);
    if(symmetry.honoured.length!==symmetry.requested.length)return solution;
  }
  const start=performance.now(),paths=solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(c=>c.p)));
  if(!sharingCandidates(paths).length)return solution;
  onProgress({stage:'directSharing'});
  const graph=new CurveGraph(paths,cfg.width),phase=input.phase?-1:1,n=Math.min(256,source.resolution),resized=resizeObjective(source.mask,source.resolution,n,sourceWeights(source)),prob=resized.probability;
  const beforeWoven=sampleWeave(solution,source.resolution),before=maskDisagreement(source,beforeWoven);
  const candidate={graph,points:graph.points,phase,error:mismatch(renderCurves(graph,graph.points,phase,n,48),prob,resized.weights)};
  const shared=recoverShared(candidate,prob,n,cfg,{input,deadline,weights:resized.weights});
  let selected=solution,error=before;
  const report={...shared.sharing,errorBefore:before,errorAfter:before,applied:false};
  if(shared.sharing.accepted.length){
    const proposal=shared.graph.solution(shared.points,phase,input),woven=sampleWeave(proposal,source.resolution),nextError=maskDisagreement(source,woven);
    const symmetry=symmetryReport(proposal,cfg.symmetry);
    report.featureChange=auditFeatureFidelityChange(source,beforeWoven,woven,cfg);
    if(nextError<=before&&report.featureChange.passed&&symmetry.honoured.length===symmetry.requested.length){
      selected=proposal;error=nextError;report.applied=true;report.errorAfter=nextError;
    }else report.rejectedFinalCheck={imageError:nextError,symmetry};
  }
  const seconds=(performance.now()-start)/1000,matching=solution.report.matchingPreference;
  selected.report={...solution.report,finalSharing:{...report,seconds},stages:[...(solution.report.stages||[]),{stage:'directSharing',seconds}],
    ...(report.applied?{estimatedMaskMismatch:error}:{}),
    ...(report.applied&&matching?{matchingPreference:{...matching,...matchingSummary(selected),selectedImageError:error,additionalImageError:error-matching.baselineImageError}}:{})};
  return selected;
}
