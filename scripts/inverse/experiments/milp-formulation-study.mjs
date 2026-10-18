/** Serial, fixed-graph first-candidate experiments. Never used by production.
 * Rebuilds both perturbations from their masks; saved proposal curves are ignored.
 * Candidates may violate geometry and never count as validated reconstructions.
 * node scripts/inverse/experiments/milp-formulation-study.mjs STUDY OUTPUT_DIR
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {prepare} from '../../../static/inverse/core/engine.js';
import {preprocessMask} from '../../../static/inverse/core/input.js';
import {settings} from '../../../static/inverse/core/settings.js';
import {buildGraph,solutionJSON} from '../../../static/inverse/core/graph.js';

const output=path.resolve(process.argv[3]||'tmp/milp-formulation-study');
await fs.mkdir(output,{recursive:true});
const solverURL=pathToFileURL(path.resolve('static/inverse/core/solver.js'));
const raw=await fs.readFile(solverURL,'utf8');
const fixtureBytes=await fs.readFile('scripts/inverse/fixtures/sloth-clearance-routing.json'),fixture=JSON.parse(fixtureBytes);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const provenance={node:process.version,solverSourceSha256:hash(raw),fixtureSha256:hash(fixtureBytes)};
function replaceOnce(source,anchor,replacement){
  if(source.split(anchor).length!==2)throw new Error('Experimental solver anchor changed: '+anchor);
  return source.replace(anchor,replacement);
}
const study=process.argv[2]||'integrality';
if(!['integrality','label-bounds','flow-bounds'].includes(study))throw new Error('Study must be integrality, label-bounds or flow-bounds.');
const modules={};
for(const mode of study==='flow-bounds'?['baseline','flow-unit','flow-distance']:study==='label-bounds'?['baseline','tight-propagation','tight-labels']:['baseline','continuous-directions','continuous-membership']){
  // Change only the native binary flags; retain every original binary residual check.
  const mutation=mode==='baseline'||study!=='integrality'?'':mode==='continuous-directions'
    ?'for(const family of z)for(const directions of family)for(const j of directions)data.integrality[j]=0;'
    :'for(const family of x)for(const j of family)data.integrality[j]=0;';
  let variant=raw;
  if(mode==='tight-propagation'||mode==='tight-labels')variant=replaceOnce(variant,'M=Math.max(1,K)','M=Math.max(0,K-1)');
  if(mode==='tight-labels')variant=replaceOnce(variant,'M=Math.max(1,endpoints[k].sources.length)','M=Math.max(0,endpoints[k].sources.length-1)');
  if(mode==='flow-unit'||mode==='flow-distance'){
    variant=replaceOnce(variant,'if(m.cost.length>80000',`for(const k of [0,1]){
      const distances=new Array(V).fill(Infinity), queue=endpoints[k].sinks.slice();
      for(const v of queue)distances[v]=0;
      for(let head=0;head<queue.length;head++)for(const e of graph.incident[queue[head]]){
        if(m.ub[x[k][e]]===0)continue;
        const item=graph.edges[e],other=item.u===queue[head]?item.v:item.u;
        if(distances[other]!==Infinity)continue;
        distances[other]=distances[queue[head]]+1;queue.push(other);
      }
      for(let e=0;e<E;e++)for(const d of [0,1]){
        const head=d===0?graph.edges[e].v:graph.edges[e].u;
        const lower=${mode==='flow-unit'?'1':'Number.isFinite(distances[head])?distances[head]+1:V+1'};
        m.row([[flow[k][e][d],1],[z[k][e][d],-lower]],0,Infinity);
      }
    }\nif(m.cost.length>80000`);
  }
  const source=replaceOnce(variant,'const data=m.data();',`const data=m.data();${mutation}`)
    .replace(/from '([^']+)'/g,(_,specifier)=>`from '${new URL(specifier,solverURL).href}'`)
    .replaceAll('import.meta.url',JSON.stringify(solverURL.href));
  modules[mode]=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  await modules[mode].solverRuntime();
}
const records=[];
for(const pass of [0,1])for(const entry of fixture.cases){
  const mask=new Uint8Array(entry.resolution**2);
  for(const [start,length]of entry.maskRuns)mask.fill(1,start,start+length);
  if(createHash('sha256').update(mask).digest('hex')!==entry.maskSha256)throw new Error('Mask changed');
  for(const mode of pass?Object.keys(modules).reverse():Object.keys(modules)){
    const cfg=settings({...fixture.configuration,invert:false,removeSpecks:0,fillHoles:0,neighbors:8,connectorVariants:1,timeLimit:3.5,maxRounds:1});
    const input=prepare({type:'mask',mask,resolution:entry.resolution},cfg).target;
    const target=preprocessMask(mask,entry.resolution,{...cfg,algorithm:'trace',fitTolerance:.75,smoothRadius:.3,snapRadius:1.5,maxSpan:30,borderRadius:3},input.metadata.preprocessing);
    target.sourceImage=input.sourceImage;
    const graph=buildGraph(target,cfg), record={id:entry.id,pass,mode,graph:graph.metadata,
      maskSha256:entry.maskSha256,configuration:cfg,
      graphHash:createHash('sha256').update(JSON.stringify(graph.edges.map(e=>({visible:e.visible,p:e.curve.p})))).digest('hex'),
      nativeBinaries:graph.edges.length*(mode==='continuous-directions'?2:mode==='continuous-membership'?4:6)};
    const started=performance.now();
    try{
      const answer=await modules[mode].solveGraph(graph,cfg,{coefficientQuantum:1e-7,stopAfterValidated:true,
        onRejectedCandidate(proposal,timing){record.firstRejected=timing;record.candidate=solutionJSON(proposal);return true;}});
      record.report=answer.report;record.candidate=solutionJSON(answer);
    }catch(error){record.error=error.message;record.report=error.report;}
    record.seconds=(performance.now()-started)/1000;
    records.push(record);
    await fs.writeFile(path.join(output,study+'-pilot.json'),JSON.stringify({study,scope:'First integer proposal, not complete template acceptance',provenance,records},null,2));
    console.log(JSON.stringify({id:record.id,pass,mode,binaries:record.nativeBinaries,seconds:record.seconds,first:record.report?.history?.[0],candidate:!!record.candidate,termination:record.report?.termination}));
  }
}
