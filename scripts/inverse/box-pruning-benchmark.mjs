/** Compare geometry-query costs against a historical engine, preserving outputs. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Cubic} from '../../static/inverse/core/bezier.js';
import * as after from '../../static/inverse/core/geometry.js';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const revision=args.baseline||'2a147c7',output=args.output||'tmp/geometry-pruning.json';
assert.match(revision,/^[a-f0-9]{7,40}$/,'Use a commit hash for --baseline');
const file='static/inverse/core/geometry.js',fixtureFile='scripts/inverse/fixtures/floral-checker-refinement-checkpoint.json';
const baseline=execFileSync('git',['show',`${revision}:${file}`],{encoding:'utf8'});
const bezierFile='static/inverse/core/bezier.js';
assert.deepEqual(execFileSync('git',['show',`${revision}:${bezierFile}`]),await fs.readFile(bezierFile),
  'The shared distance primitives must match the baseline revision');
// Resolve the historical module's sole relative dependency without modifying
// either checkout. The public distance/segment primitives are unchanged.
assert.equal(baseline.split("'./bezier.js'").length,2);
const source=baseline.replace("'./bezier.js'",JSON.stringify(new URL('../../static/inverse/core/bezier.js',import.meta.url).href));
const before=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const fixtureBytes=await fs.readFile(fixtureFile),fixture=JSON.parse(fixtureBytes);
const lines=fixture.paths.flat().map(p=>p.flatMap((c,i)=>new Cubic(c).flatten(.01).slice(i?1:0)));
const curves=fixture.paths.flat(2).map(p=>new Cubic(p).flatten(.01));
const pairs=lines.flatMap((a,i)=>lines.slice(i+1).map(b=>[a,b]));
const operations={
  clearance:api=>pairs.map(([a,b])=>api.lineDistance(a,b,2.505)),
  intersections:api=>pairs.map(([a,b])=>api.lineHits(a,b)),
  simplicity:api=>lines.map(p=>api.lineSimple(p)),
  neighbours:api=>[...api.nearbyPairs(curves,2.505)],
};
const results=[],repeats=7,iterations=10;
const median=values=>values.toSorted((a,b)=>a-b)[Math.floor(values.length/2)];
for(const [name,run]of Object.entries(operations)){
  const expected=run(before);assert.deepEqual(run(after),expected,name);
  const timesMs={before:[],after:[]};
  for(let repeat=0;repeat<repeats;repeat++)for(const kind of repeat%2?['after','before']:['before','after']){
    const start=performance.now();
    for(let i=0;i<iterations;i++)run(kind==='before'?before:after);
    timesMs[kind].push((performance.now()-start)/iterations);
  }
  const beforeMs=median(timesMs.before),afterMs=median(timesMs.after);
  results.push({name,equalOutputs:true,timesMs,beforeMs,afterMs,speedup:beforeMs/afterMs});
  console.log(`${name}: ${beforeMs.toFixed(3)} → ${afterMs.toFixed(3)} ms (${(beforeMs/afterMs).toFixed(2)}×)`);
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const evidence={baselineRevision:revision,baselineGeometrySha256:hash(baseline),geometrySha256:hash(await fs.readFile(file)),fixtureFile,fixtureSha256:hash(fixtureBytes),node:process.version,platform:process.platform,architecture:process.arch,repeats,iterations,results,scope:'Interleaved geometry-query microbenchmark, not whole-solve speedup. Exact outputs are compared before timing.'};
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,JSON.stringify(evidence,null,2)+'\n');
