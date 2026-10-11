/** Keep useful degree reductions without letting one genuine bend veto them.
 * Changed controls connected by a cubic, shared point or requested symmetry
 * move together. Image deltas come from the XOR of their old/new boundaries;
 * accepted groups update the working mask before the next group is scored.
 * This only proposes geometry. Final selection still renders and validates it.
 */
import {CurveGraph,renderCurves} from './curves.js';
import {Cubic} from '../bezier.js';
import {straightProposal,primitiveComplexity,primitiveCost} from './primitives.js';
import {createBoundaryEvaluator} from './boundary.js';
import {matchingGroups,projectMatching,matchingSummary} from './matching.js';
import {symmetryTies,applyTies,symmetryReport} from './symmetry.js';
import {sourceWeights,referenceError} from '../image-reference.js';
import {curvesOf} from '../graph.js';
import {validate,sampleWeave} from '../validate.js';
import {materialAudit} from '../material.js';
import {auditImageFeatures} from '../image-features.js';
import {mismatch} from './grid.js';

/** Degree reduction belongs after the final choice, not between fitting stages:
 * even a mask-preserving edit can change a later optimizer's trajectory. */
export function finalizePrimitives(solution,cfg,options={}){
  // Preserve reductions already earned by the original proposal. Broader
  // eligibility can connect edit groups, so replacing the first pass outright
  // can lose useful independent changes. Both passes share one deadline.
  const first=finalizePrimitivePass(solution,cfg,options);
  return finalizePrimitivePass(first,cfg,{...options,measureCurve:true});
}

function finalizePrimitivePass(solution,cfg,{deadline=Infinity,onProgress=()=>{},measureCurve=false}={}){
  const source=solution.graph.target.sourceImage;
  if(!source?.mask||solution.graph.target.metadata?.originalCubicsPreserved||performance.now()>=deadline)return solution;
  const start=performance.now(),n=source.resolution,weights=sourceWeights(source),input=solution.graph.target;
  const paths=solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(c=>c.p))),graph=new CurveGraph(paths,input.width),points=graph.points;
  const straight=straightProposal(graph,points,n,{measureCurve});if(!straight)return solution;
  const beforeMatching=matchingSummary(solution),ties=symmetryTies(graph,cfg.symmetry),groups=beforeMatching.identical&&!ties?matchingGroups(graph):null;
  if(ties)applyTies(ties,straight,straight,{fixed:graph.fixed,original:points});
  if(groups)projectMatching(straight,groups,graph.fixed,points);
  const phase=input.phase?-1:1,mask=measureCurve?sampleWeave(solution,n):renderCurves(graph,points,phase,n,32);
  const selected=selectStraightProposal(graph,points,straight,source.mask,n,{mask,weights,ties,groups,adaptiveTolerance:measureCurve?.01:null});
  if(!selected||performance.now()>=deadline)return solution;
  const p=selected.points,originalPrimitives=primitiveComplexity(graph,points),primitives=primitiveComplexity(graph,p);
  const report={groups:selected.groups,selectedGroups:selected.accepted,curvedBefore:originalPrimitives.curved,curvedAfter:primitives.curved,
    sampledErrorBefore:mismatch(mask,source.mask,weights),sampledErrorAfter:mismatch(measureCurve?selected.mask:renderCurves(graph,p,phase,n,32),source.mask,weights),applied:false};
  let result=solution,afterMatching=beforeMatching;
  const accept=()=>{
    if(primitives.curved>=originalPrimitives.curved)return 'no_degree_reduction';
    if(report.sampledErrorAfter>report.sampledErrorBefore)return 'sampled_image_error';
    const value=createBoundaryEvaluator(graph,source.mask,n,{weights}),transposed=createBoundaryEvaluator(graph,source.mask,n,{weights,transpose:true,rows:193});
    const score=points=>(value(points,phase)+transposed(points,phase))/2+primitiveCost(graph,points,n);
    if(score(p)>score(points))return 'boundary_objective';
    const proposal=graph.solution(p,phase,input),woven=sampleWeave(proposal,n);
    report.sourceErrorBefore=referenceError(source,sampleWeave(solution,n)).mismatchFraction;
    report.sourceErrorAfter=referenceError(source,woven).mismatchFraction;
    if(report.sourceErrorAfter>report.sourceErrorBefore)return 'original_image_error';
    if(performance.now()>=deadline)return 'deadline';
    const symmetry=symmetryReport(proposal,cfg.symmetry);afterMatching=matchingSummary(proposal);
    if(symmetry.honoured.length!==symmetry.requested.length||beforeMatching.identical&&!afterMatching.identical)return 'symmetry';
    if(!auditImageFeatures(source,woven,graph.width).passed)return 'image_features';
    const check=validate(proposal,cfg,{checkImage:false});if(!check.passed)return 'geometry';
    if(cfg.requireMaterialCore&&!materialAudit(proposal,cfg).passed)return 'paper';
    result=proposal;report.applied=true;return null;
  };
  onProgress({stage:'directPolishing'});report.rejection=accept();report.seconds=(performance.now()-start)/1000;
  const matching=solution.report.matchingPreference;
  result.report={...solution.report,[measureCurve?'finalCurvePrimitiveSelection':'finalPrimitiveSelection']:report,stages:[...(solution.report.stages||[]),{stage:'directPolishing',detail:measureCurve?'curve-degree-reduction':'selective-degree-reduction',seconds:report.seconds}],
    ...(report.applied?{estimatedMaskMismatch:report.sourceErrorAfter}:{}),
    ...(report.applied&&matching?{matchingPreference:{...matching,...afterMatching,selectedImageError:report.sourceErrorAfter,
      ...(Number.isFinite(matching.baselineImageError)?{additionalImageError:report.sourceErrorAfter-matching.baselineImageError}:{})}}:{})};
  return result;
}

export function selectStraightProposal(graph,points,proposal,prob,n,{mask,weights=null,ns=32,ties=null,groups=null,adaptiveTolerance=null}={}){
  const changed=Uint8Array.from(points,(v,i)=>Number(v!==proposal[i]));
  if(!changed.some(Boolean))return null;
  const parent=Int32Array.from(points,(_,i)=>i);
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const join=indices=>{
    const active=indices.filter(i=>changed[i]);
    for(let j=1;j<active.length;j++)parent[root(active[j])]=root(active[0]);
  };
  for(const ids of graph.edges)join(ids.flatMap(i=>[2*i,2*i+1]));
  for(const group of [...(groups||[]),...(ties?.groups||[])])join(group.map(m=>typeof m==='number'?m:m[0]));
  for(const ids of ties?.withinCurve||[]){
    // A moving chord changes every within-curve reflection, not only the
    // endpoint pair. Usually straightening leaves these endpoints untouched.
    if([ids[0],ids.at(-1)].some(i=>changed[2*i]||changed[2*i+1]))join(ids.flatMap(i=>[2*i,2*i+1]));
    else for(let i=0;i<ids.length/2;i++){
      const a=ids[i],b=ids[ids.length-1-i];join([2*a,2*a+1,2*b,2*b+1]);
    }
  }
  const components=new Map();
  for(let i=0;i<changed.length;i++)if(changed[i]){
    const id=root(i);if(!components.has(id))components.set(id,{indices:[],segments:[]});
    components.get(id).indices.push(i);
  }
  const owner=ids=>{
    const index=ids.flatMap(i=>[2*i,2*i+1]).find(i=>changed[i]);
    return index===undefined?null:components.get(root(index));
  };
  const sample=values=>{
    if(adaptiveTolerance!==null)return graph.controls(values).map(p=>new Cubic(p).flatten(adaptiveTolerance));
    const {samples}=graph.sample(values,ns);
    return graph.edges.map((_,e)=>Array.from({length:ns+1},(_,j)=>{
      const i=2*(e*(ns+1)+j);return[samples[i],samples[i+1]];
    }));
  };
  const old=sample(points),next=sample(proposal),w=graph.width;
  const add=(component,ax,ay,bx,by)=>{
    if(ay>by)[ax,ay,bx,by]=[bx,by,ax,ay];
    if(ay!==by)component.segments.push([ax,ay,bx,by]);
  };
  graph.edges.forEach((ids,e)=>{
    if(!graph.visible[e])return;
    const component=owner(ids);if(!component)return;
    for(const samples of [old[e],next[e]])for(let j=1;j<samples.length;j++)add(component,...samples[j-1],...samples[j]);
  });
  // Include the same square closures as renderCurves if a projected proposal
  // also moved a path endpoint (e.g. a handle welded to an endpoint).
  graph.paths.forEach((path,pi)=>{
    for(const [entry,start]of [[path[0],true],[path.at(-1),false]]){
      const [e,d]=entry,k=start?(d===1?0:3):(d===1?3:0),id=graph.edges[e][k],component=owner([id]);
      if(!component)continue;
      const f=graph.family[pi],x=start?(f===0?w:0):w,y=start?(f===0?0:w):w;
      for(const values of [points,proposal])add(component,values[2*id],values[2*id+1],x,y);
    }
  });
  const working=mask.slice(),selected=points.slice();let accepted=0;
  // The renderer changes parity only after a crossing, including exact ties
  // with a pixel centre. Correct the arithmetic estimate using that same test.
  const firstAfter=x=>{
    let at=Math.max(0,Math.min(n,Math.floor(x*n/w-.5)+1));
    while(at>0&&(at-.5)*w/n>x)at--;
    while(at<n&&(at+.5)*w/n<=x)at++;
    return at;
  };
  for(const component of components.values()){
    const {segments}=component,touched=[];
    let bottom=Infinity,top=-Infinity;
    for(const s of segments){bottom=Math.min(bottom,s[1]);top=Math.max(top,s[3]);}
    const lo=Math.max(0,Math.floor(bottom*n/w-.5));
    const hi=Math.min(n,Math.ceil(top*n/w+.5));
    let delta=0;
    for(let y=lo;y<hi;y++){
      const yy=(y+.5)*w/n,crossings=[];
      for(const s of segments)if(yy>=s[1]&&yy<s[3])crossings.push(s[0]+(yy-s[1])*(s[2]-s[0])/(s[3]-s[1]));
      crossings.sort((a,b)=>a-b);
      for(let j=0;j+1<crossings.length;j+=2){
        const end=firstAfter(crossings[j+1]);
        for(let x=firstAfter(crossings[j]);x<end;x++){
          const i=y*n+x;touched.push(i);
          delta+=(weights?.[i]??1)*(working[i]===Number(prob[i]>.5)?1:-1);
        }
      }
    }
    if(delta>0)continue;
    for(const i of component.indices)selected[i]=proposal[i];
    for(const i of touched)working[i]^=1;
    accepted++;
  }
  return accepted?{points:selected,mask:working,accepted,groups:components.size}:null;
}
