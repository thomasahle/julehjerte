/** Diagnose whether denser boundary subdivision displaces known connectors.
 * Missing reference edges do not prove that all valid alternative routes are
 * absent. This script performs no solve and never changes production settings.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Cubic} from '../../../static/inverse/core/bezier.js';
import {buildGraph,loadSolutionJSON} from '../../../static/inverse/core/graph.js';
import {settings} from '../../../static/inverse/core/settings.js';
import {curveKey} from '../../../static/inverse/core/symmetry.js';
import {oracleGraphVariants,explainMissingConnectors} from './graph-oracle.mjs';
import {closestCurvePoint,sampleCubicBoundary} from './graph-boundary-ablations.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
if(!args.run||!args.output)throw new Error('Provide --run=<boundary-study-directory> and --output=<new-json-file>.');
const bytes=await fs.readFile(path.join(args.run,'results.json')),input=JSON.parse(bytes),cfg=settings(input.settings);
if(input.study!=='boundaries')throw new Error('This diagnostic requires the boundary/junction study.');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sourceHashes={};
for(const [file,expected] of Object.entries(input.sourceHashes)){
  sourceHashes[file]=hash(await fs.readFile(file));if(sourceHashes[file]!==expected)throw new Error(`Study source changed: ${file}`);
}
sourceHashes['scripts/inverse/experiments/graph-pool-diagnostic.mjs']=hash(await fs.readFile('scripts/inverse/experiments/graph-pool-diagnostic.mjs'));
const report={input:args.run,inputReportSha256:hash(bytes),sourceHashes,meaning:'Track direct availability of one validated reference routing, not feasibility of every alternative routing.',results:[],boundaryChangeChecks:[]};
const readBoundary=async(id,name)=>{
  const saved=JSON.parse(await fs.readFile(path.join(args.run,`${id}-${name}-boundary.json`)));
  return{width:saved.width,phase:saved.phase,metadata:{},curves:saved.curves.map(p=>new Cubic(p))};
};
for(const row of input.results){
  if(row.status!=='evaluated')continue;
  const reference=loadSolutionJSON(await fs.readFile(path.join(args.run,`${row.id}-reference.json`),'utf8'));
  const witness=oracleGraphVariants(reference,cfg)[1].witness,selected=new Set(witness.paths.flat(2).map(([edge])=>edge));
  const known={graph:{...witness.graph,edges:witness.graph.edges.filter((_,i)=>selected.has(i))}};
  const result={id:row.id,knownHiddenConnectors:known.graph.edges.filter(e=>!e.visible).length,variants:[]};report.results.push(result);
  for(const name of ['exact-boundary-heuristic','exact-boundary-merged-lines','exact-boundary-merged-lines-uniform']){
    const record=row.variants.find(v=>v.name===name);if(!record?.graph){result.variants.push({name,studyStatus:record?.status});continue;}
    const graph=buildGraph(await readBoundary(row.id,name),cfg,{node:false});
    for(const key of ['visibleEdges','hiddenCandidates','vertices'])if(graph.metadata[key]!==record.graph[key])throw new Error(`Graph reconstruction differs: ${row.id}/${name}/${key}`);
    const missing=explainMissingConnectors(known,graph,cfg),previous=result.variants.at(-1),baseline=previous?.missing||[];
    const alreadyAbsent=new Set(baseline.map(r=>curveKey(r.controlPoints)));
    result.variants.push({name,comparedWith:previous?.name,graph:graph.metadata,missing,newlyMissing:previous?missing.filter(r=>!alreadyAbsent.has(curveKey(r.controlPoints))):[],studyStatuses:row.variants.filter(v=>v.name===name).map(v=>v.status)});
  }
  for(const variant of row.variants.filter(v=>v.repeat===0&&v.graph&&v.diagnostics?.boundaryChangePixels)){
    const baseline=variant.name.startsWith('exact-')?'exact-boundary-heuristic':variant.name.startsWith('raster-clean')?'raster-clean':'raster-heuristic';
    const before=await readBoundary(row.id,baseline),after=await readBoundary(row.id,variant.name);
    const a=sampleCubicBoundary(before,400),b=sampleCubicBoundary(after,400),pixels=[];
    for(let i=0;i<a.length;i++)if(a[i]!==b[i]){
      const point=[(i%400+.5)*before.width/400,(Math.floor(i/400)+.5)*before.width/400];
      const nearest=target=>Math.min(...target.curves.map(c=>closestCurvePoint(c,point).distance));
      const beforeDistanceMm=nearest(before),afterDistanceMm=nearest(after);
      pixels.push({pixel:[i%400,Math.floor(i/400)],beforeDistanceMm,afterDistanceMm,onBothBoundaries:Math.max(beforeDistanceMm,afterDistanceMm)<=1e-7});
    }
    report.boundaryChangeChecks.push({id:row.id,name:variant.name,baseline,recordedChangePixels:variant.diagnostics.boundaryChangePixels,replayedChangePixels:pixels.length,pixels});
  }
}
await fs.writeFile(args.output,JSON.stringify(report,null,2)+'\n');
console.log({cases:report.results.length,uniformLostKnownConnections:report.results.filter(r=>r.variants.at(-1)?.newlyMissing?.length).length});
