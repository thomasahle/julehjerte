import {progressReporter,hasCandidateObserver} from './progress.js';
/** Two-sheet binary MILP with commodity-flow or path-step connectivity.
 * Continuous connectivity variables and slit labels allow nonmonotone cuts.
 * HiGHS is an unmodified, locally vendored WebAssembly dependency. */
import loadHighs from '../vendor/highs.mjs';
import {dot,mul,angle} from './bezier.js';
import {boundaryEndpoints} from './graph.js';
import {nearbyPairs,lineDistance,improperIntersection} from './geometry.js';
import {validate,selfNecks} from './validate.js';
import {completeSelfReturns} from './complete-self-returns.js';
import {selfIntersectionChains} from './self-intersections.js';
let runtimePromise;
export async function solverRuntime(){return runtimePromise??=loadHighs({locateFile:file=>new URL('../vendor/'+file,import.meta.url).href,print:()=>{},printErr:()=>{}});}
export class LinearModel{
  constructor(){this.cost=[];this.lb=[];this.ub=[];this.integer=[];this.rows=[];}
  variable({cost=0,lo=0,hi=1,binary=false}={}){const i=this.cost.length;this.cost.push(cost);this.lb.push(lo);this.ub.push(hi);this.integer.push(binary?1:0);return i;}
  row(terms,lo=-Infinity,hi=Infinity){const values=new Map();for(const[j,c]of terms)if(c)values.set(j,(values.get(j)||0)+c);const entries=[...values].filter(([,c])=>Math.abs(c)>1e-14).sort((a,b)=>a[0]-b[0]);this.rows.push({entries,lo,hi});return this.rows.at(-1);}
  data(){const starts=[0],indices=[],values=[];for(const r of this.rows){for(const[j,c]of r.entries){indices.push(j);values.push(c);}starts.push(indices.length);}return{numCols:this.cost.length,numRows:this.rows.length,colCost:Float64Array.from(this.cost),colLower:Float64Array.from(this.lb),colUpper:Float64Array.from(this.ub),integrality:Int32Array.from(this.integer),rowLower:Float64Array.from(this.rows.map(r=>r.lo)),rowUpper:Float64Array.from(this.rows.map(r=>r.hi)),matrix:{format:'csr',numCols:this.cost.length,numRows:this.rows.length,starts:Int32Array.from(starts),indices:Int32Array.from(indices),values:Float64Array.from(values)}};}
  canonicalize(quantum){
    if(!(quantum>0&&Number.isFinite(quantum)))throw new Error('A positive finite coefficient quantum is required.');
    const scale=1/quantum,q=v=>Number.isFinite(v)?Math.round(v*scale)/scale:v;
    this.cost=this.cost.map(q);
    for(const r of this.rows){r.entries=r.entries.map(([i,v])=>[i,q(v)]);r.lo=q(r.lo);r.hi=q(r.hi);}
  }
  residual(x){if(!x||x.length!==this.cost.length||Array.from(x).some(v=>!Number.isFinite(v)))return Infinity;let r=0;for(let j=0;j<x.length;j++){r=Math.max(r,this.lb[j]-x[j],x[j]-this.ub[j]);if(this.integer[j])r=Math.max(r,Math.abs(x[j]-Math.round(x[j])));}for(const row of this.rows){const a=row.entries.reduce((s,[j,v])=>s+v*x[j],0);r=Math.max(r,row.lo-a,a-row.hi);}return r;}
}
// Each sheet has at most two selected incident edges. One epigraph variable
// therefore represents the selected pair's turn cost exactly for integral paths.
export function constrainTurnCost(model, variable, a, b, cost) {
  model.row([[variable, 1], [a, -cost], [b, -cost]], -cost, Infinity);
}
export function objectiveGap(objective, lower) {
  return Number.isFinite(lower) ? Math.max(0, (objective - lower) / Math.max(1e-12, Math.abs(objective))) : Infinity;
}
function sheetClearance(curve,axis,width){
  return Math.min(...curve.p.map(p=>Math.min(p[axis],width-p[axis])));
}
/** The current segmentation may require a visible edge that neither sheet
 * can use. More hidden connectors cannot change these two existing bounds.
 * Another trace or boundary subdivision may still make the artwork routable.
 */
export function visibleMarginIssue(graph,cfg){
  for(const [edge,item]of graph.edges.entries())if(item.visible){
    const clearancesMm=[0,1].map(axis=>sheetClearance(item.curve,axis,graph.target.width));
    if(clearancesMm.every(d=>d<cfg.nominalWidth))return{type:'visible_edge_margin',edge,clearancesMm,requiredMm:cfg.nominalWidth,
      message:'A visible curve is forbidden on both sheets by the current control-hull margin bounds. Hidden connectors cannot repair this boundary segmentation.'};
  }
  return null;
}
export function formulate(graph,cfg,{onProgress=()=>{},connectivity='commodity-flow'}={}){
  if(!['commodity-flow','path-step-order'].includes(connectivity))throw new Error('Unknown routing connectivity formulation.');
  const pathSteps=connectivity==='path-step-order';
  const E=graph.edges.length,V=graph.points.length,w=graph.target.width,tol=cfg.geometryTolerance,endpoints=boundaryEndpoints(graph),m=new LinearModel(),x=[[],[]],z=[[],[]],flow=[[],[]],order=[[],[]],labels=[[],[]],lines=graph.edges.map(e=>e.curve.flatten(tol));
  const balance=graph.edges.map(edge=>{if(edge.visible)return 0;const on=p=>graph.guides?.some(g=>Math.abs(dot(p,g.normal)-g.offset)<2*tol),aligned=graph.guides?.some(g=>edge.curve.p.every(p=>Math.abs(dot(p,g.normal)-g.offset)<2*tol));let gridCost=(on(edge.curve.p[0])||on(edge.curve.p[3]))&&!aligned?cfg.gridPreference/2:0;let sum=0;for(const v of [edge.u,edge.v]){if(on(graph.points[v]))continue;const visible=graph.incident[v].filter(e=>graph.edges[e].visible);if(visible.length!==2)continue;const h=edge.u===v?edge.curve.tangent(0):mul(edge.curve.tangent(1),-1),angles=visible.map(e=>{const c=graph.edges[e];return angle(h,c.u===v?c.curve.tangent(0):mul(c.curve.tangent(1),-1));});sum+=((angles[0]-angles[1])/90)**2;}return gridCost+cfg.junctionBalancePenalty*sum/2;});
  for(const k of[0,1]){const K=endpoints[k].sources.length,M=Math.max(1,K),sources=new Set(endpoints[k].sources),sinks=new Set(endpoints[k].sinks);
    for(let v=0;v<V;v++){labels[k][v]=m.variable({hi:Math.max(0,K-1)});if(pathSteps)order[k][v]=m.variable({hi:sources.has(v)?0:Math.max(0,V-1)});}for(const verts of[endpoints[k].sources,endpoints[k].sinks])verts.forEach((v,i)=>{m.lb[labels[k][v]]=i;m.ub[labels[k][v]]=i;});
    for(let e=0;e<E;e++){const edge=graph.edges[e],c=edge.curve,cost=balance[e]+c.length()+cfg.bendingPenalty*Math.min(c.bending(),1e4)+(edge.visible?0:cfg.connectorPenalty/2),side=sheetClearance(c,k,w);x[k][e]=m.variable({cost,binary:true,hi:K>0&&side>=cfg.nominalWidth?1:0});z[k][e]=[];flow[k][e]=[];
      for(const d of[0,1]){
        z[k][e][d]=m.variable({binary:true});
        if(pathSteps){
          const advance=[[order[k][d?edge.u:edge.v],1],[order[k][d?edge.v:edge.u],-1]];
          // A selected directed edge advances exactly one path step. Together
          // with degree 0/2 internally and source/sink degree 1, these equations
          // forbid detached directed cycles: summing around one gives 0=length.
          // Conversely every simple source-to-sink path has ranks 0..V-1, so
          // no valid routing is lost. Ranks need no integer variables: selected
          // edges propagate the source's zero rank. Inactive edges impose no
          // restriction on ranks in [0,V-1]. These are combinatorial positions,
          // not x/y coordinates; backward-running cuts remain possible.
          m.row([...advance,[z[k][e][d],-V]],1-V,Infinity);
          m.row([...advance,[z[k][e][d],V]],-Infinity,1+V);
        }else{flow[k][e][d]=m.variable({hi:Math.max(1,V)});m.row([[flow[k][e][d],1],[z[k][e][d],-Math.max(1,V)]],-Infinity,0);}
      }m.row([[z[k][e][0],1],[z[k][e][1],1],[x[k][e],-1]],0,0);
      for(const sign of[-1,1])m.row([[labels[k][edge.u],sign],[labels[k][edge.v],-sign],[x[k][e],M]],-Infinity,M);
    }
    graph.points.forEach((p,v)=>{const ins=[],outs=[],fi=[],fo=[];for(const e of graph.incident[v]){const d=graph.edges[e].u===v?0:1;outs.push(z[k][e][d]);ins.push(z[k][e][1-d]);if(!pathSteps){fo.push(flow[k][e][d]);fi.push(flow[k][e][1-d]);}}const ones=a=>a.map(j=>[j,1]);if(sources.has(v)){m.row(ones(ins),0,0);m.row(ones(outs),1,1);}else if(sinks.has(v)){m.row(ones(ins),1,1);m.row(ones(outs),0,0);}else if(Math.min(...p)<1e-5||Math.max(...p)>w-1e-5)m.row(ones([...ins,...outs]),0,0);else{m.row([...ones(ins),...outs.map(j=>[j,-1])],0,0);m.row(ones(ins),-Infinity,1);}if(!pathSteps&&!sources.has(v))m.row([...ones(fi),...fo.map(j=>[j,-1]),...ins.map(j=>[j,-1])],0,0);});
  }
  graph.edges.forEach((edge,e)=>m.row([[x[0][e],1],[x[1][e],edge.visible?1:-1]],edge.visible?1:0,edge.visible?1:0));
  if(graph.transpose)graph.transpose.forEach((j,e)=>m.row([[x[0][e],1],[x[1][j],-1]],0,0));
  let turns=0,crossings=0,widthPairs=0;graph.incident.forEach((incident,v)=>{if(Math.min(...graph.points[v])<1e-5||Math.max(...graph.points[v])>w-1e-5)return;const turnCosts=[0,1].map(()=>m.variable({cost:1,hi:Infinity}));turns+=2;for(let i=0;i<incident.length;i++)for(let j=i+1;j<incident.length;j++){const a=incident[i],b=incident[j],ea=graph.edges[a],eb=graph.edges[b],ta=ea.u===v?ea.curve.tangent(0):mul(ea.curve.tangent(1),-1),tb=eb.u===v?eb.curve.tangent(0):mul(eb.curve.tangent(1),-1),theta=angle(mul(ta,-1),tb),cost=cfg.turnPenalty*(theta/90)**2+cfg.sharpPenalty*Number(theta>cfg.sharpTurn)+cfg.acutePenalty*(Math.max(0,theta-100)/25)**2;for(const k of[0,1])if(theta>cfg.maxTurn)m.row([[x[k][a],1],[x[k][b],1]],-Infinity,1);else if(cost>1e-10){constrainTurnCost(m,turnCosts[k],x[k][a],x[k][b],cost);}}});
  for(const[a,b]of nearbyPairs(lines,cfg.nominalWidth+2*tol)){const ea=graph.edges[a],eb=graph.edges[b],shared=[ea.u,ea.v].filter(v=>v===eb.u||v===eb.v),improper=improperIntersection(lines[a],lines[b],shared.map(v=>graph.points[v]),3*tol);if(improper){for(const k of[0,1])m.row([[x[k][a],1],[x[k][b],1]],-Infinity,1);crossings++;}else if(!shared.length&&lineDistance(lines[a],lines[b],cfg.nominalWidth+2*tol)<cfg.nominalWidth+2*tol){for(const k of[0,1]){const M=Math.max(1,endpoints[k].sources.length);for(const sign of[-1,1])m.row([[labels[k][ea.u],sign],[labels[k][eb.u],-sign],[x[k][a],M],[x[k][b],M]],-Infinity,2*M);}widthPairs++;}}
  if(m.cost.length>80000||m.rows.length>200000)throw new Error('MILP exceeds the browser memory guard. Reduce image detail or connector candidates.');onProgress({stage:'model',variables:m.cost.length,constraints:m.rows.length});return{m,x,z,order,endpoints,metadata:{connectivity,binaryVariables:m.integer.reduce((a,b)=>a+b,0),continuousVariables:m.integer.filter(x=>!x).length,linearConstraints:m.rows.length,turnAuxiliaries:turns,crossingConflicts:crossings,widthPairs}};
}
function extract(graph,x,z,values,endpoints){return[0,1].map(k=>{const next=new Map(),chosen=new Set();graph.edges.forEach((edge,e)=>{if(values[x[k][e]]>.5){const fw=values[z[k][e][0]]>.5,a=fw?edge.u:edge.v,b=fw?edge.v:edge.u;if(next.has(a))throw new Error('MILP produced a branching path.');next.set(a,{b,e,fw});chosen.add(e);}});const seen=new Set(),paths=[];for(const source of endpoints[k].sources){const path=[],visited=new Set();let v=source;while(next.has(v)){if(visited.has(v))throw new Error('MILP produced a cycle.');visited.add(v);const{b,e,fw}=next.get(v);path.push([e,fw]);seen.add(e);v=b;}if(!endpoints[k].sinks.includes(v))throw new Error('A slit does not reach the opposite border.');paths.push(path);}if(seen.size!==chosen.size)throw new Error('Detached cut loop in the MILP solution.');return paths;});}
export async function solveGraph(graph,cfg,{onProgress=()=>{},coreGate=null,coefficientQuantum=0,stopAfterValidated=false,relaxationOnly=false,onRejectedCandidate=null,connectivity='commodity-flow'}={}){
  onProgress=progressReporter(onProgress,cfg.progressGeometry);
  const start=performance.now(),highs=await solverRuntime(),form=formulate(graph,cfg,{onProgress,connectivity}),{m,x,z,endpoints}=form;let native=null,best=null,bestObj=Infinity,lower=-Infinity,rejectionObserverStopped=false;const history=[],nogoods=new Set();
  if(!graph.edges.length){const sol={graph,paths:[[],[]],report:{status:'uniform',physicalAssemblyTested:false}};sol.report.validation=validate(sol,cfg);return sol;}
  // Sub-ulp curve arithmetic differs across JavaScript engines. For recovery,
  // normalize the linear model below its validation tolerance before search.
  // The original Bézier geometry is retained for all geometric checks.
  if(coefficientQuantum)m.canonicalize(coefficientQuantum);
  // An LP can already choose integral paths. Relax only the native copy: the
  // original model keeps every binary requirement for independent residual
  // checking. Fractional answers are never rounded into candidate templates.
  const data=m.data();if(relaxationOnly)data.integrality.fill(0);
  try{native=highs.createModel(data);native.options.set({output_flag:false,time_limit:cfg.timeLimit,mip_rel_gap:cfg.relativeGap,random_seed:cfg.seed%2147483647});
    const append=(terms,lo=-Infinity,hi=Infinity)=>{const row=m.row(terms,lo,hi);native.addRow(lo,hi,{indices:row.entries.map(([j])=>j),values:row.entries.map(([,v])=>v)});};
    for(let round=0;round<cfg.maxRounds;round++){const remaining=cfg.timeLimit-(performance.now()-start)/1000;if(remaining<=0)break;onProgress({stage:'solving',round:round+1,remaining,validatedIncumbent:!!best},best);native.options.set({time_limit:remaining,mip_max_improving_sols:best?2147483647:1});let last=0;
      // HiGHS applies time_limit to cumulative native run time on this model.
      // `remaining` already subtracts all earlier search and validation work,
      // so reset only its clocks before giving this round that reduced budget.
      // Retain the model, exclusions, incumbent and outer wall-clock deadline.
      native.raw.zeroAllClocks();
      const roundStarted=performance.now();
      const result=native.run({[highs.constants.callbackType.mipLogging](event){const now=performance.now();if(now-last>500){last=now;onProgress({stage:'solving',round:round+1,nodes:Number(event.data.mip_node_count||0),gap:Number.isFinite(event.data.mip_gap)?event.data.mip_gap:null,...(cfg.progressGeometry&&best?{validatedIncumbent:true}:{})},best);}}});
      // Record native search separately from model construction and subsequent
      // validation/repair. A total timeout alone cannot explain late candidates.
      const roundFinished=performance.now(),status=result.modelStatus,info={round:round+1,status,budgetSeconds:remaining,solveSeconds:(roundFinished-roundStarted)/1000,elapsedSeconds:(roundFinished-start)/1000};history.push(info);const bound=relaxationOnly?(status===highs.constants.modelStatus.optimal?native.getObjectiveValue():-Infinity):native.info.get('mip_dual_bound');if(Number.isFinite(bound))lower=Math.max(lower,bound);
      if(native.info.get('primal_solution_status')!==highs.constants.solutionStatus.feasible){if(status===highs.constants.modelStatus.infeasible)break;continue;}
      const values=native.getSolution().colValue,residual=m.residual(values);
      if(relaxationOnly){info.relaxationResidual=residual;if(residual>2e-5)break;}
      else if(residual>2e-5)throw new Error(`MILP result fails independent integrality/row checks (${residual}).`);
      const candidate={graph,paths:extract(graph,x,z,values,endpoints),report:{}},obj=native.getObjectiveValue(),shortReturns=completeSelfReturns(candidate,cfg),necks=[...selfNecks(candidate,cfg),...shortReturns];info.objective=obj;info.selfNeckChains=necks.length;info.shortReturnChains=shortReturns.length;onProgress({stage:'validating',round:round+1});
      // This private observer sees rejected geometry only. It cannot certify a
      // MILP solution or publish an incumbent. Returning true stops with an
      // explicit failure; a caller's separately repaired pair needs its own
      // source-image and physical checks, without this model's objective bound.
      if(necks.length){
        if(!best&&onRejectedCandidate&&await onRejectedCandidate(candidate,{round:round+1,reason:'self_clearance',elapsedSeconds:(performance.now()-start)/1000,remainingSeconds:cfg.timeLimit-(performance.now()-start)/1000})===true){rejectionObserverStopped=true;break;}
        for(const issue of necks){const chain=[...new Set(issue.edgeChain)],key=`${issue.family}:${chain.sort((a,b)=>a-b).join(',')}`;if(nogoods.has(key))continue;nogoods.add(key);append(chain.map(e=>[x[issue.family][e],1]),-Infinity,chain.length-1);}continue;
      }
      const check=validate(candidate,cfg,{checkSelfNecks:false});if(check.passed&&coreGate){const core=coreGate(candidate);info.materialCore=core.summary;check.materialCore=core.summary;if(!core.passed){check.passed=false;check.issues.push({type:'material_core',summary:core.summary});}}
      info.validationPassed=check.passed;if(check.passed){if(obj<bestObj){best=candidate;bestObj=obj;best.report.validation=check;append(m.cost.map((c,j)=>[j,c]).filter(([,c])=>c),-Infinity,obj+1e-6);}// Adding the objective row invalidates native.info (including mip_gap). Use the captured bound.
      if(cfg.progressGeometry||hasCandidateObserver(onProgress))onProgress({stage:'solving',round:round+1,validatedIncumbent:true,gap:Number.isFinite(lower)?objectiveGap(bestObj,lower):null},best);
      if(stopAfterValidated||status===highs.constants.modelStatus.optimal||objectiveGap(bestObj,lower)<=cfg.relativeGap+1e-9)break;}
      else{
        info.issues=check.issues.slice(0,8);
        // Reject the offending chain, not just this entire template pair.
        // Otherwise equivalent choices on unrelated slits can repeatedly
        // present the same local crossing until the routing budget expires.
        let added=0;
        for(const issue of selfIntersectionChains(candidate,cfg,check.issues)){
          const chain=issue.directedChain,key=`crossing:${issue.family}:${chain.map(([edge,forward])=>`${edge}/${Number(forward)}`).sort().join(',')}`;
          if(nogoods.has(key))continue;
          // Keep direction: reversed adaptive flattening and inexact joins can
          // differ. The opposite traversal must be validated on its own.
          nogoods.add(key);append(chain.map(([edge,forward])=>[z[issue.family][edge][forward?0:1],1]),-Infinity,chain.length-1);added++;
        }
        info.selfIntersectionChains=added;
        if(!added){const active=[];for(const k of[0,1])for(let e=0;e<graph.edges.length;e++)if(values[x[k][e]]>.5)active.push([x[k][e],1]);append(active,-Infinity,active.length-1);}
      }
    }
  }finally{native?.dispose();}
  const report={...form.metadata,coefficientQuantum,stopAfterValidated,...(relaxationOnly?{relaxationOnly:true,relaxationBound:Number.isFinite(lower)?lower:null}:{}),graph:graph.metadata,history,elapsedSeconds:(performance.now()-start)/1000,solverVersion:highs.version,solverRuntime:'locally hosted HiGHS WebAssembly',physicalAssemblyTested:false};
  if(!best){const error=new Error('No validated template pair was found within this candidate graph and time budget. Increase the budget or simplify the artwork; this does not prove the design impossible.');error.report={...report,status:'no_validated_solution',termination:rejectionObserverStopped?'rejected_candidate_observer':history.some(h=>h.relaxationResidual>2e-5)?'relaxation_residual':history.some(h=>h.status===highs.constants.modelStatus.timeLimit)||report.elapsedSeconds>=cfg.timeLimit?'time_limit':history.at(-1)?.status===highs.constants.modelStatus.infeasible?'candidate_graph_exhausted':'round_limit'};throw error;}
  best.report={...best.report,...report,status:'solved',objective:bestObj,lowerBound:Number.isFinite(lower)?lower:null,mipGap:Number.isFinite(lower)?objectiveGap(bestObj,lower):null,optimality:'Only the finite candidate graph is optimized. Gap concerns cut complexity, not artwork fidelity.'};return best;
}
