/** Paired, serial comparisons with fixed preparation and unchanged validation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {cpus} from 'node:os';
import {readCase,hash} from './count-strategy-data.mjs';
import {strategies as available,searchCounts} from './count-strategies.mjs';
import {borderEvidence,countHypotheses,gridFinalists} from '../../static/inverse/core/direct/counts.js';
import {resize} from '../../static/inverse/core/direct/math.js';
import {settings} from '../../static/inverse/core/settings.js';
import {fitDirect} from '../../static/inverse/core/direct/fit.js';
import {finish} from '../../static/inverse/core/engine.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {maskDisagreement} from '../../static/inverse/core/direct/prefer-matching.js';

const arg=name=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3);
const root=arg('corpus')||'tmp/count-strategies/corpus',output=arg('output')||'tmp/count-strategies/'+(arg('stage')||'initialize'),stage=arg('stage')||'initialize';
const policies=(arg('strategies')||available.join(',')).split(','),repeats=Number(arg('repeats')||1);
if(policies.some(p=>!available.includes(p))||!['initialize','solve'].includes(stage)||!Number.isInteger(repeats)||repeats<1)throw new Error('Invalid experiment arguments');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'))),cfg=settings(manifest.settings);
const cases=manifest.cases.filter(e=>(stage==='initialize'||e.fullSolve||arg('all-cases')==='true')&&(!arg('ids')||arg('ids').split(',').includes(e.id))&&(!arg('groups')||arg('groups').split(',').includes(e.group)));
const report={stage,policies,repeats,gitCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runtime:process.version,cpu:cpus()[0].model,manifestSha256:hash(await fs.readFile(path.join(root,'manifest.json'))),settings:cfg,sourceHashes:{},results:[]};
for(const folder of ['static/inverse/core/direct','scripts/inverse'])for(const file of await fs.readdir(folder))if(file.endsWith('.js')||file.startsWith('count-')&&file.endsWith('.mjs'))report.sourceHashes[path.join(folder,file)]=hash(await fs.readFile(path.join(folder,file)));
await fs.mkdir(output,{recursive:true});
if(arg('resume')==='true'){
  const previous=JSON.parse(await fs.readFile(path.join(output,'results.json')));
  for(const field of ['stage','policies','repeats','manifestSha256','settings'])if(JSON.stringify(previous[field])!==JSON.stringify(report[field]))throw new Error(`Cannot resume: ${field} differs`);
  for(const [file,digest] of Object.entries(previous.sourceHashes))if((file.startsWith('static/')||file.endsWith('count-strategies.mjs')||file.endsWith('count-strategy-data.mjs'))&&report.sourceHashes[file]!==digest)throw new Error(`Cannot resume changed numerical code: ${file}`);
  // Only complete case/policy blocks reach results.json. An interrupted block
  // is replayed from fresh inputs, retaining its original rotated policy order.
  report.results=previous.results;
  report.resumes=[...(previous.resumes||[]),{at:new Date().toISOString(),previousCommit:previous.gitCommit,completedRuns:previous.results.length}];
}
const seedSummary=seed=>({counts:seed.model.counts,phase:seed.phase,error:seed.error,score:seed.error+.001*seed.model.counts.reduce((a,b)=>a+b,0),geometrySha256:hash(Buffer.from(seed.model.z.buffer,seed.model.z.byteOffset,seed.model.z.byteLength)),rounds:seed.initializationRounds});
const key=s=>s.counts.join(',')+':'+s.phase;
for(let repeat=0;repeat<repeats;repeat++)for(const [index,e] of cases.entries()){
  if(policies.every(strategy=>report.results.some(r=>r.id===e.id&&r.repeat===repeat&&r.strategy===strategy)))continue;
  const rows=[],offset=(index+repeat)%policies.length,order=[...policies.slice(offset),...policies.slice(0,offset)];
  for(const strategy of order){
    const target=await readCase(root,e),s=target.sourceImage,row={id:e.id,group:e.group,repeat,strategy};rows.push(row);report.results.push(row);
    const attemptStart=performance.now();
    try{
      if(stage==='initialize'){
        const start=performance.now(),fullProb=s.probability,n=Math.min(256,s.resolution),prob=resize(fullProb,s.resolution,n),evidence=borderEvidence(fullProb,s.resolution),options=countHypotheses({prob,n,cfg,evidence});
        const result=searchCounts({fullProb,resolution:s.resolution,prob,n,evidence,options},strategy);row.seconds=(performance.now()-start)/1000;
        row.search=result.report;row.seeds=result.seeds.map(seedSummary);row.finalists=gridFinalists(result.seeds,evidence).map(seedSummary);
      }else{
        const start=performance.now(),solution=await fitDirect(target,cfg,()=>{},{countSearch:ctx=>searchCounts(ctx,strategy)}),answer=finish(solution,cfg);row.seconds=(performance.now()-start)/1000;
        row.initializationSeconds=answer.report.solver.stages?.filter(v=>v.stage==='directInitializing').reduce((sum,v)=>sum+v.seconds,0)??null;
        row.search=answer.report.solver.countSearch;row.counts=answer.report.slits;row.passed=answer.report.templateChecksPassed;row.geometry=answer.report.validation.passed;row.paper=answer.report.manufacturing.status;
        const replay=performance.now(),woven=await renderExportedWeave(answer.files['cut_geometry.json'],s.resolution);row.independentSeconds=(performance.now()-replay)/1000;row.error=maskDisagreement(s,woven.mask);row.features=auditImageFeatures(s,woven.mask,cfg.width).passed;
        row.templateSha256=hash(answer.files['cut_geometry.json']);
        const dir=path.join(output,e.id,`${repeat}-${strategy}`);await fs.mkdir(dir,{recursive:true});
        for(const [file,data] of Object.entries(answer.files))if(['report.json','cut_geometry.json','template_left.svg','template_right.svg'].includes(file))await fs.writeFile(path.join(dir,file),data);
        await fs.writeFile(path.join(dir,'independent.png'),woven.png);
      }
    }catch(error){row.seconds=(performance.now()-attemptStart)/1000;row.failure=error.message;row.failureReport=error.report;row.passed=false;}
    console.log(JSON.stringify({id:e.id,repeat,strategy,seconds:row.seconds,error:row.error,passed:row.passed,failure:row.failure}));
  }
  if(stage==='initialize'){
    const baseline=rows.find(r=>r.strategy==='all');
    if(baseline?.seeds)for(const r of rows)if(r.seeds){
      const indexed=new Map(r.seeds.map(s=>[key(s),s]));
      r.baselineBestRetained=indexed.has(key(baseline.seeds[0]));
      r.baselineFinalistsRetained=baseline.finalists.every(s=>indexed.has(key(s)));
      r.identicalSeeds=r.seeds.length===baseline.seeds.length&&baseline.seeds.every(s=>indexed.get(key(s))?.geometrySha256===s.geometrySha256&&indexed.get(key(s))?.error===s.error);
      r.bestScoreChange=r.seeds[0].score-baseline.seeds[0].score;
    }
  }
  await fs.writeFile(path.join(output,'results.json.tmp'),JSON.stringify(report,null,2));
  await fs.rename(path.join(output,'results.json.tmp'),path.join(output,'results.json'));
}
console.log(output);
