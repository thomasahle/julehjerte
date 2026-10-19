import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('release and advisory filters partition tests without swallowing benchmark assertions',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'heart-test-policy-'));
  try{
    const file=path.join(dir,'partition.test.mjs');
    const helper=new URL('./quality-benchmark.mjs',import.meta.url).href;
    await fs.writeFile(file,`import test from 'node:test';\nimport {qualityBenchmark} from ${JSON.stringify(helper)};\ntest('blocking correctness',()=>{});\nqualityBenchmark('missed quality target',()=>{throw new Error('original assertion');});\n`);
    const env={...process.env};delete env.NODE_TEST_CONTEXT;
    const run=args=>spawnSync(process.execPath,['--test','--test-reporter=tap',...args,file],{encoding:'utf8',env});
    const all=run([]),gate=run(['--test-skip-pattern=^benchmark:']),benchmark=run(['--test-name-pattern=^benchmark:']);
    assert.equal(all.status,1,all.stderr);assert.match(all.stdout,/# tests 2\b/);
    assert.equal(gate.status,0,gate.stderr);assert.match(gate.stdout,/# pass 1\b/);assert.doesNotMatch(gate.stdout,/original assertion/);
    assert.equal(benchmark.status,1,benchmark.stderr);assert.match(benchmark.stdout,/original assertion/);
    assert.doesNotMatch(benchmark.stdout,/ok \d+ - blocking correctness\n/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('advisory reporting preserves quality misses but fails on empty or broken runs',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'heart-benchmark-report-'));
  try{
    const file=path.join(dir,'results.tap'),summary=path.join(dir,'summary.md');
    const script=new URL('./quality-benchmark-summary.mjs',import.meta.url);
    for(const {tap,outcome,status} of [
      {tap:"ok 1 - benchmark: solved\nnot ok 2 - benchmark: missed\n  ---\n  code: 'ERR_ASSERTION'\n  ...\n# duration_ms 12\n",outcome:'failure',status:0},
      {tap:'ok 1 - benchmark: solved\n# duration_ms 12\n',outcome:'success',status:0},
      {tap:'# duration_ms 12\n',outcome:'success',status:1},
      {tap:'not ok 1 - broken.test.mjs\n# duration_ms 12\n',outcome:'failure',status:1},
      {tap:'ok 1 - benchmark: solved\n',outcome:'failure',status:1},
      {tap:'ok 1 - benchmark: solved\n# duration_ms 12\n',outcome:'failure',status:1},
      {tap:"not ok 1 - benchmark: missing fixture\n  code: 'ENOENT'\n# duration_ms 12\n",outcome:'failure',status:1},
      {tap:"not ok 1 - benchmark: timed out\n  code: 'ERR_TEST_FAILURE'\n# duration_ms 12\n",outcome:'failure',status:1},
      {tap:'not ok 1 - benchmark: runtime exception\n  name: TypeError\n# duration_ms 12\n',outcome:'failure',status:1},
    ]){
      await fs.writeFile(file,tap);
      const result=spawnSync(process.execPath,[fileURLToPath(script),file],{encoding:'utf8',env:{...process.env,GITHUB_STEP_SUMMARY:summary,BENCHMARK_OUTCOME:outcome}});
      assert.equal(result.status,status,result.stderr||result.stdout);
    }
    assert.match(await fs.readFile(summary,'utf8'),/1\/2 passed; 1 missed/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
