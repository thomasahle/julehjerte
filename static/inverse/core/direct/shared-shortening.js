/** Move both ends of an invisible shared run along its visible boundary.
 * Splitting and reassigning the existing cubics preserves that boundary;
 * the two sheets reference one replacement connector. Proposals are untrusted.
 */
import {Cubic,distance,segmentDistance} from '../bezier.js';
import {CurveGraph} from './curves.js';
import {sharedRunTopology} from './shared-runs.js';
import {curvesOf} from '../graph.js';
import {sampleWeave,sampleRings,closedRings,validate} from '../validate.js';
import {finalMaterialAudit} from '../geometric-material.js';
import {referenceError} from '../image-reference.js';
import {matchingSummary} from './matching.js';
import {symmetryReport} from './symmetry.js';
import {sameArray} from '../kernel-choice.js';

const reverse=path=>path.toReversed().map(c=>c.toReversed());
function joinLines(a,b){
  const start=a[0],end=b[3],length=distance(start,end);
  // Keep curves and genuine returns. Only remove a redundant straight join.
  if(length<1e-8||[...a,...b].some(p=>segmentDistance(p,start,end)>1e-8))return[a,b];
  const along=p=>(p[0]-start[0])*(end[0]-start[0])+(p[1]-start[1])*(end[1]-start[1]);
  const values=[...a,...b].map(along);
  if(values.some((v,i)=>i&&v<values[i-1]-1e-8))return[a,b];
  return[Cubic.line(start,end).p];
}

function junctionMoves(graph,points,topology,junction,maximumMove){
  const incident=[...topology.adjacency.get(junction)],ids=new Set();
  for(const e of incident)for(const k of [0,3])if(topology.vertex.get(graph.edges[e][k])===junction)ids.add(graph.edges[e][k]);
  // Do not move an independent coincident branch or a pinned paper endpoint.
  if(ids.size!==1||graph.fixed[2*junction]||graph.fixed[2*junction+1]||incident.length!==3)return[];
  const visible=incident.filter(e=>graph.visible[e]);
  if(visible.length!==2||visible.some(e=>graph.occurrences[e].length!==1)
    ||graph.occurrences[visible[0]][0][1]===graph.occurrences[visible[1]][0][1])return[];
  const controls=graph.controls(points),moves=[];
  for(const edge of visible){
    const other=visible.find(e=>e!==edge),forward=graph.edges[edge][0]===junction,otherForward=graph.edges[other][0]===junction;
    const curve=new Cubic(forward?controls[edge]:controls[edge].toReversed()),otherCurve=otherForward?controls[other]:controls[other].toReversed();
    const length=curve.length();if(length<1e-6)continue;
    for(const fraction of [.0625,.125,.25,.5,.75]){
      const t=Math.min(fraction,maximumMove/length*fraction),[taken,remainder]=curve.split(t),point=taken.p[3];
      if(distance(point,curve.p[0])<1e-5||distance(point,curve.p[0])>maximumMove)continue;
      const transferred=joinLines(taken.p.toReversed(),otherCurve);
      moves.push({point,replacements:new Map([[edge,forward?[remainder.p]:reverse([remainder.p])],[other,otherForward?transferred:reverse(transferred)]])});
    }
  }
  return moves;
}

/** Bounded joint proposals, ordered by shared length saved. Visible cubics
 * retain their exact locus; geometry and physical validity require checking.
 */
export function sharedShorteningProposals(graph,points,cfg,{deadline=Infinity,maximumProposals=8,validateProposal=null}={}){
  const topology=sharedRunTopology(graph,points,{deadline});if(!topology)return[];
  const controls=graph.controls(points),candidates=[];
  for(const [runIndex,run]of topology.runs.entries()){
    if(performance.now()>=deadline)break;
    if(!run.path||run.ends.length!==2||run.edges.some(e=>graph.visible[e]||graph.occurrences[e].length!==2
      ||graph.occurrences[e][0][1]===graph.occurrences[e][1][1]))continue;
    const lengthBefore=run.path.reduce((s,c)=>s+new Cubic(c).length(),0);
    const moves=run.ends.map(j=>junctionMoves(graph,points,topology,j,2*cfg.nominalWidth));
    for(const a of moves[0])for(const b of moves[1]){
      // Two ends editing the same visible edge need a joint subdivision, not
      // two independent rewrites. Leave that different topology untouched.
      if([...a.replacements.keys()].some(e=>b.replacements.has(e)))continue;
      const lengthAfter=distance(a.point,b.point);
      if(lengthAfter<cfg.nominalWidth||lengthBefore-lengthAfter<Math.max(.01,lengthBefore*.001))continue;
      candidates.push({runIndex,run,a,b,lengthBefore,lengthAfter});
    }
  }
  candidates.sort((a,b)=>(b.lengthBefore-b.lengthAfter)-(a.lengthBefore-a.lengthAfter));
  // Give different runs a chance before spending the small validation budget
  // on several endpoint positions along the same obstructed connector.
  const seen=new Set(),first=[],rest=[];
  for(const c of candidates){if(seen.has(c.runIndex))rest.push(c);else{seen.add(c.runIndex);first.push(c);}}
  const proposals=[];
  for(const c of [...first,...rest]){
    if(proposals.length>=maximumProposals||performance.now()>=deadline)break;
    const delta=c.run.ends.map((j,i)=>[c.a,c.b][i].point.map((v,k)=>v-points[2*j+k]));
    const deformed=c.run.path.map((curve,i)=>curve.map((p,k)=>p.map((v,axis)=>{
      const t=(i+k/3)/c.run.path.length;return v+(1-t)*delta[0][axis]+t*delta[1][axis];
    })));
    deformed[0][0]=c.a.point.slice();deformed.at(-1)[3]=c.b.point.slice();
    // A straight shortcut can cross another cut. Also move the old connector
    // coherently, retaining its route around obstacles and exact shared copy.
    for(const connector of [[Cubic.line(c.a.point,c.b.point).p],deformed]){
    if(proposals.length>=maximumProposals||performance.now()>=deadline)break;
    const lengthAfter=connector.reduce((s,p)=>s+new Cubic(p).length(),0);
    if(c.lengthBefore-lengthAfter<Math.max(.01,c.lengthBefore*.001))continue;
    const replacements=new Map([...c.a.replacements,...c.b.replacements]);
    let valid=true;
    const paths=graph.families.map(f=>f.map(pi=>{
      const path=graph.paths[pi],out=[];
      for(let i=0;i<path.length;){
        const entry=path[i],[e,d]=entry;
        if(topology.groups[e]===c.runIndex){
          const end=i+c.run.edges.length-1,start=topology.endpoint(entry,true);
          if(end>=path.length||path.slice(i,end+1).some(([edge])=>topology.groups[edge]!==c.runIndex)
            ||!c.run.ends.includes(start)||topology.endpoint(path[end],false)!==c.run.ends[Number(start===c.run.ends[0])]){valid=false;break;}
          out.push(...(start===c.run.ends[0]?connector:reverse(connector)));i=end+1;
        }else{
          const replacement=replacements.get(e)||[controls[e]];out.push(...(d===1?replacement:reverse(replacement)));i++;
        }
      }
      return out;
    }));
    if(valid){
      const next=new CurveGraph(paths,graph.width);
      if(!validateProposal||validateProposal(next))proposals.push({graph:next,lengthBefore:c.lengthBefore,lengthAfter,
        movedJunctions:c.run.ends.map((j,i)=>({before:[points[2*j],points[2*j+1]],after:[c.a,c.b][i].point}))});
    }
    }
  }
  return proposals;
}

/** Accept only a shorter shared route with unchanged sampled artwork and
 * independently valid cuts and paper. The caller bounds proposal search;
 * an already started final audit completes before the result is returned.
 */
export function finalizeSharedShortening(solution,cfg,{deadline=Infinity,onProgress=()=>{}}={}){
  const input=solution.graph.target,source=input.sourceImage;
  if(!source?.mask||input.metadata?.originalCubicsPreserved||performance.now()>=deadline||!solution.graph.edges.some(e=>!e.visible))return solution;
  const start=performance.now(),graph=new CurveGraph(solution.paths.map((f,k)=>f.map((_,i)=>curvesOf(solution,k,i).map(c=>c.p))),input.width);
  const phase=input.phase?-1:1,proposalDeadline=Number.isFinite(deadline)?Math.min(deadline,start+Math.min(400,(deadline-start)*.4)):Infinity;
  // Screen obvious intersections, clearance failures and sharp turns before
  // spending the few full audits on the shortest but illegal shortcuts.
  // Complete self-return and independent paper checks still follow below.
  const proposals=sharedShorteningProposals(graph,graph.points,cfg,{deadline:proposalDeadline,maximumProposals:2,
    validateProposal:g=>validate(g.solution(g.points,phase,input),cfg,{checkImage:false,checkSelfNecks:false,finalGeometry:false}).passed});
  if(!proposals.length)return solution;
  const matching=matchingSummary(solution),references=new Map(),attempts=[];
  const errorBefore=referenceError(source,sampleWeave(solution,source.resolution)).mismatchFraction;
  if(!Number.isFinite(errorBefore))return solution;
  // The ordinary 0.01 mm flattening can classify a few boundary pixels
  // differently after exact cubic subdivision. Verify the unchanged outline
  // at finer precision, while also forbidding a worse ordinary source score.
  const precise=(s,n)=>sampleRings(closedRings(s,.0001).flat(),input.width,s.graph.target.phase^(s.paths[0].length%2)^(s.paths[1].length%2),n);
  let selected=solution;
  onProgress({stage:'directPolishing'});
  for(const proposal of proposals){
    if(performance.now()>=deadline)break;
    const next=proposal.graph.solution(proposal.graph.points,phase,input),symmetry=symmetryReport(next,cfg.symmetry);
    const report={lengthBeforeMm:proposal.lengthBefore,lengthAfterMm:proposal.lengthAfter,movedJunctions:proposal.movedJunctions,accepted:false};attempts.push(report);
    if(symmetry.honoured.length!==symmetry.requested.length||matching.identical&&!matchingSummary(next).identical){report.rejected='symmetry';continue;}
    let same=true;
    for(const n of [source.resolution,source.resolution*2]){
      if(performance.now()>=deadline){report.rejected='deadline';same=false;break;}
      if(!references.has(n))references.set(n,precise(solution,n));
      if(!sameArray(references.get(n),precise(next,n))){report.rejected='woven_mask';same=false;break;}
    }
    if(!same)continue;
    const errorAfter=referenceError(source,sampleWeave(next,source.resolution)).mismatchFraction;
    report.imageErrorBefore=errorBefore;report.imageErrorAfter=errorAfter;
    if(!Number.isFinite(errorAfter)||errorAfter>errorBefore){report.rejected='source_error';continue;}
    if(performance.now()>=deadline){report.rejected='deadline';break;}
    if(!validate(next,cfg,{checkImage:false,finalGeometry:true}).passed){report.rejected='geometry';continue;}
    if(performance.now()>=deadline){report.rejected='deadline';break;}
    if(cfg.requireMaterialCore&&!finalMaterialAudit(next,cfg).passed){report.rejected='paper';continue;}
    report.accepted=true;selected=next;break;
  }
  selected.graph.metadata={...solution.graph.metadata};
  selected.report={...solution.report,finalSharedShortening:{applied:selected!==solution,attempts,seconds:(performance.now()-start)/1000}};
  if(solution.automaticSettings)selected.automaticSettings=solution.automaticSettings;
  return selected;
}
