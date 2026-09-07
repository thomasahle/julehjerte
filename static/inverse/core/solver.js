/** Two-sheet binary MILP, translated from the Python commodity-flow model.
 * Connectivity and continuous slit labels allow nonmonotone hooked paths.
 * HiGHS is an unmodified, locally vendored WebAssembly dependency. */
import loadHighs from '../vendor/highs.mjs';
import {dot,mul,angle} from './bezier.js';
import {boundaryEndpoints} from './graph.js';
import {nearbyPairs,lineDistance,improperIntersection} from './geometry.js';
import {validate,selfNecks} from './validate.js';
let runtimePromise;
export async function solverRuntime(){return runtimePromise??=loadHighs({locateFile:file=>new URL('../vendor/'+file,import.meta.url).href,print:()=>{},printErr:()=>{}});}
export class LinearModel{
  constructor(){this.cost=[];this.lb=[];this.ub=[];this.integer=[];this.rows=[];}
  variable({cost=0,lo=0,hi=1,binary=false}={}){const i=this.cost.length;this.cost.push(cost);this.lb.push(lo);this.ub.push(hi);this.integer.push(binary?1:0);return i;}
  row(terms,lo=-Infinity,hi=Infinity){const values=new Map();for(const[j,c]of terms)if(c)values.set(j,(values.get(j)||0)+c);const entries=[...values].filter(([,c])=>Math.abs(c)>1e-14).sort((a,b)=>a[0]-b[0]);this.rows.push({entries,lo,hi});return this.rows.at(-1);}
  data(){const starts=[0],indices=[],values=[];for(const r of this.rows){for(const[j,c]of r.entries){indices.push(j);values.push(c);}starts.push(indices.length);}return{numCols:this.cost.length,numRows:this.rows.length,colCost:Float64Array.from(this.cost),colLower:Float64Array.from(this.lb),colUpper:Float64Array.from(this.ub),integrality:Int32Array.from(this.integer),rowLower:Float64Array.from(this.rows.map(r=>r.lo)),rowUpper:Float64Array.from(this.rows.map(r=>r.hi)),matrix:{format:'csr',numCols:this.cost.length,numRows:this.rows.length,starts:Int32Array.from(starts),indices:Int32Array.from(indices),values:Float64Array.from(values)}};}
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
export function formulate(graph,cfg,{onProgress=()=>{}}={}){
  const E=graph.edges.length,V=graph.points.length,w=graph.target.width,tol=cfg.geometryTolerance,endpoints=boundaryEndpoints(graph),m=new LinearModel(),x=[[],[]],z=[[],[]],flow=[[],[]],labels=[[],[]],lines=graph.edges.map(e=>e.curve.flatten(tol));
  const balance=graph.edges.map(edge=>{if(edge.visible)return 0;const on=p=>graph.guides?.some(g=>Math.abs(dot(p,g.normal)-g.offset)<2*tol),aligned=graph.guides?.some(g=>edge.curve.p.every(p=>Math.abs(dot(p,g.normal)-g.offset)<2*tol));let gridCost=(on(edge.curve.p[0])||on(edge.curve.p[3]))&&!aligned?cfg.gridPreference/2:0;let sum=0;for(const v of [edge.u,edge.v]){if(on(graph.points[v]))continue;const visible=graph.incident[v].filter(e=>graph.edges[e].visible);if(visible.length!==2)continue;const h=edge.u===v?edge.curve.tangent(0):mul(edge.curve.tangent(1),-1),angles=visible.map(e=>{const c=graph.edges[e];return angle(h,c.u===v?c.curve.tangent(0):mul(c.curve.tangent(1),-1));});sum+=((angles[0]-angles[1])/90)**2;}return gridCost+cfg.junctionBalancePenalty*sum/2;});
  for(const k of[0,1]){const K=endpoints[k].sources.length,M=Math.max(1,K),sources=new Set(endpoints[k].sources),sinks=new Set(endpoints[k].sinks);
    for(let v=0;v<V;v++)labels[k][v]=m.variable({hi:Math.max(0,K-1)});for(const verts of[endpoints[k].sources,endpoints[k].sinks])verts.forEach((v,i)=>{m.lb[labels[k][v]]=i;m.ub[labels[k][v]]=i;});
    for(let e=0;e<E;e++){const edge=graph.edges[e],c=edge.curve,cost=balance[e]+c.length()+cfg.bendingPenalty*Math.min(c.bending(),1e4)+(edge.visible?0:cfg.connectorPenalty/2),axis=k===0?0:1,side=Math.min(...c.p.map(p=>Math.min(p[axis],w-p[axis])));x[k][e]=m.variable({cost,binary:true,hi:K>0&&side>=cfg.nominalWidth?1:0});z[k][e]=[];flow[k][e]=[];
      for(const d of[0,1]){z[k][e][d]=m.variable({binary:true});flow[k][e][d]=m.variable({hi:Math.max(1,V)});m.row([[flow[k][e][d],1],[z[k][e][d],-Math.max(1,V)]],-Infinity,0);}m.row([[z[k][e][0],1],[z[k][e][1],1],[x[k][e],-1]],0,0);
      for(const sign of[-1,1])m.row([[labels[k][edge.u],sign],[labels[k][edge.v],-sign],[x[k][e],M]],-Infinity,M);
    }
    graph.points.forEach((p,v)=>{const ins=[],outs=[],fi=[],fo=[];for(const e of graph.incident[v]){const d=graph.edges[e].u===v?0:1;outs.push(z[k][e][d]);ins.push(z[k][e][1-d]);fo.push(flow[k][e][d]);fi.push(flow[k][e][1-d]);}const ones=a=>a.map(j=>[j,1]);if(sources.has(v)){m.row(ones(ins),0,0);m.row(ones(outs),1,1);}else if(sinks.has(v)){m.row(ones(ins),1,1);m.row(ones(outs),0,0);}else if(Math.min(...p)<1e-5||Math.max(...p)>w-1e-5)m.row(ones([...ins,...outs]),0,0);else{m.row([...ones(ins),...outs.map(j=>[j,-1])],0,0);m.row(ones(ins),-Infinity,1);}if(!sources.has(v))m.row([...ones(fi),...fo.map(j=>[j,-1]),...ins.map(j=>[j,-1])],0,0);});
  }
  graph.edges.forEach((edge,e)=>m.row([[x[0][e],1],[x[1][e],edge.visible?1:-1]],edge.visible?1:0,edge.visible?1:0));
  if(graph.transpose)graph.transpose.forEach((j,e)=>m.row([[x[0][e],1],[x[1][j],-1]],0,0));
  let turns=0,crossings=0,widthPairs=0;graph.incident.forEach((incident,v)=>{if(Math.min(...graph.points[v])<1e-5||Math.max(...graph.points[v])>w-1e-5)return;const turnCosts=[0,1].map(()=>m.variable({cost:1,hi:Infinity}));turns+=2;for(let i=0;i<incident.length;i++)for(let j=i+1;j<incident.length;j++){const a=incident[i],b=incident[j],ea=graph.edges[a],eb=graph.edges[b],ta=ea.u===v?ea.curve.tangent(0):mul(ea.curve.tangent(1),-1),tb=eb.u===v?eb.curve.tangent(0):mul(eb.curve.tangent(1),-1),theta=angle(mul(ta,-1),tb),cost=cfg.turnPenalty*(theta/90)**2+cfg.sharpPenalty*Number(theta>cfg.sharpTurn)+cfg.acutePenalty*(Math.max(0,theta-100)/25)**2;for(const k of[0,1])if(theta>cfg.maxTurn)m.row([[x[k][a],1],[x[k][b],1]],-Infinity,1);else if(cost>1e-10){constrainTurnCost(m,turnCosts[k],x[k][a],x[k][b],cost);}}});
  for(const[a,b]of nearbyPairs(lines,cfg.nominalWidth+2*tol)){const ea=graph.edges[a],eb=graph.edges[b],shared=[ea.u,ea.v].filter(v=>v===eb.u||v===eb.v),improper=improperIntersection(lines[a],lines[b],shared.map(v=>graph.points[v]),3*tol);if(improper){for(const k of[0,1])m.row([[x[k][a],1],[x[k][b],1]],-Infinity,1);crossings++;}else if(!shared.length&&lineDistance(lines[a],lines[b],cfg.nominalWidth+2*tol)<cfg.nominalWidth+2*tol){for(const k of[0,1]){const M=Math.max(1,endpoints[k].sources.length);for(const sign of[-1,1])m.row([[labels[k][ea.u],sign],[labels[k][eb.u],-sign],[x[k][a],M],[x[k][b],M]],-Infinity,2*M);}widthPairs++;}}
  if(m.cost.length>80000||m.rows.length>200000)throw new Error('MILP exceeds the browser memory guard. Reduce image detail or connector candidates.');onProgress({stage:'model',variables:m.cost.length,constraints:m.rows.length});return{m,x,z,endpoints,metadata:{binaryVariables:m.integer.reduce((a,b)=>a+b,0),continuousVariables:m.integer.filter(x=>!x).length,linearConstraints:m.rows.length,turnAuxiliaries:turns,crossingConflicts:crossings,widthPairs}};
}
function extract(graph,x,z,values,endpoints){return[0,1].map(k=>{const next=new Map(),chosen=new Set();graph.edges.forEach((edge,e)=>{if(values[x[k][e]]>.5){const fw=values[z[k][e][0]]>.5,a=fw?edge.u:edge.v,b=fw?edge.v:edge.u;if(next.has(a))throw new Error('MILP produced a branching path.');next.set(a,{b,e,fw});chosen.add(e);}});const seen=new Set(),paths=[];for(const source of endpoints[k].sources){const path=[],visited=new Set();let v=source;while(next.has(v)){if(visited.has(v))throw new Error('MILP produced a cycle.');visited.add(v);const{b,e,fw}=next.get(v);path.push([e,fw]);seen.add(e);v=b;}if(!endpoints[k].sinks.includes(v))throw new Error('A slit does not reach the opposite border.');paths.push(path);}if(seen.size!==chosen.size)throw new Error('Detached cut loop in the MILP solution.');return paths;});}
export async function solveGraph(graph,cfg,{onProgress=()=>{},coreGate=null}={}){
  const start=performance.now(),highs=await solverRuntime(),form=formulate(graph,cfg,{onProgress}),{m,x,z,endpoints}=form;let native=null,best=null,bestObj=Infinity,lower=-Infinity;const history=[],nogoods=new Set();
  if(!graph.edges.length){const sol={graph,paths:[[],[]],report:{status:'uniform',physicalAssemblyTested:false}};sol.report.validation=validate(sol,cfg);return sol;}
  try{native=highs.createModel(m.data());native.options.set({output_flag:false,time_limit:cfg.timeLimit,mip_rel_gap:cfg.relativeGap,random_seed:cfg.seed%2147483647});
    const append=(terms,lo=-Infinity,hi=Infinity)=>{const row=m.row(terms,lo,hi);native.addRow(lo,hi,{indices:row.entries.map(([j])=>j),values:row.entries.map(([,v])=>v)});};
    for(let round=0;round<cfg.maxRounds;round++){const remaining=cfg.timeLimit-(performance.now()-start)/1000;if(remaining<=0)break;onProgress({stage:'solving',round:round+1,remaining,validatedIncumbent:!!best});native.options.set({time_limit:remaining,mip_max_improving_sols:best?2147483647:1});let last=0;
      const result=native.run({[highs.constants.callbackType.mipLogging](event){const now=performance.now();if(now-last>500){last=now;onProgress({stage:'solving',round:round+1,nodes:Number(event.data.mip_node_count||0),gap:Number.isFinite(event.data.mip_gap)?event.data.mip_gap:null});}}});
      const status=result.modelStatus,info={round:round+1,status};history.push(info);const bound=native.info.get('mip_dual_bound');if(Number.isFinite(bound))lower=Math.max(lower,bound);
      if(native.info.get('primal_solution_status')!==highs.constants.solutionStatus.feasible){if(status===highs.constants.modelStatus.infeasible)break;continue;}
      const values=native.getSolution().colValue,residual=m.residual(values);if(residual>2e-5)throw new Error(`MILP result fails independent integrality/row checks (${residual}).`);
      const candidate={graph,paths:extract(graph,x,z,values,endpoints),report:{}},obj=native.getObjectiveValue(),necks=selfNecks(candidate,cfg);info.objective=obj;info.selfNeckChains=necks.length;onProgress({stage:'validating',round:round+1});
      if(necks.length){for(const issue of necks){const chain=[...new Set(issue.edgeChain)],key=`${issue.family}:${chain.sort((a,b)=>a-b).join(',')}`;if(nogoods.has(key))continue;nogoods.add(key);append(chain.map(e=>[x[issue.family][e],1]),-Infinity,chain.length-1);}continue;}
      const check=validate(candidate,cfg,{checkSelfNecks:false});if(check.passed&&coreGate){const core=coreGate(candidate);info.materialCore=core.summary;check.materialCore=core.summary;if(!core.passed){check.passed=false;check.issues.push({type:'material_core',summary:core.summary});}}
      info.validationPassed=check.passed;if(check.passed){if(obj<bestObj){best=candidate;bestObj=obj;best.report.validation=check;append(m.cost.map((c,j)=>[j,c]).filter(([,c])=>c),-Infinity,obj+1e-6);}// Adding the objective row invalidates native.info (including mip_gap). Use the captured bound.
      if(status===highs.constants.modelStatus.optimal||objectiveGap(bestObj,lower)<=cfg.relativeGap+1e-9)break;}
      else{info.issues=check.issues.slice(0,8);const active=[];for(const k of[0,1])for(let e=0;e<graph.edges.length;e++)if(values[x[k][e]]>.5)active.push([x[k][e],1]);append(active,-Infinity,active.length-1);}
    }
  }finally{native?.dispose();}
  const report={...form.metadata,graph:graph.metadata,history,elapsedSeconds:(performance.now()-start)/1000,solverVersion:highs.version,solverRuntime:'locally hosted HiGHS WebAssembly',physicalAssemblyTested:false};
  if(!best){const error=new Error('No validated template pair was found within this candidate graph and time budget. Increase the budget or simplify the artwork; this does not prove the design impossible.');error.report={...report,status:'no_validated_solution',termination:history.some(h=>h.status===highs.constants.modelStatus.timeLimit)||report.elapsedSeconds>=cfg.timeLimit?'time_limit':history.at(-1)?.status===highs.constants.modelStatus.infeasible?'candidate_graph_exhausted':'round_limit'};throw error;}
  best.report={...best.report,...report,status:'solved',objective:bestObj,lowerBound:Number.isFinite(lower)?lower:null,mipGap:Number.isFinite(lower)?objectiveGap(bestObj,lower):null,optimality:'Only the finite candidate graph is optimized. Gap concerns cut complexity, not artwork fidelity.'};return best;
}
