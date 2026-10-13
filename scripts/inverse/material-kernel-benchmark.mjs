/** Compare complete guarded paper audits of fixed geometry, including every
 * map pixel and fold interval. Saved templates are validator inputs only;
 * no image fitter is run or initialized from them by this benchmark.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {cpus} from 'node:os';
import {materialAudit,paperKernelChoices} from '../../static/inverse/core/material.js';
import {loadNumericalKernel,numericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {fixture} from './fixtures.mjs';

const arg=name=>process.argv.find(s=>s.startsWith(`--${name}=`))?.slice(name.length+3);
const reference=arg('reference')||'0a30976',output=arg('output')||'tmp/material-kernel',rounds=Number(arg('rounds')||3);
const backend=arg('native')||'auto';
assert.ok(['auto','javascript','wasm'].includes(backend),'native must be auto, javascript or wasm');
const auditOptions={includeMaps:true,native:backend==='auto'?'auto':backend==='wasm'};
const hunodan=arg('hunodan')||'tmp/image-reuse-hunodan-replay',weighted=arg('weighted')||'tmp/image-reuse-weighted';
assert.ok(Number.isInteger(rounds)&&rounds>=1&&rounds<=20);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const previousFile=file=>execFileSync('git',['show',`${reference}:${file}`]);
const previousSource=previousFile('static/inverse/core/material.js').toString();
// The distance helper is itself under test. Load the historical implementation
// for the reference audit instead of silently sharing the modified helper.
const previousChord=previousSource.includes("from './chord-distance.js'")?previousFile('static/inverse/core/chord-distance.js'):null;
if(previousChord)assert.ok(!/\bimport\b/.test(previousChord.toString()),'Historical chord helper must be self-contained.');
const dependencies=['bezier.js','graph.js','geometry.js','validate.js','settings.js',
  ...['paper-backend.js'].filter(name=>previousSource.includes(`from './${name}'`)),
  ...(previousSource.includes("from './numerical-kernel.js'")?['numerical-kernel.js','direct/native/boundary.c','direct/native/boundary.wasm']:[])];
for(const name of dependencies){const file='static/inverse/core/'+name;assert.equal(hash(await fs.readFile(file)),hash(previousFile(file)),`Changed reference dependency: ${file}`);}
const previous=(await import('data:text/javascript;base64,'+Buffer.from(previousSource.replace(/from '(\.[^']+)'/g,(_,p)=>`from '${p==='./chord-distance.js'?'data:text/javascript;base64,'+previousChord.toString('base64'):pathToFileURL(path.resolve('static/inverse/core',p)).href}'`)).toString('base64'))).materialAudit;
assert.equal((await loadNumericalKernel()).backend,'wasm');
assert.equal(typeof numericalKernel().distance_transform,'function');assert.equal(typeof numericalKernel().label_core,'function');
await fs.mkdir(output,{recursive:true});
const cases=[];
for(const name of['straight','neck','thin'])for(const resolution of[80,180,360,700])cases.push({id:`${name}-${resolution}`,group:'controlled',solution:fixture(name),cfg:settings({width:60,materialResolution:resolution,cutError:0,printShrinkPercent:0,minWidth:3})});
cases.push({id:'thin-uncertain',group:'controlled',solution:fixture('thin'),cfg:settings({width:60,materialResolution:80,cutError:0,printShrinkPercent:0,minWidth:.7})});
for(const name of['neck','thin'])cases.push({id:`matching-${name}`,group:'controlled',solution:fixture(name,{matching:true}),cfg:settings({width:60,materialResolution:80,cutError:0,printShrinkPercent:0,minWidth:name==='thin'?.7:3})});
const hatFile='scripts/inverse/fixtures/free-border-hat.json',hatBytes=await fs.readFile(hatFile);
cases.push({id:'matching-hat',group:'matching-hat',source:hatFile,sourceSha256:hash(hatBytes),solution:loadSolutionJSON(JSON.parse(hatBytes).geometry),cfg:settings({...AUTOMATIC_PRESET,timeLimit:10,trials:0})});
const birdFile='scripts/inverse/fixtures/bird-y-clamped-proposal.json',birdBytes=await fs.readFile(birdFile);
for(const materialResolution of [360,700])cases.push({id:`bird-${materialResolution}`,group:'dense-photo',source:birdFile,sourceSha256:hash(birdBytes),solution:loadSolutionJSON(birdBytes.toString()),cfg:settings({...AUTOMATIC_PRESET,materialResolution,trials:0})});
for(const[dir,group]of[[hunodan,'hunodan'],[weighted,'weighted']]){
  const saved=JSON.parse(await fs.readFile(`${dir}/results.json`));
  for(const row of saved.results){
    const id=group==='hunodan'?row.id:`${row.shape}-${row.size}-${row.strategy}${row.variant==='original'?'':`-${row.variant}`}`;
    const file=`${dir}/${id}/cut_geometry.json`,bytes=await fs.readFile(file);
    cases.push({id,group,source:file,sourceSha256:hash(bytes),solution:loadSolutionJSON(bytes.toString()),cfg:settings({...AUTOMATIC_PRESET,timeLimit:10,trials:0})});
  }
}
const sourceHashes={};
for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){
  const file=`static/inverse/core/${name}`;sourceHashes[file]=hash(await fs.readFile(file));
}
const compact=result=>({...result,families:result.families.map(f=>({...f,map:undefined,mapSha256:hash(f.map)})),summary:{...result.summary,seconds:undefined}});
const median=xs=>{const s=xs.toSorted((a,b)=>a-b);return(s[Math.floor((s.length-1)/2)]+s[Math.ceil((s.length-1)/2)])/2;};
const report={reference,runtime:process.version,cpu:cpus()[0]?.model,rounds,backend,sourceHashes,previousMaterialSha256:hash(previousSource),previousChordSha256:previousChord?hash(previousChord):null,method:'Serial alternating-order complete audits, including maps. Both policies are warmed once. Kernel load, input loading, comparison and hashing are outside each audit timer. Both receive the same requested backend. The reference uses its historical chord helper. Only elapsed time is excluded from exact output equality.',results:[]};
for(const audit of[previous,materialAudit])audit(cases[0].solution,cases[0].cfg,auditOptions);
for(const[index,entry]of cases.entries()){
  const row={id:entry.id,group:entry.group,source:entry.source,sourceSha256:entry.sourceSha256,cfg:entry.cfg,runs:[]};report.results.push(row);
  for(let round=0;round<rounds;round++){
    const values={},timings={};
    for(const policy of(index+round)%2?['current','previous']:['previous','current']){
      const start=performance.now();values[policy]=(policy==='current'?materialAudit:previous)(entry.solution,entry.cfg,auditOptions);timings[policy]=(performance.now()-start)/1000;
      delete values[policy].summary.seconds;
    }
    assert.deepEqual(values.current,values.previous,`${entry.id}, round ${round}`);
    row.runs.push({...timings,saving:1-timings.current/timings.previous});
    row.result=compact(values.current);row.identical=true;
  }
  row.previousMedianSeconds=median(row.runs.map(r=>r.previous));row.currentMedianSeconds=median(row.runs.map(r=>r.current));row.medianPairedSaving=median(row.runs.map(r=>r.saving));
  console.log(JSON.stringify({id:row.id,status:row.result.status,previous:row.previousMedianSeconds,current:row.currentMedianSeconds,saving:row.medianPairedSaving,identical:true}));
  await fs.writeFile(`${output}/results.json`,JSON.stringify(report,null,2)+'\n');
}
report.summary={cases:cases.length,allIdentical:true,medianPairedSaving:median(report.results.map(r=>r.medianPairedSaving)),groups:Object.fromEntries([...new Set(cases.map(e=>e.group))].map(group=>{const rows=report.results.filter(r=>r.group===group);return[group,{cases:rows.length,previousMedianSeconds:median(rows.map(r=>r.previousMedianSeconds)),currentMedianSeconds:median(rows.map(r=>r.currentMedianSeconds)),medianPairedSaving:median(rows.map(r=>r.medianPairedSaving))}];}))};
report.paperKernels=paperKernelChoices();
await fs.writeFile(`${output}/results.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
