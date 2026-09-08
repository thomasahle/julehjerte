/** Recover exact shared cuts from near-coincident fitted geometry. Photographs
 * accept or reject a proposal; their contours never create the proposal.
 */
import {Cubic,distance,unit,dot} from '../bezier.js';
import {CurveGraph,renderCurves} from './curves.js';
import {mismatch} from './grid.js';
import {validate,easeMetrics,sampleWeave} from '../validate.js';
import {materialAudit} from '../material.js';
import {matchingSummary} from './matching.js';
import {applyTies,symmetryTies,symmetryReport} from './symmetry.js';
import {requestedSymmetry} from '../settings.js';
import {curvesOf} from '../graph.js';
import {auditImageFeatures} from '../image-features.js';
import {maskDisagreement} from './prefer-matching.js';
import {sourceWeights} from '../image-reference.js';
import {resizeObjective} from './image-objective.js';

const curveKey=p=>[p,p.toReversed()].map(c=>c.flat().map(v=>Math.round(v*1e7)).join(',')).sort()[0];

function at(path,g,derivative=false,side=1){
  const knot=Math.round(g);if(Math.abs(g-knot)<1e-8)g=knot;
  // At a join the derivative belongs to the span being fitted. A preceding
  // segment must use the incoming handle, even if the next cut turns sharply.
  const index=derivative&&side<0&&Number.isInteger(g)?g-1:Math.floor(g);
  const i=Math.max(0,Math.min(path.length-1,index)),t=Math.max(0,Math.min(1,g-i)),c=new Cubic(path[i]);return derivative?c.derivative(t):c.point(t);
}
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
function subs(path,a,b){return path.flatMap((c,i)=>{const lo=Math.max(0,a-i),hi=Math.min(1,b-i);return hi-lo>1e-8?[new Cubic(c).subcurve(lo,hi).p]:[];});}
export function shareReplacement(pathA,pathB,c){
  let{a0,a1,b0,b1}=c;
  const blend=c.blend??.5,mix=(a,b)=>a.map((v,k)=>blend===.5?(v+b[k])/2:(1-blend)*v+blend*b[k]);
  const outward=(path,lo,hi)=>{if(distance(at(path,lo),at(path,Math.floor(lo)))<.65)lo=Math.floor(lo);if(distance(at(path,hi),at(path,Math.ceil(hi)))<.65)hi=Math.ceil(hi);return[lo,hi];};
  [a0,a1]=outward(pathA,a0,a1);if(b1>b0)[b0,b1]=outward(pathB,b0,b1);else[b1,b0]=outward(pathB,b1,b0);
  const knotsA=[],knotsB=[];for(let g=Math.ceil(a0);g<=Math.floor(a1);g++)knotsA.push((g-a0)/(a1-a0));for(let g=Math.ceil(Math.min(b0,b1));g<=Math.floor(Math.max(b0,b1));g++)knotsB.push((g-b0)/(b1-b0));
  const fractions=blend===1?[...knotsB,...knotsA]:[...knotsA,...knotsB];
  const count=Math.max(2,Math.floor(c.length/3)+1);for(let i=0;i<count;i++)fractions.push(i/(count-1));
  // Nearly equal knot fractions otherwise create microscopic cubics whose
  // numerical bend radius can reject an otherwise smooth shared span.
  // Keep the chosen source's actual knots ahead of nearby knots from its mate
  // or the uniform sampling, so a sharp corner stays a segment boundary.
  const fs=[0,1],shared=[];
  const minimumFraction=1e-4/Math.max(1,c.length);
  for(const fraction of fractions){const v=Math.max(0,Math.min(1,fraction));if(!fs.some(u=>Math.abs(u-v)<=minimumFraction))fs.push(v);}
  fs.sort((a,b)=>a-b);
  for(let i=1;i<fs.length;i++){
    const aa0=a0+(a1-a0)*fs[i-1],aa1=a0+(a1-a0)*fs[i],bb0=b0+(b1-b0)*fs[i-1],bb1=b0+(b1-b0)*fs[i];
    const p0=mix(at(pathA,aa0),at(pathB,bb0)),p3=mix(at(pathA,aa1),at(pathB,bb1));
    if(distance(p0,p3)<1e-7)continue;
    const v0=mix(at(pathA,aa0,true).map(v=>(aa1-aa0)*v),at(pathB,bb0,true,Math.sign(bb1-bb0)).map(v=>(bb1-bb0)*v)),v1=mix(at(pathA,aa1,true,-1).map(v=>(aa1-aa0)*v),at(pathB,bb1,true,Math.sign(bb0-bb1)).map(v=>(bb1-bb0)*v));
    shared.push([p0,p0.map((v,k)=>v+v0[k]/3),p3.map((v,k)=>v-v1[k]/3),p3]);
  }
  if(!shared.length)throw new Error('No common curve span.');
  const replace=(path,lo,hi,ss)=>{
    const pre=subs(path,0,lo),post=subs(path,hi,path.length);
    if(pre.length){const p=pre.at(-1),delta=ss[0][0].map((v,k)=>v-p[3][k]);for(const j of[2,3])p[j]=p[j].map((v,k)=>v+delta[k]);}
    if(post.length){const p=post[0],delta=ss.at(-1)[3].map((v,k)=>v-p[0][k]);for(const j of[0,1])p[j]=p[j].map((v,k)=>v+delta[k]);}
    return[...pre,...ss,...post];
  };
  return[replace(pathA,a0,a1,shared),replace(pathB,Math.min(b0,b1),Math.max(b0,b1),b1>b0?shared:shared.toReversed().map(p=>p.toReversed()))];
}

/** A shared span and its transpose must be edited together. Copying just one
 * cut breaks the identical-sheet constraint; skipping sharing leaves hairline
 * slivers between cuts that the area loss can barely see. */
export function sharingReplacement(paths,c,{identicalSheets=false}={}){
  const next=paths.map(f=>f.slice());
  if(identicalSheets&&c.i===c.j){
    // A cut meeting its own transpose can run along the diagonal (forward),
    // or across it (backward). Both partners need the same interval and cubic
    // subdivisions so the shared controls can also hold the symmetry ties.
    const lo=Math.min(c.b0,c.b1),hi=Math.max(c.b0,c.b1);
    if(Math.abs(c.a0-lo)>.05||Math.abs(c.a1-hi)>.05)return null;
    const a0=Math.min(c.a0,lo),a1=Math.max(c.a1,hi);
    c={...c,a0,a1,b0:c.b1>c.b0?a0:a1,b1:c.b1>c.b0?a1:a0};
  }
  const [a,b]=shareReplacement(paths[0][c.i],paths[1][c.j],c);
  next[0][c.i]=a;next[1][c.j]=b;
  if(identicalSheets&&c.i!==c.j){
    const transpose=p=>p.map(curve=>curve.map(([x,y])=>[y,x]));
    next[1][c.i]=transpose(a);next[0][c.j]=transpose(b);
  }
  return next;
}

export function recoverShared(candidate,prob,n,cfg,{deadline=Infinity,input={},rounds=12,weights=null}={}){
  let best=candidate;const accepted=[],rejected=[],bigN=Math.min(512,2*n),high=resizeObjective(prob,n,bigN,weights),big=high.probability;
  // Other square/chord symmetries still require their own complete edit orbit.
  // Never discard a requested constraint merely to remove a small image seam.
  if(requestedSymmetry(cfg.symmetry).some(name=>name!=='transpose'))return{...best,sharing:{accepted,rejected,skipped:'unsupported_symmetry'}};
  const identicalSheets=matchingSummary(best.graph.solution(best.points,best.phase,input)).identical;
  let bigError=mismatch(renderCurves(best.graph,best.points,best.phase,bigN,48),big,high.weights);
  for(let round=0;round<rounds&&performance.now()<deadline;round++){
    const paths=best.graph.nested(best.points),before=best.graph.solution(best.points,best.phase,input),ease=easeMetrics(before,cfg);let changed=false;
    proposals: for(const raw of sharingCandidates(paths))for(const blend of identicalSheets&&raw.i===raw.j?[.5]:[.5,0,1]){
      const c={...raw,blend};
      if(performance.now()>deadline)break;
      try{
        const next=sharingReplacement(paths,c,{identicalSheets});if(!next)continue;
        const graph=new CurveGraph(next,best.graph.width),points=graph.points;
        if(identicalSheets){
          const ties=symmetryTies(graph,{transpose:true});
          if(ties.skipped.length||ties.conflicts.length)continue;
          applyTies(ties,points,points,{fixed:graph.fixed,original:points.slice()});
        }
        const error=mismatch(renderCurves(graph,points,best.phase,n,48),prob,weights);
        if(error>best.error+1e-12)continue;
        const highError=mismatch(renderCurves(graph,points,best.phase,bigN,48),big,high.weights);if(highError>bigError+1e-12){rejected.push({reason:'higher_resolution_error',...c});continue;}
        const solution=graph.solution(points,best.phase,input),check=validate(solution,cfg,{checkImage:false});if(!check.passed){rejected.push({reason:'geometry',issues:check.issues.slice(0,3),...c});continue;}
        const quality=easeMetrics(solution,cfg);if(quality.minimumRadius<Math.min(.45,ease.minimumRadius||Infinity)||quality.sharpTurns>ease.sharpTurns){rejected.push({reason:'cut_quality',...c});continue;}
        if(cfg.requireMaterialCore&&!materialAudit(solution,cfg).passed){rejected.push({reason:'paper',...c});continue;}
        accepted.push({...c,errorBefore:best.error,errorAfter:error,bigErrorBefore:bigError,bigErrorAfter:highError});
        best={...best,graph,points:points.slice(),error,geometryPassed:true,validation:check};bigError=highError;changed=true;break proposals;
      }catch(e){rejected.push({reason:e.message,...c});}
    }if(!changed)break;
  }return{...best,sharing:{accepted,rejected}};
}

/** Finish the actual selected solution, after polishing and matching-sheet
 * preference. Earlier sharing cannot certify geometry those stages replace. */
export function finalizeShared(solution,cfg,{deadline=Infinity,onProgress=()=>{}}={}){
  const input=solution.graph.target,source=input.sourceImage;
  if(!source||performance.now()>=deadline||requestedSymmetry(cfg.symmetry).some(name=>name!=='transpose'))return solution;
  const start=performance.now(),paths=solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(c=>c.p)));
  if(!sharingCandidates(paths).length)return solution;
  onProgress({stage:'directSharing'});
  const graph=new CurveGraph(paths,cfg.width),phase=input.phase?-1:1,n=Math.min(256,source.resolution),resized=resizeObjective(source.mask,source.resolution,n,sourceWeights(source)),prob=resized.probability;
  const before=maskDisagreement(source,sampleWeave(solution,source.resolution));
  const candidate={graph,points:graph.points,phase,error:mismatch(renderCurves(graph,graph.points,phase,n,48),prob,resized.weights)};
  const shared=recoverShared(candidate,prob,n,cfg,{input,deadline,weights:resized.weights});
  let selected=solution,error=before;
  const report={...shared.sharing,errorBefore:before,errorAfter:before,applied:false};
  if(shared.sharing.accepted.length){
    const proposal=shared.graph.solution(shared.points,phase,input),woven=sampleWeave(proposal,source.resolution),nextError=maskDisagreement(source,woven);
    const symmetry=symmetryReport(proposal,cfg.symmetry);
    if(nextError<=before&&auditImageFeatures(source,woven,cfg.width).passed&&symmetry.honoured.length===symmetry.requested.length){
      selected=proposal;error=nextError;report.applied=true;report.errorAfter=nextError;
    }else report.rejectedFinalCheck={imageError:nextError,symmetry};
  }
  const seconds=(performance.now()-start)/1000,matching=solution.report.matchingPreference;
  selected.report={...solution.report,finalSharing:{...report,seconds},stages:[...(solution.report.stages||[]),{stage:'directSharing',seconds}],
    ...(report.applied?{estimatedMaskMismatch:error}:{}),
    ...(report.applied&&matching?{matchingPreference:{...matching,...matchingSummary(selected),selectedImageError:error,additionalImageError:error-matching.baselineImageError}}:{})};
  return selected;
}
