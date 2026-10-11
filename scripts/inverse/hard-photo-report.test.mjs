import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {writeHardPhotoReport} from './hard-photo-report.mjs';

test('missing crops and input errors stay in the complete-heart denominator',async()=>{
  await fs.mkdir('tmp',{recursive:true});const dir=await fs.mkdtemp('tmp/hard-photo-report-test-');
  try{
    const data={runId:'fixture',cropMode:'automatic',results:[
      {id:'passed',label:'Passed',cropStatus:'visually_reviewed',status:'validated',runs:[{preset:'automatic',status:'validated',passed:true,direct:true,seconds:1,independentImageError:.01}]},
      {id:'no-crop',label:'No crop',cropStatus:'visually_reviewed',status:'no_crop',hasSourcePreview:true,runs:[]},
      {id:'input',label:'Missing input',cropStatus:'visually_reviewed',status:'input_error',message:'<missing>',runs:[]},
      {id:'partial',label:'Partial',cropStatus:'incomplete',status:'incomplete',runs:[]}
    ]};
    await fs.writeFile(dir+'/results.json',JSON.stringify(data));const html=await fs.readFile(await writeHardPhotoReport(dir+'/results.json'),'utf8');
    assert.match(html,/1 \/ 3 complete motifs produced an accepted pair/);
    assert.match(html,/Inventory: 4; partial or obscured: 1; reconstruction attempted: 1/);
    assert.match(html,/No automatic crop was found/);assert.match(html,/no-crop\/source.png/);
    assert.doesNotMatch(html,/no-crop\/crop.png/);assert.match(html,/&lt;missing&gt;/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
