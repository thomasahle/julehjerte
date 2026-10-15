/** Keep an intermittent photographic test failure reproducible after its process exits. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export async function assertFitError({error,maximum,answer,source,resolution,context={},output='tmp/inverse-test-failures'}){
  if(error<maximum)return;
  let diagnostic;
  try{
    await fs.mkdir(output,{recursive:true});
    const directory=await fs.mkdtemp(path.join(output,'fit-'));
    const array=value=>value?{type:value.constructor.name,values:Array.from(value)}:null;
    const files={
      'source.json':JSON.stringify({resolution:source.resolution,mask:array(source.mask),probability:array(source.probability),weights:array(source.weights),validMask:array(source.validMask),seedCells:source.seedCells}),
      'report.json':JSON.stringify(answer.report,null,2),
      'cut_geometry.json':answer.files['cut_geometry.json'],
      'failure.json':JSON.stringify({schema:'woven-heart-test-failure-1',error,maximum,resolution,context,
        note:'Captured after fitting, before the original strict error assertion. Source values are observations, not original artwork or cutting-path ground truth.'},null,2),
    };
    const hashes={};
    for(const [name,text]of Object.entries(files)){
      await fs.writeFile(path.join(directory,name),text);
      hashes[name]=createHash('sha256').update(text).digest('hex');
    }
    await fs.writeFile(path.join(directory,'checksums.json'),JSON.stringify(hashes,null,2)+'\n');
    diagnostic=`Captured fit: ${directory}`;
  }catch(failure){
    // A failed diagnostic write must not hide or replace the fidelity failure.
    diagnostic=`Could not save the failed fit: ${failure.message}`;
  }
  assert.ok(error<maximum,`Independent ${resolution}-pixel disagreement is ${error}; required < ${maximum}. ${diagnostic}`);
}
