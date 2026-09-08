import fs from 'node:fs/promises';
import path from 'node:path';
const arg=name=>process.argv.find(s=>s.startsWith('--'+name+'='))?.slice(name.length+3);
const screen=JSON.parse(await fs.readFile(path.join(arg('screen')||'tmp/count-strategies/screen','results.json')));
const solve=arg('solve')?JSON.parse(await fs.readFile(path.join(arg('solve'),'results.json'))):null;
const median=a=>{const s=a.slice().sort((a,b)=>a-b);return s.length?(s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2:null;};
const key=r=>r.id+':'+r.repeat,baseline=new Map(screen.results.filter(r=>r.strategy==='all').map(r=>[key(r),r]));
const summary={screen:{cases:new Set(screen.results.map(r=>r.id)).size,repetitions:screen.repeats,policies:[],sourceHashes:screen.sourceHashes},solve:null};
for(const policy of screen.policies){
 const rows=screen.results.filter(r=>r.strategy===policy),paired=rows.filter(r=>baseline.has(key(r))&&r.seconds!==undefined);
 summary.screen.policies.push({policy,runs:rows.length,medianSeconds:median(rows.map(r=>r.seconds).filter(v=>v!==undefined)),medianPairedTimeRatio:median(paired.map(r=>r.seconds/baseline.get(key(r)).seconds)),identicalSeeds:rows.filter(r=>r.identicalSeeds).length,baselineBestRetained:rows.filter(r=>r.baselineBestRetained).length,baselineFinalistsRetained:rows.filter(r=>r.baselineFinalistsRetained).length,failures:rows.filter(r=>r.failure).map(r=>({id:r.id,reason:r.failure})),misses:rows.filter(r=>!r.baselineBestRetained).map(r=>({id:r.id,repeat:r.repeat,scoreChange:r.bestScoreChange,old:baseline.get(key(r))?.seeds?.[0]?.counts,next:r.seeds?.[0]?.counts}))});
}
if(solve){
 const base=new Map(solve.results.filter(r=>r.strategy==='all').map(r=>[key(r),r]));
 summary.solve={cases:new Set(solve.results.map(r=>r.id)).size,repetitions:solve.repeats,policies:[],sourceHashes:solve.sourceHashes};
 for(const policy of solve.policies){
  const rows=solve.results.filter(r=>r.strategy===policy),paired=rows.filter(r=>base.has(key(r))),valid=paired.filter(r=>r.passed&&base.get(key(r)).passed);
  summary.solve.policies.push({policy,runs:rows.length,passed:rows.filter(r=>r.passed).length,medianSeconds:median(rows.map(r=>r.seconds).filter(v=>v!==undefined)),totalSeconds:rows.reduce((s,r)=>s+(r.seconds||0),0),medianPairedTimeRatio:median(paired.filter(r=>r.seconds!==undefined&&base.get(key(r)).seconds!==undefined).map(r=>r.seconds/base.get(key(r)).seconds)),lostPasses:paired.filter(r=>base.get(key(r)).passed&&!r.passed).map(r=>r.id),gainedPasses:paired.filter(r=>!base.get(key(r)).passed&&r.passed).map(r=>r.id),medianValidErrorChange:median(valid.map(r=>r.error-base.get(key(r)).error)),maximumValidErrorIncrease:Math.max(0,...valid.map(r=>r.error-base.get(key(r)).error)),cases:paired.map(r=>({id:r.id,group:r.group,repeat:r.repeat,seconds:r.seconds,passed:r.passed,error:r.error,errorChange:r.error===undefined||base.get(key(r)).error===undefined?null:r.error-base.get(key(r)).error,counts:r.counts,failure:r.failure}))});
 }
}
const output=arg('output')||'tmp/count-strategies/summary.json';await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(summary,null,2));
for(const section of ['screen','solve'])if(summary[section])for(const p of summary[section].policies)console.log(section,JSON.stringify({...p,cases:undefined,misses:undefined,sourceHashes:undefined}));
