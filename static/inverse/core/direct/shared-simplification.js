/** Simplify each shared run once, retaining branch points and paired copies.
 * This is final geometry cleanup: it never changes the fitting trajectory.
 */
import {Cubic,distance,fitPolyline,pathPolyline} from '../bezier.js';
import {CurveGraph} from './curves.js';
import {matchingSummary} from './matching.js';
import {symmetryReport} from './symmetry.js';
import {curvesOf} from '../graph.js';
import {sampleWeave,validate} from '../validate.js';
import {materialAudit} from '../material.js';
import {sameArray} from '../kernel-choice.js';

const reverse=path=>path.toReversed().map(c=>c.toReversed());
const matrices=[[1,0,0,1,0,0],[0,1,1,0,0,0],[-1,0,0,1,1,0],[1,0,0,-1,0,1],[-1,0,0,-1,1,1],[0,-1,-1,0,1,1],[0,1,-1,0,0,1],[0,-1,1,0,1,0]];
const transform=([x,y],k,w)=>{const[a,b,c,d,dx,dy]=matrices[k];return[a*x+b*y+dx*w,c*x+d*y+dy*w];};
const mapPath=(path,k,w)=>path.map(c=>c.map(p=>transform(p,k,w)));
const key=path=>path.flat(2).map(v=>Math.round(v*1e7)).join(',');
const visibleKeys=(graph,points)=>graph.controls(points).filter((_,i)=>graph.visible[i]).map(c=>[JSON.stringify(c),JSON.stringify(c.toReversed())].sort()[0]).sort();

function deviation(a,b){
  let maximum=0;
  for(const [x,y]of a){
    let nearest=Infinity;
    for(let i=1;i<b.length;i++){
      const [ax,ay]=b[i-1],dx=b[i][0]-ax,dy=b[i][1]-ay,length=dx*dx+dy*dy;
      const t=length?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/length)):0;
      nearest=Math.min(nearest,Math.hypot(x-ax-t*dx,y-ay-t*dy));
    }
    maximum=Math.max(maximum,nearest);
  }
  return maximum;
}

function fitSharedRun(path,width,cache){
  // Canonical orientation makes separate mirrored/rotated copies use the same
  // fit and subdivision. The cache lives only for this cleanup proposal.
  let best;
  for(let t=0;t<8;t++)for(const rev of [false,true]){
    const p=mapPath(rev?reverse(path):path,t,width),value=key(p);
    if(!best||value<best.key)best={key:value,p,t,rev};
  }
  if(!cache.has(best.key)){
    const backwards=reverse(best.p),stabilizer=[1,2,3,4,5].find(t=>best.p.every((c,i)=>c.every((p,j)=>distance(p,transform(backwards[i][j],t,width))<1e-7)));
    const fit=p=>fitPolyline(pathPolyline(p.map(c=>new Cubic(c)),width*.00003,width*.003),width*.0002,Infinity).map(c=>c.p);
    let fitted;
    if(stabilizer!==undefined){
      // A run can be its own reversed image. Fit one half, then construct the
      // other half exactly; independent fits need not split at matching points.
      const half=best.p.slice(0,Math.floor(best.p.length/2));
      if(best.p.length%2)half.push(new Cubic(best.p[Math.floor(best.p.length/2)]).split()[0].p);
      const first=fit(half);fitted=[...first,...mapPath(reverse(first),stabilizer,width)];
    }else fitted=fit(best.p);
    cache.set(best.key,fitted);
  }
  const undo=best.t===6?7:best.t===7?6:best.t;
  let fitted=mapPath(cache.get(best.key),undo,width);if(best.rev)fitted=reverse(fitted);
  if(fitted.length>=path.length)return null;
  // Keep the actual branch anchors, including their exact floating-point
  // values. Move their adjacent handles by the same negligible roundoff delta.
  for(const [c,p,k,h]of [[fitted[0],path[0][0],0,1],[fitted.at(-1),path.at(-1)[3],3,2]]){
    const delta=p.map((v,i)=>v-c[k][i]);c[h]=c[h].map((v,i)=>v+delta[i]);c[k]=p.slice();
  }
  const poly=p=>pathPolyline(p.map(c=>new Cubic(c)),width*.00001,width*.003),a=poly(path),b=poly(fitted);
  if(Math.max(deviation(a,b),deviation(b,a))>width*.0002)return null;
  return fitted;
}

/** Propose whole shared runs. A join is removable only if every occurrence
 * traverses the same two edges and no slit starts or ends there. */
export function simplifySharedGraph(graph,points,{deadline=Infinity}={}){
  const controls=graph.controls(points),adj=new Map(),pinned=new Set(),joins=new Map(),cache=new Map();
  const endpoint=(entry,start)=>graph.edges[entry[0]][start?(entry[1]===1?0:3):(entry[1]===1?3:0)];
  const put=(v,e)=>{if(!adj.has(v))adj.set(v,new Set());adj.get(v).add(e);};
  graph.edges.forEach((ids,e)=>{put(ids[0],e);put(ids[3],e);});
  for(const path of graph.paths){pinned.add(endpoint(path[0],true));pinned.add(endpoint(path.at(-1),false));}
  for(const [a,b]of graph.joins){const v=endpoint(a,false);if(v!==endpoint(b,true)||a[0]===b[0])continue;joins.set(v,(joins.get(v)||0)+1);}
  const links=Array.from(graph.edges,()=>[]),signatures=graph.occurrences.map(o=>o.map(([pi])=>pi).sort((a,b)=>a-b).join(','));
  for(const [v,set]of adj){
    if(set.size!==2||pinned.has(v))continue;
    const [a,b]=set;if(graph.visible[a]||graph.visible[b]||signatures[a]!==signatures[b]||joins.get(v)!==graph.occurrences[a].length)continue;
    links[a].push(b);links[b].push(a);
  }
  const groups=new Int32Array(controls.length).fill(-1),replacement=[];let removed=0;
  for(let i=0;i<controls.length;i++){
    if(performance.now()>=deadline)return null;
    if(groups[i]!==-1)continue;
    const component=[],stack=[i],id=replacement.length;groups[i]=id;
    while(stack.length){const e=stack.pop();component.push(e);for(const next of links[e])if(groups[next]===-1){groups[next]=id;stack.push(next);}}
    const ends=[];
    for(const e of component)for(const v of [graph.edges[e][0],graph.edges[e][3]])if(!links[e].some(other=>graph.edges[other][0]===v||graph.edges[other][3]===v))ends.push(v);
    let value=null;
    if(component.length>1&&ends.length===2){
      let v=ends[0],previous=-1;const path=[];
      for(let count=0;count<component.length;count++){
        const e=[...adj.get(v)].find(e=>groups[e]===id&&e!==previous);if(e===undefined)return null;
        const forward=graph.edges[e][0]===v;path.push(forward?controls[e]:controls[e].toReversed());
        previous=e;v=graph.edges[e][forward?3:0];
      }
      const fitted=fitSharedRun(path,graph.width,cache);
      if(fitted){value={path:fitted,ends,count:component.length};removed+=component.length-fitted.length;}
    }
    replacement.push(value);
  }
  if(!removed||performance.now()>=deadline)return null;
  let valid=true;
  const nested=graph.families.map(f=>f.map(pi=>{
    const path=graph.paths[pi],out=[];
    for(let i=0;i<path.length;){
      const [e,d]=path[i],r=replacement[groups[e]];
      if(!r){out.push(d===1?controls[e]:controls[e].toReversed());i++;continue;}
      const start=endpoint(path[i],true),last=i+r.count-1;
      if(last>=path.length||path.slice(i,last+1).some(([edge])=>groups[edge]!==groups[e])||!r.ends.includes(start)||endpoint(path[last],false)!==r.ends[Number(start===r.ends[0])]){valid=false;break;}
      out.push(...(start===r.ends[0]?r.path:reverse(r.path)));i=last+1;
    }
    return out;
  }));
  if(!valid)return null;
  const next=new CurveGraph(nested,graph.width);
  // Rebuilding a graph must not weld a new handle to, and thereby move, an
  // unrelated visible control that happens to have the same rounded key.
  return sameArray(visibleKeys(graph,points),visibleKeys(next,next.points))?next:null;
}

export function finalizeSharedSimplification(solution,cfg,{deadline=Infinity,onProgress=()=>{}}={}){
  const input=solution.graph.target,source=input.sourceImage;
  if(!source?.mask||input.metadata?.originalCubicsPreserved||performance.now()>=deadline||!solution.graph.edges.some(e=>!e.visible))return solution;
  const start=performance.now(),graph=new CurveGraph(solution.paths.map((f,k)=>f.map((_,i)=>curvesOf(solution,k,i).map(c=>c.p))),input.width);
  const next=simplifySharedGraph(graph,graph.points,{deadline});if(!next||performance.now()>=deadline)return solution;
  const phase=input.phase?-1:1,proposal=next.solution(next.points,phase,input),beforeMatching=matchingSummary(solution),symmetry=symmetryReport(proposal,cfg.symmetry);
  const report={segmentsBefore:graph.edges.length,segmentsAfter:next.edges.length,applied:false,maskResolutions:[],sampledDeviationLimitMm:input.width*.0002};
  const accept=()=>{
    if(symmetry.honoured.length!==symmetry.requested.length||beforeMatching.identical&&!matchingSummary(proposal).identical)return 'symmetry';
    for(const n of [source.resolution,source.resolution*2]){
      if(performance.now()>=deadline)return 'deadline';
      if(!sameArray(sampleWeave(solution,n),sampleWeave(proposal,n)))return 'woven_mask';
      report.maskResolutions.push(n);
    }
    if(performance.now()>=deadline)return 'deadline';
    if(!validate(proposal,cfg,{checkImage:false}).passed)return 'geometry';
    if(cfg.requireMaterialCore&&!materialAudit(proposal,cfg).passed)return 'paper';
    if(performance.now()>=deadline)return 'deadline';
    report.applied=true;return null;
  };
  onProgress({stage:'directPolishing'});report.rejection=accept();report.seconds=(performance.now()-start)/1000;
  const result=report.applied?proposal:solution;
  result.report={...solution.report,finalSharedSimplification:report,stages:[...(solution.report.stages||[]),{stage:'directPolishing',detail:'shared-run-simplification',seconds:report.seconds}]};
  return result;
}
