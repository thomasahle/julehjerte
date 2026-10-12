/** Evaluation only: expose known paths to measure graph-proposal headroom.
 * Never import this module into preparation, fitting or a browser worker.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {referenceEnvironment} from '../reference.mjs';
import {renderExportedWeave} from '../export-renderer.mjs';
import {Cubic,sub,add,dot,distance,segmentDistance} from '../../../static/inverse/core/bezier.js';
import {keyPoint,improperIntersection,lineDistance,bbox,boxDistance} from '../../../static/inverse/core/geometry.js';
import {buildGraph,reindex,curvesOf,solutionJSON,loadSolutionJSON,inspectBoundaryEndpoints,visibleEndpointNeighborhoods} from '../../../static/inverse/core/graph.js';
import {CurveGraph} from '../../../static/inverse/core/direct/curves.js';
import {curveKey} from '../../../static/inverse/core/symmetry.js';
import {preprocessMask} from '../../../static/inverse/core/input.js';
import {solveGraph,solverRuntime} from '../../../static/inverse/core/solver.js';
import {validate} from '../../../static/inverse/core/validate.js';
import {materialAudit} from '../../../static/inverse/core/material.js';
import {settings} from '../../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET,SIMPLIFIED_PREPROCESSING} from '../../../static/inverse/core/presets.js';

/** Canonicalize only exact straight loci. Split at existing reference anchors
 * so different line parameterizations/subdivisions can share the same edge.
 * Curves and almost-coincident lines are deliberately not snapped together.
 */
export function canonicalReferenceLines(paths){
  const endpoints=paths.flat(2).flatMap(p=>[p[0],p[3]]);
  return paths.map(family=>family.map(path=>path.flatMap(p=>{
    const a=p[0],b=p[3],d=sub(b,a),length2=dot(d,d);
    if(length2<1e-16||p.some(q=>segmentDistance(q,a,b)>1e-8))return[p.map(q=>[...q])];
    const cuts=[{t:0,p:a},{t:1,p:b}];
    for(const q of endpoints){
      const t=dot(sub(q,a),d)/length2;
      if(t>1e-8&&t<1-1e-8&&segmentDistance(q,a,b)<1e-8)cuts.push({t,p:q});
    }
    cuts.sort((a,b)=>a.t-b.t);
    const unique=cuts.filter((q,i)=>!i||distance(q.p,cuts[i-1].p)>1e-7);
    return unique.slice(1).map((q,i)=>Cubic.line(unique[i].p,q.p).p);
  })));
}

function copyGraph(graph,edges=graph.edges){
  const copied=edges.map(e=>({curve:new Cubic(e.curve.p),visible:e.visible}));
  const target={...graph.target,curves:copied.filter(e=>e.visible).map(e=>e.curve),metadata:structuredClone(graph.target.metadata)};
  const result=reindex({target,edges:copied,guides:structuredClone(graph.guides||[]),metadata:{...graph.metadata}});
  Object.assign(result.metadata,{visibleEdges:copied.filter(e=>e.visible).length,hiddenCandidates:copied.filter(e=>!e.visible).length,vertices:result.points.length});
  return result;
}

/** Embed the known paths in a proposed graph. Failure is a representation
 * failure, not evidence that the MILP needs more search time.
 */
export function referenceWitness(reference,graph){
  const lookup=new Map(graph.edges.map((e,i)=>[`${Number(e.visible)}:${curveKey(e.curve.p)}`,i]));
  const paths=reference.paths.map(f=>f.map(p=>p.map(([old,forward])=>{
    const original=reference.graph.edges[old],index=lookup.get(`${Number(original.visible)}:${curveKey(original.curve.p)}`);
    if(index===undefined)throw new Error(`Reference edge ${old} is absent from the proposed graph.`);
    const sameDirection=distance(original.curve.p[0],graph.edges[index].curve.p[0])<1e-6;
    return[index,sameDirection?forward:!forward];
  })));
  return{graph,paths,report:{oracleWitness:true}};
}

/** Explain the one-straight-connector pool used by this experiment. This
 * diagnoses exclusion of a reference edge, not absence of every valid route.
 */
export function explainMissingConnectors(reference,graph,cfg){
  if(cfg.connectorVariants!==1||cfg.gridPortals)throw new Error('This diagnostic requires the sparse straight-connector pool.');
  const visible=graph.edges.map((e,i)=>e.visible?i:-1).filter(i=>i>=0),keys=new Set(graph.edges.map(e=>curveKey(e.curve.p)));
  const endpointEdges=visibleEndpointNeighborhoods(graph,2*cfg.geometryTolerance);
  const degree=v=>graph.incident[v].filter(e=>graph.edges[e].visible).length;
  const eligible=graph.points.flatMap((p,v)=>degree(v)===2&&Math.min(...p)>1e-6&&Math.max(...p)<graph.target.width-1e-6?[v]:[]);
  return reference.graph.edges.flatMap((edge,index)=>{
    if(edge.visible||keys.has(curveKey(edge.curve.p)))return[];
    const ends=[edge.curve.p[0],edge.curve.p[3]],vertices=ends.map(p=>graph.points.findIndex(q=>keyPoint(p)===keyPoint(q)));
    const ranks=vertices.map((v,k)=>v<0?null:eligible.filter(other=>other!==v).sort((a,b)=>distance(graph.points[v],graph.points[a])-distance(graph.points[v],graph.points[b])).indexOf(vertices[1-k])+1);
    const row={referenceEdge:index,controlPoints:edge.curve.p,lengthMm:edge.curve.length(),vertices,eligible:vertices.map(v=>eligible.includes(v)),nearestRanks:ranks};
    if(vertices.some(v=>v<0)){row.reason='missing_vertex';return[row];}
    if(row.eligible.some(v=>!v)){row.reason='ineligible_vertex';return[row];}
    const [u,v]=vertices,a=graph.points[u],b=graph.points[v],candidate=Cubic.line(a,b);
    if(visible.some(i=>{const e=graph.edges[i];return e.u===u&&e.v===v||e.u===v&&e.v===u;})){row.reason='visible_pair_already_present';return[row];}
    if(!ranks.some(r=>r>0&&r<=cfg.neighbors)){row.reason='outside_neighbor_budget';return[row];}
    if(distance(a,b)<5*cfg.geometryTolerance){row.reason='short_connector';return[row];}
    if(curveKey(candidate.p)!==curveKey(edge.curve.p)){row.reason='different_connector_geometry';return[row];}
    const line=candidate.flatten(cfg.geometryTolerance),box=bbox(line),radius=2*cfg.geometryTolerance;
    row.blockers=visible.flatMap(i=>{
      const e=graph.edges[i],other=e.curve.flatten(cfg.geometryTolerance);
      if(boxDistance(box,bbox(other))>radius)return[];
      const crossing=improperIntersection(line,other,[a,b],radius);
      const nonincidentClearance=!endpointEdges[u].has(i)&&!endpointEdges[v].has(i)&&lineDistance(line,other,radius)<=radius;
      return crossing||nonincidentClearance?[{visibleEdge:i,crossing,nonincidentClearance,nearestEndpointMm:Math.min(...[a,b].flatMap(p=>[e.curve.p[0],e.curve.p[3]].map(q=>distance(p,q))))}]:[];
    });
    row.reason=row.blockers.length?'clearance_rejection':'unexplained';return[row];
  });
}

/** Hold exact visible geometry and its reference subdivision fixed. This is
 * explicitly a boundary/vertex oracle, not a blind image reconstruction.
 * No sheet ownership is passed to solveGraph in any of these variants.
 */
export function oracleGraphVariants(reference,cfg){
  const target=copyGraph(reference.graph).target;
  const heuristic=buildGraph(target,cfg,{node:false}),augmented=copyGraph(heuristic);
  // buildGraph merges endpoints at its established five-decimal vertex key.
  // Apply that same bounded normalization to the known witness's hidden ends;
  // otherwise tiny endpoint shifts can look like a missing visible edge. Record
  // the movement and validate the resulting witness before any solve.
  const vertices=new Map(heuristic.points.map(p=>[keyPoint(p,5),p])),known=copyGraph(reference.graph);
  let maximumNormalizationMm=0;
  for(const edge of known.edges){
    const p=edge.curve.p.map(q=>[...q]),a=vertices.get(keyPoint(p[0],5))||p[0],b=vertices.get(keyPoint(p[3],5))||p[3],d0=sub(a,p[0]),d1=sub(b,p[3]);
    maximumNormalizationMm=Math.max(maximumNormalizationMm,distance(a,p[0]),distance(b,p[3]));
    edge.curve=new Cubic([a,add(p[1],d0),add(p[2],d1),b]);
  }
  if(maximumNormalizationMm>Math.SQRT2*1e-5)throw new Error('Reference normalization exceeds the graph vertex key.');
  const normalized={...reference,graph:copyGraph(known)};
  const lookup=new Set(augmented.edges.map(e=>curveKey(e.curve.p))),needed=new Set();
  let added=0;
  for(const edge of normalized.graph.edges)if(!edge.visible){
    const key=curveKey(edge.curve.p);needed.add(key);
    if(!lookup.has(key)){augmented.edges.push({curve:new Cubic(edge.curve.p),visible:false});lookup.add(key);added++;}
  }
  const completed=copyGraph(augmented),compact=copyGraph(completed,completed.edges.filter(e=>e.visible||needed.has(curveKey(e.curve.p))));
  return[
    {name:'exact-boundary-heuristic',graph:heuristic,oracle:'Visible boundary geometry and reference subdivision only'},
    {name:'exact-boundary-plus-connectors',graph:completed,witness:referenceWitness(normalized,completed),maximumNormalizationMm,addedConnectors:added,oracle:'Exact visible boundaries/subdivision and known hidden connectors; heuristic decoys retained'},
    {name:'exact-boundary-compact',graph:compact,witness:referenceWitness(normalized,compact),maximumNormalizationMm,addedConnectors:added,oracle:'Exact visible boundaries/subdivision and only known hidden connectors'},
  ];
}

export async function runGraphOracle({ids,output,seconds=3,repeats=1}){
  if(!Number.isFinite(seconds)||seconds<.1||seconds>180||!Number.isInteger(repeats)||repeats<1)throw new Error('Use a positive bounded time limit and integer repeat count.');
  const raw={...AUTOMATIC_PRESET,...SIMPLIFIED_PREPROCESSING,algorithm:'trace',neighbors:8,connectorVariants:1,timeLimit:seconds,trials:0},cfg=settings(raw);
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sourceHashes={};
  for(const file of ['scripts/inverse/experiments/graph-oracle.mjs','scripts/inverse/reference.mjs','scripts/inverse/export-renderer.mjs','static/inverse/core/input.js','static/inverse/core/graph.js','static/inverse/core/geometry.js','static/inverse/core/solver.js','static/inverse/core/validate.js','static/inverse/core/material.js','static/inverse/core/direct/curves.js'])sourceHashes[file]=hash(await fs.readFile(file));
  const ledger={purpose:'Oracle headroom experiment, not a reconstruction benchmark or trained model.',settings:raw,sourceHashes,repeats,criteria:{referenceImportError:.001,exportedImageError:.01,unchangedGeometryAndPaperRules:true},solverStartupExcluded:true,results:[],limitations:['Clean square gallery renderings only; no photograph crop or colour-classification evaluation.','Oracle variants expose exact visible geometry and the reference subdivision, including anchors a photograph may not reveal.','The compact graph is restricted to one known valid routing, not all valid template pairs. Missing reference edges do not prove that another routing is unavailable.','HiGHS is still given unknown sheet ownership; independent exported rendering and the normal geometry/paper checks remain required.']};
  await fs.mkdir(output,{recursive:true});
  const save=()=>fs.writeFile(path.join(output,'results.json'),JSON.stringify(ledger,null,2)+'\n');
  const env=await referenceEnvironment();
  try{
    await solverRuntime();
    for(const id of ids){
      const row={id,variants:[]};ledger.results.push(row);
      try{
        const ref=await env.load(id,400),loaded=loadSolutionJSON(ref.cuts),paths=loaded.paths.map((f,k)=>f.map((_,i)=>curvesOf(loaded,k,i).map(c=>c.p)));
        const curves=new CurveGraph(canonicalReferenceLines(paths),100),reference=curves.solution(curves.points,ref.cuts.phase?-1:1);
        const geometry=validate(reference,cfg),paper=geometry.passed?materialAudit(reference,cfg).summary:null;
        const mask=Uint8Array.from({length:400**2},(_,i)=>Number(ref.input.rgba[4*i]<128));
        const referenceRender=await renderExportedWeave(solutionJSON(reference),400),error=m=>m.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
        row.sourceSha256=ref.sourceSha256;row.maskSha256=hash(mask);
        row.reference={counts:reference.paths.map(p=>p.length),visible:reference.graph.edges.filter(e=>e.visible).length,hidden:reference.graph.edges.filter(e=>!e.visible).length,geometry,paper,renderError:error(referenceRender.mask)};
        await fs.writeFile(path.join(output,`${id}-reference.json`),JSON.stringify(solutionJSON(reference)));
        await fs.writeFile(path.join(output,`${id}-reference.png`),referenceRender.png);
        if(!geometry.passed||paper?.status!=='pass'||row.reference.renderError>.001){row.status='reference_not_eligible';await save();continue;}
        const variants=[],started=performance.now();
        try{
          const traced=preprocessMask(mask,400,raw),raster=buildGraph(traced,cfg);
          variants.push({name:'raster-heuristic',graph:raster,oracle:false});
        }catch(e){variants.push({name:'raster-heuristic',buildError:e.message,oracle:false});}
        row.preparationSeconds={raster:(performance.now()-started)/1000};
        const oracleStart=performance.now();
        try{
          const oracles=oracleGraphVariants(reference,cfg);
          row.missingReferenceConnectors=explainMissingConnectors(oracles[1].witness,oracles[0].graph,cfg);
          variants.push(...oracles);
        }catch(e){
          row.oracleConstructionError=e.message;
          for(const name of ['exact-boundary-heuristic','exact-boundary-plus-connectors','exact-boundary-compact'])variants.push({name,buildError:e.message,oracle:true});
        }
        row.preparationSeconds.oracleGroup=(performance.now()-oracleStart)/1000;
        for(const variant of variants)if(variant.witness){
          variant.witnessValidation=validate(variant.witness,cfg);
          variant.witnessPaper=variant.witnessValidation.passed?materialAudit(variant.witness,cfg).summary:null;
        }
        for(let repeat=0;repeat<repeats;repeat++)for(let j=0;j<variants.length;j++){
          const v=variants[(j+repeat)%variants.length],result={name:v.name,repeat,oracle:v.oracle,addedConnectors:v.addedConnectors,maximumReferenceNormalizationMm:v.maximumNormalizationMm};
          row.variants.push(result);
          if(v.buildError){result.status='graph_construction_failure';result.error=v.buildError;await save();continue;}
          if(v.witness){
            result.witnessValidated=!!(v.witnessValidation.passed&&v.witnessPaper?.status==='pass');
            if(!result.witnessValidated){result.status='oracle_witness_failure';result.witnessValidation=v.witnessValidation;result.witnessPaper=v.witnessPaper;await save();continue;}
          }
          const graph=copyGraph(v.graph);result.graph=graph.metadata;
          if(v.oracle)graph.metadata.candidateMethod=v.oracle;
          result.boundaryIssue=inspectBoundaryEndpoints(graph,cfg.nominalWidth).issue;
          if(result.boundaryIssue){result.status='boundary_preflight';await save();continue;}
          const at=performance.now();
          try{
            const solution=await solveGraph(graph,cfg,{coefficientQuantum:1e-7,stopAfterValidated:true,coreGate:s=>materialAudit(s,cfg)});
            result.solveSeconds=(performance.now()-at)/1000;result.solver=solution.report;
            const exported=solutionJSON(solution),rendered=await renderExportedWeave(exported,400);
            result.referenceImageError=error(rendered.mask);result.geometry=validate(solution,cfg);result.paper=materialAudit(solution,cfg).summary;
            result.passed=result.geometry.passed&&result.paper.status==='pass'&&result.referenceImageError<=.01;
            result.status=result.passed?'validated':'image_or_geometry_failure';
            await fs.writeFile(path.join(output,`${id}-${v.name}-${repeat}.json`),JSON.stringify(exported));
            await fs.writeFile(path.join(output,`${id}-${v.name}-${repeat}.png`),rendered.png);
          }catch(e){result.solveSeconds=(performance.now()-at)/1000;result.status=e.report?.termination||'error';result.error=e.message;result.solver=e.report;}
          console.log(JSON.stringify({id,name:v.name,repeat,status:result.status,seconds:result.solveSeconds,error:result.referenceImageError,hidden:result.graph.hiddenCandidates,added:v.addedConnectors}));
          await save();
        }
        row.status=row.variants.some(v=>v.graph)?'evaluated':'evaluation_setup_failed';
        row.maskUnchanged=hash(mask)===row.maskSha256;
        if(!row.maskUnchanged)throw new Error('An oracle stage changed the reference mask.');
      }catch(e){row.status='reference_or_graph_failure';row.error=e.message;}
      await save();
    }
  }finally{await env.close();await save();}
  return ledger;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
  const ids=args.ids==='all'
    ?JSON.parse(await fs.readFile('src/lib/data/hearts.json','utf8')).categories.flatMap(c=>c.hearts)
    :args.ids?.split(',')||['classic-3x3','5star','flower','ramme','sun','circle','juletrae','amy-pattern'];
  const output=args.output||`tmp/graph-oracle-${new Date().toISOString().replace(/[:.]/g,'-')}`;
  const report=await runGraphOracle({ids,output,seconds:Number(args.seconds||3),repeats:Number(args.repeats||1)});
  console.log(JSON.stringify({output,cases:report.results.length,evaluated:report.results.filter(r=>r.status==='evaluated').length}));
  if(!report.results.some(r=>r.status==='evaluated'))process.exitCode=1;
}
