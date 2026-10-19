/** Paired pixel-surrogate timings; this does not measure complete photo fits.
 * Usage: node scripts/inverse/grid-loss-kernel-benchmark.mjs [output-directory]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gridLoss,gridModel} from '../../static/inverse/core/direct/grid.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
const output=process.argv[2]||'tmp/grid-loss-kernel-benchmark',sourceHashes={};
for(const name of ['grid.js','grid-pixels.js','native-grid.js','native/boundary.c','native/boundary.wasm']){
  const file='static/inverse/core/direct/'+name;
  sourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
}
assert.equal((await loadNumericalKernel()).backend,'wasm');
await fs.mkdir(output,{recursive:true});
const report={node:process.version,platform:process.platform,arch:process.arch,sourceHashes,
  scope:'Same models and targets with forced JavaScript/Wasm pixel loss; four alternating-order rounds of twelve calls after warmup. Every result must match exactly. Excludes complete fitting, backend calibration and validation.',rows:[]};
for(const counts of [[3,3],[6,6],[10,11]])for(const n of [96,160])for(const weighted of [false,true])for(const epsilon of [.03,.008]){
  const model=gridModel(counts,16,17),target=Float64Array.from({length:n*n},(_,i)=>(i*19%31)/31),weights=weighted?Float64Array.from(target,(v,i)=>i%7?v:0):null;
  const run=native=>gridLoss(model,target,n,-1,epsilon,{weights,native});
  const expected=run(false);
  for(let i=0;i<4;i++){assert.deepEqual(run(true),expected);assert.deepEqual(run(false),expected);}
  const rounds=[];
  for(let round=0;round<4;round++){
    const row={};
    for(const [name,native]of round%2?[['wasm',true],['javascript',false]]:[['javascript',false],['wasm',true]]){
      const start=performance.now(),batch=[];
      for(let i=0;i<12;i++)batch.push(run(native));
      row[name]=(performance.now()-start)/12;
      for(const result of batch)assert.deepEqual(result,expected);
    }
    rounds.push(row);
  }
  const row={counts,resolution:n,weighted,epsilon,rounds};report.rows.push(row);console.log(JSON.stringify(row));
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}
