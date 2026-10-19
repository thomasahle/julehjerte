/** Sequential paired tests with unchanged inputs/budgets and recorded exports.
 * No production imports use the observer. Run with Node 22, for example:
 * node scripts/inverse/checkpoint-policy-benchmark.mjs --cases stacked,bicycle
 * Optional --baseline REF --candidate REF --rounds N --output DIRECTORY.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';

const options=Object.fromEntries(process.argv.slice(2).reduce((pairs,arg,i,args)=>i%2?pairs:[...pairs,[arg.replace(/^--/,''),args[i+1]]],[]));
const cases=[
 ['handoff','clearance-feature-handoff','^fresh fitting continues'],
 ['stacked','clearance-feature','resampled mask'],
 ['late-stacked','clearance-feature-late','^late clearance'],
 ['viking','clearance-feature-budget','^a simpler seed'],
 ['bicycle','feature-finalists','^a lower-error finalist'],
 ['circles','curved-contact-recovery','^fresh automatic fitting repairs|^an exhausted corner MILP'],
 ['stars','deferred-routing','^hard-bibel-star-outline:|^hard-bibel-star-outline-jpeg75:'],
 ['bird','fitted-rerouting','^a fresh shifted bird.*10-second'],
 ['near-miss','feature-near-miss','^the original.*1.5x clock|^the vertical.*1.5x clock'],
 ['late-routing','late-routing-repair','^a late routing candidate'],
 ['routing','search-scheduling','^fresh frozen routing|^fresh synthetic-control routing'],
 ['bauble','coverage-recovery','^an invalid feature proposal'],
 ['puppy','feature-seeds','^early feature routing recovers|^a one-pixel crop shift'],
].filter(([id])=>!options.cases||options.cases.split(',').includes(id));
if(!cases.length)throw new Error('No comparison cases selected.');
const rounds=Number(options.rounds||1);
if(!Number.isInteger(rounds)||rounds<1||rounds>4)throw new Error('Use one to four bounded rounds.');
const output=options.output||'tmp/checkpoint-policy-study/paired',baseline=options.baseline||'bb667e2b',candidate=options.candidate||'ce6ef218';
await fs.mkdir(output,{recursive:true});
const results=[];
const execute=async(args,env,log)=>{
 const file=await fs.open(log,'w');
 try{return await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{env,stdio:['ignore',file.fd,file.fd]});
  child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal}));
 });}finally{await file.close();}
};
for(let round=0;round<rounds;round++)for(const [index,[id,file,pattern]]of cases.entries()){
 const variants=[['baseline',baseline],['candidate',candidate]];
 if((round+index)%2)variants.reverse();
 for(const [label,revision]of variants){
  const directory=path.join(output,`${round}-${id}-${label}`);await fs.mkdir(directory,{recursive:true});
  const started=Date.now(),log=path.join(directory,'test.log');
  const exit=await execute(['--import','./scripts/inverse/diagnostics/checkpoint-policy-observer.mjs','--test','--test-concurrency=1',`--test-name-pattern=${pattern}`,`scripts/inverse/${file}.test.mjs`],
   {...process.env,CHECKPOINT_BASELINE:revision,CHECKPOINT_OUTPUT:directory},log);
  const text=await fs.readFile(log,'utf8'),count=name=>Number(text.match(new RegExp(`^# ${name} (\\d+)`,'m'))?.[1]||0);
  const row={round,id,label,revision,seconds:(Date.now()-started)/1000,...exit,passed:count('pass'),failed:count('fail'),log,audits:[]};
  for(const record of(await fs.readdir(directory)).filter(f=>f.endsWith('.json.gz'))){
   const recordPath=path.join(directory,record),auditLog=recordPath.replace('.json.gz','.audit.log');
   const audit=await execute(['scripts/inverse/checkpoint-policy-audit.mjs',recordPath,'--fixed'],process.env,auditLog);
   row.audits.push({file:recordPath.replace('.json.gz','.audit.json'),...audit});
  }
  results.push(row);await fs.writeFile(path.join(output,'summary.json'),JSON.stringify({baseline,candidate,rounds,results},null,2)+'\n');
  console.log(JSON.stringify(row));
 }
}
