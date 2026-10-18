import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

async function rejected(origin,method,message){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'heart-probe-origin-'));
  try{
    await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify({schema:'woven-heart-foreground-probe-1',status:'complete',rows:[],fieldOrigin:origin}));
    const output=path.join(root,'out'),result=spawnSync(process.execPath,['scripts/inverse/learning/foreground-replay.mjs',`--probe=${root}`,`--output=${output}`,`--methods=${method}`],{encoding:'utf8'});
    assert.notEqual(result.status,0);assert.match(result.stderr,message);
    await assert.rejects(fs.access(output),'Reject mislabeled evidence before creating a result directory');
  }finally{await fs.rm(root,{recursive:true,force:true});}
}

test('reviewed body bounds cannot be reported as learned predictions or exact synthetic oracle fields',async()=>{
  const origin={kind:'reviewed-annotation-bound',includeUnknown:false,diagnosticOnly:true};
  await rejected(origin,'learned',/diagnostic only/);
  await rejected(origin,'oracle',/diagnostic only/);
});

test('annotation replay requires explicit diagnostic provenance and an uncertainty policy',async()=>{
  await rejected(null,'annotation',/explicitly diagnostic/);
  await rejected({kind:'reviewed-annotation-bound',includeUnknown:false},'annotation',/explicitly diagnostic/);
  await rejected({kind:'reviewed-annotation-bound',includeUnknown:'false',diagnosticOnly:true},'annotation',/explicitly diagnostic/);
});
